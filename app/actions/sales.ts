'use server'

import { db } from '@/lib/db'
import { products, sales, stockMovements, customers } from '@/lib/db/schema'
import { requirePermission } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { getEffectiveRate, computeBrl } from '@/lib/exchange'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export type SaleKind = 'sale' | 'quote'

export async function getSales(limit = 300) {
  await requirePermission('sales', 'view')
  return db
    .select({
      id: sales.id,
      productId: sales.productId,
      productName: products.name,
      sku: products.sku,
      kind: sales.kind,
      quantity: sales.quantity,
      unitPriceUsd: sales.unitPriceUsd,
      unitCostUsd: sales.unitCostUsd,
      exchangeRate: sales.exchangeRate,
      currencyProtectionPct: sales.currencyProtectionPct,
      marginPct: sales.marginPct,
      totalUsd: sales.totalUsd,
      totalBrl: sales.totalBrl,
      profitBrl: sales.profitBrl,
      customer: sales.customer,
      customerId: sales.customerId,
      customerName: customers.name,
      convertedAt: sales.convertedAt,
      createdAt: sales.createdAt,
    })
    .from(sales)
    .leftJoin(products, eq(sales.productId, products.id))
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .orderBy(desc(sales.createdAt))
    .limit(limit)
}

type RegisterInput = {
  productId: number
  quantity: number
  unitPriceUsd: number
  kind?: SaleKind
  // Cliente: vínculo com cadastro (customerId) e/ou texto livre (customer).
  customerId?: number | null
  customer?: string
  // Margem (%) informada manualmente pelo vendedor. Se ausente, é calculada.
  marginPct?: number
  // Cotação manual (USD->BRL) para esta operação. Se ausente, usa a do dia.
  manualRate?: number | null
}

/**
 * Registra uma venda finalizada OU um orçamento. Ambos dão baixa/reserva de
 * estoque imediatamente. Orçamentos podem ser convertidos em venda depois
 * (sem nova baixa) ou cancelados (devolvendo o estoque).
 */
export async function registerSale(input: RegisterInput) {
  const ctx = await requirePermission('sales', 'create')

  const kind: SaleKind = input.kind === 'quote' ? 'quote' : 'sale'

  if (input.quantity <= 0) throw new Error('A quantidade deve ser positiva')
  if (input.unitPriceUsd <= 0) throw new Error('O preço de venda deve ser positivo')

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
  if (!product) throw new Error('Produto não encontrado')
  if (product.quantity < input.quantity) {
    throw new Error(`Estoque insuficiente. Disponível: ${product.quantity} unidade(s)`)
  }

  // Câmbio: usa cotação manual desta operação se informada, senão a do dia.
  const settings = await getEffectiveRate()
  const rate =
    input.manualRate && input.manualRate > 0 ? input.manualRate : settings.exchangeRate
  const protectionPct = settings.currencyProtectionPct

  const costUsd = Number(product.priceUsd)
  const totalUsd = input.unitPriceUsd * input.quantity
  const totalBrl = computeBrl(totalUsd, rate, protectionPct)
  const totalCostBrl = computeBrl(costUsd * input.quantity, rate, protectionPct)
  const profitBrl = totalBrl - totalCostBrl

  // Margem: usa a informada manualmente; senão deriva do preço x custo.
  const marginPct =
    input.marginPct != null && Number.isFinite(input.marginPct)
      ? input.marginPct
      : costUsd > 0
        ? ((input.unitPriceUsd - costUsd) / costUsd) * 100
        : 0

  const [created] = await db
    .insert(sales)
    .values({
      productId: input.productId,
      kind,
      quantity: input.quantity,
      unitPriceUsd: String(input.unitPriceUsd),
      unitCostUsd: String(costUsd),
      exchangeRate: String(rate),
      currencyProtectionPct: String(protectionPct),
      marginPct: String(marginPct),
      totalUsd: String(totalUsd),
      totalBrl: String(totalBrl),
      profitBrl: String(profitBrl),
      customer: input.customer?.trim() || null,
      customerId: input.customerId ?? null,
      soldBy: ctx.user.id,
      convertedAt: null,
    })
    .returning()

  // Baixa/reserva de estoque (vale tanto para venda quanto orçamento).
  await db
    .update(products)
    .set({ quantity: sql`${products.quantity} - ${input.quantity}`, updatedAt: new Date() })
    .where(eq(products.id, input.productId))

  await db.insert(stockMovements).values({
    productId: input.productId,
    type: 'out',
    quantity: input.quantity,
    note: kind === 'quote' ? `Reserva orçamento #${created.id}` : `Venda #${created.id}`,
    createdBy: ctx.user.id,
  })

  await logAudit({
    action: 'create',
    resource: 'sales',
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: created.id,
    summary: `${kind === 'quote' ? 'Orçamento' : 'Venda'} de ${input.quantity}x "${product.name}" registrado`,
    metadata: { kind, totalBrl, profitBrl, marginPct, rate },
  })

  revalidatePath('/vendas')
  revalidatePath('/produtos')
  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  revalidatePath('/relatorios')
  return created
}

type SaleItemInput = {
  productId: number
  quantity: number
  unitPriceUsd: number
  marginPct?: number
}

type RegisterItemsInput = {
  items: SaleItemInput[]
  kind?: SaleKind
  customerId?: number | null
  customer?: string
  manualRate?: number | null
}

/**
 * Registra uma venda/orçamento com MÚLTIPLOS produtos de uma só vez. Cada item
 * vira uma linha em `sales` (o schema é 1 produto por linha), compartilhando o
 * mesmo cliente e cotação. O estoque é validado de forma agregada por produto
 * (somando as quantidades de itens repetidos) antes de qualquer baixa.
 */
export async function registerSaleItems(input: RegisterItemsInput) {
  const ctx = await requirePermission('sales', 'create')

  const kind: SaleKind = input.kind === 'quote' ? 'quote' : 'sale'
  const items = input.items ?? []
  if (items.length === 0) throw new Error('Adicione ao menos um produto')

  for (const it of items) {
    if (it.quantity <= 0) throw new Error('A quantidade deve ser positiva')
    if (it.unitPriceUsd <= 0) throw new Error('O preço de venda deve ser positivo')
  }

  // Carrega os produtos envolvidos e valida estoque agregado por produto.
  const ids = Array.from(new Set(items.map((i) => i.productId)))
  const rows = await db.select().from(products).where(inArray(products.id, ids))
  const byId = new Map(rows.map((p) => [p.id, p]))

  const neededByProduct = new Map<number, number>()
  for (const it of items) {
    if (!byId.has(it.productId)) throw new Error('Produto não encontrado')
    neededByProduct.set(it.productId, (neededByProduct.get(it.productId) ?? 0) + it.quantity)
  }
  for (const [pid, needed] of neededByProduct) {
    const p = byId.get(pid)!
    if (p.quantity < needed) {
      throw new Error(`Estoque insuficiente para "${p.name}". Disponível: ${p.quantity}, solicitado: ${needed}`)
    }
  }

  const settings = await getEffectiveRate()
  const rate =
    input.manualRate && input.manualRate > 0 ? input.manualRate : settings.exchangeRate
  const protectionPct = settings.currencyProtectionPct

  const createdIds: number[] = []
  let totalBrlAll = 0

  for (const it of items) {
    const product = byId.get(it.productId)!
    const costUsd = Number(product.priceUsd)
    const totalUsd = it.unitPriceUsd * it.quantity
    const totalBrl = computeBrl(totalUsd, rate, protectionPct)
    const totalCostBrl = computeBrl(costUsd * it.quantity, rate, protectionPct)
    const profitBrl = totalBrl - totalCostBrl
    const marginPct =
      it.marginPct != null && Number.isFinite(it.marginPct)
        ? it.marginPct
        : costUsd > 0
          ? ((it.unitPriceUsd - costUsd) / costUsd) * 100
          : 0

    const [created] = await db
      .insert(sales)
      .values({
        productId: it.productId,
        kind,
        quantity: it.quantity,
        unitPriceUsd: String(it.unitPriceUsd),
        unitCostUsd: String(costUsd),
        exchangeRate: String(rate),
        currencyProtectionPct: String(protectionPct),
        marginPct: String(marginPct),
        totalUsd: String(totalUsd),
        totalBrl: String(totalBrl),
        profitBrl: String(profitBrl),
        customer: input.customer?.trim() || null,
        customerId: input.customerId ?? null,
        soldBy: ctx.user.id,
        convertedAt: null,
      })
      .returning()

    await db
      .update(products)
      .set({ quantity: sql`${products.quantity} - ${it.quantity}`, updatedAt: new Date() })
      .where(eq(products.id, it.productId))

    await db.insert(stockMovements).values({
      productId: it.productId,
      type: 'out',
      quantity: it.quantity,
      note: kind === 'quote' ? `Reserva orçamento #${created.id}` : `Venda #${created.id}`,
      createdBy: ctx.user.id,
    })

    createdIds.push(created.id)
    totalBrlAll += totalBrl
  }

  await logAudit({
    action: 'create',
    resource: 'sales',
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `${kind === 'quote' ? 'Orçamento' : 'Venda'} com ${items.length} item(ns) registrado(s)`,
    metadata: { kind, items: items.length, totalBrl: totalBrlAll, rate, saleIds: createdIds },
  })

  revalidatePath('/vendas')
  revalidatePath('/produtos')
  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  revalidatePath('/relatorios')
  return { count: createdIds.length, ids: createdIds }
}

/**
 * Converte um orçamento em venda finalizada. O estoque já está reservado,
 * então não há nova baixa.
 */
export async function convertQuote(id: number) {
  const ctx = await requirePermission('sales', 'update')

  const [quote] = await db.select().from(sales).where(eq(sales.id, id))
  if (!quote) throw new Error('Orçamento não encontrado')
  if (quote.kind !== 'quote') throw new Error('Este registro não é um orçamento')

  await db
    .update(sales)
    .set({ kind: 'sale', convertedAt: new Date() })
    .where(eq(sales.id, id))

  await logAudit({
    action: 'update',
    resource: 'sales',
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: id,
    summary: `Orçamento #${id} convertido em venda`,
  })

  revalidatePath('/vendas')
  revalidatePath('/dashboard')
  revalidatePath('/relatorios')
}

/**
 * Exclui uma venda finalizada, devolvendo o estoque ao produto. Para orçamentos
 * use `cancelQuote`. A operação registra a devolução nas movimentações.
 */
export async function deleteSale(id: number) {
  const ctx = await requirePermission('sales', 'delete')

  const [sale] = await db.select().from(sales).where(eq(sales.id, id))
  if (!sale) throw new Error('Venda não encontrada')
  if (sale.kind !== 'sale') {
    throw new Error('Este registro é um orçamento. Use o cancelamento de orçamento.')
  }

  // Devolve o estoque que havia sido baixado na venda.
  await db
    .update(products)
    .set({ quantity: sql`${products.quantity} + ${sale.quantity}`, updatedAt: new Date() })
    .where(eq(products.id, sale.productId))

  await db.insert(stockMovements).values({
    productId: sale.productId,
    type: 'in',
    quantity: sale.quantity,
    note: `Estorno venda #${id}`,
    createdBy: ctx.user.id,
  })

  await db.delete(sales).where(eq(sales.id, id))

  await logAudit({
    action: 'delete',
    resource: 'sales',
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: id,
    summary: `Venda #${id} excluída (estoque devolvido)`,
  })

  revalidatePath('/vendas')
  revalidatePath('/produtos')
  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  revalidatePath('/relatorios')
}

/**
 * Cancela um orçamento, devolvendo o estoque reservado.
 */
export async function cancelQuote(id: number) {
  const ctx = await requirePermission('sales', 'delete')

  const [quote] = await db.select().from(sales).where(eq(sales.id, id))
  if (!quote) throw new Error('Orçamento não encontrado')
  if (quote.kind !== 'quote') throw new Error('Apenas orçamentos podem ser cancelados')

  // Devolve o estoque reservado.
  await db
    .update(products)
    .set({ quantity: sql`${products.quantity} + ${quote.quantity}`, updatedAt: new Date() })
    .where(eq(products.id, quote.productId))

  await db.insert(stockMovements).values({
    productId: quote.productId,
    type: 'in',
    quantity: quote.quantity,
    note: `Cancelamento orçamento #${id}`,
    createdBy: ctx.user.id,
  })

  await db.delete(sales).where(eq(sales.id, id))

  await logAudit({
    action: 'delete',
    resource: 'sales',
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: id,
    summary: `Orçamento #${id} cancelado (estoque devolvido)`,
  })

  revalidatePath('/vendas')
  revalidatePath('/produtos')
  revalidatePath('/estoque')
  revalidatePath('/dashboard')
}
