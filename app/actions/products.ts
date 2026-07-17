'use server'

import { db } from '@/lib/db'
import { products, stockMovements, sales } from '@/lib/db/schema'
import { requirePermission } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { detectColor, colorFromLabel, normalizeHex, nearestNamedColor } from '@/lib/colors'

/**
 * Resolve o par (rótulo, hex) a ser persistido para a cor de um produto.
 * Prioridade:
 *  1. HEX explícito -> hex normalizado; rótulo = o informado ou a cor nomeada
 *     mais próxima da paleta.
 *  2. Rótulo explícito -> hex = o da paleta para aquele rótulo.
 *  3. Sem nada -> detecta pelo nome do produto.
 */
function resolveColorFields(
  name: string,
  explicitLabel?: string | null,
  explicitHex?: string | null,
): { color: string | null; colorHex: string | null } {
  const label = explicitLabel?.toString().trim() || null
  const hex = normalizeHex(explicitHex)

  if (hex) {
    const resolvedLabel = label ?? nearestNamedColor(hex)?.label ?? null
    return { color: resolvedLabel, colorHex: hex }
  }
  if (label) {
    return { color: label, colorHex: colorFromLabel(label)?.hex ?? null }
  }
  const detected = detectColor(name)
  return { color: detected?.label ?? null, colorHex: detected?.hex ?? null }
}

export type ImportSource = 'manual' | 'batch' | 'ai'

export type ProductInput = {
  sku: string
  name: string
  description?: string
  color?: string | null
  colorHex?: string | null
  quantity: number
  priceUsd: number
  marginMin: number
  marginMax: number
  reorderLevel: number
}

export async function getProducts() {
  const ctx = await requirePermission('products', 'view')
  return db
    .select()
    .from(products)
    .where(eq(products.tenantId, ctx.tenantId))
    .orderBy(desc(products.createdAt))
}

type ExistingProduct = typeof products.$inferSelect

/**
 * Calcula os valores resultantes do merge de um produto duplicado.
 * Regra: mantém o MAIOR valor de cada campo monetário/margem e SOMA o estoque.
 */
function mergeProductValues(
  existing: Pick<ExistingProduct, 'quantity' | 'priceUsd' | 'marginMin' | 'marginMax' | 'reorderLevel' | 'description'>,
  incoming: { quantity: number; priceUsd: number; marginMin: number; marginMax: number; reorderLevel: number; description?: string | null },
) {
  return {
    quantity: existing.quantity + Math.max(0, incoming.quantity),
    priceUsd: Math.max(Number(existing.priceUsd), incoming.priceUsd),
    marginMin: Math.max(Number(existing.marginMin), incoming.marginMin),
    marginMax: Math.max(Number(existing.marginMax), incoming.marginMax),
    reorderLevel: Math.max(existing.reorderLevel, incoming.reorderLevel),
    // Mantém a descrição mais informativa (a já existente tem prioridade se não vazia).
    description: existing.description?.trim() || incoming.description?.trim() || null,
  }
}

/** Procura um produto pelo nome (escopado ao tenant), ignorando caixa e espaços. */
async function findByName(tenantId: string, name: string): Promise<ExistingProduct | undefined> {
  const [row] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        sql`lower(trim(${products.name})) = ${name.trim().toLowerCase()}`,
      ),
    )
    .limit(1)
  return row
}

export type CreateProductResult = {
  product: ExistingProduct
  merged: boolean
  mergedWith?: { id: number; name: string }
}

export async function createProduct(
  input: ProductInput,
  source: ImportSource = 'manual',
): Promise<CreateProductResult> {
  const ctx = await requirePermission('products', 'create')

  if (input.marginMin > input.marginMax) {
    throw new Error('A margem mínima não pode ser maior que a máxima')
  }

  // Deduplicação por nome: se já existir, faz o merge em vez de duplicar.
  const duplicate = await findByName(ctx.tenantId, input.name)
  if (duplicate) {
    const merged = mergeProductValues(duplicate, input)
    const [updated] = await db
      .update(products)
      .set({
        quantity: merged.quantity,
        priceUsd: String(merged.priceUsd),
        marginMin: String(merged.marginMin),
        marginMax: String(merged.marginMax),
        reorderLevel: merged.reorderLevel,
        description: merged.description,
        updatedAt: new Date(),
      })
      .where(eq(products.id, duplicate.id))
      .returning()

    // Registra a entrada de estoque referente à quantidade somada.
    if (input.quantity > 0) {
      await db.insert(stockMovements).values({
        tenantId: ctx.tenantId,
        productId: duplicate.id,
        type: 'in',
        quantity: input.quantity,
        note: 'Merge de produto duplicado',
        createdBy: ctx.user.id,
      })
    }

    await logAudit({
      action: 'update',
      resource: 'products',
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      userEmail: ctx.user.email,
      resourceId: duplicate.id,
      summary: `Produto duplicado "${input.name.trim()}" mesclado com "${duplicate.name}" (${duplicate.sku})`,
      metadata: {
        source,
        addedQuantity: input.quantity,
        newQuantity: merged.quantity,
        priceUsd: merged.priceUsd,
      },
    })

    revalidatePath('/produtos')
    revalidatePath('/dashboard')
    return { product: updated, merged: true, mergedWith: { id: duplicate.id, name: duplicate.name } }
  }

  const [created] = await db
    .insert(products)
    .values({
      tenantId: ctx.tenantId,
      sku: input.sku.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      ...resolveColorFields(input.name, input.color, input.colorHex),
      quantity: input.quantity,
      priceUsd: String(input.priceUsd),
      marginMin: String(input.marginMin),
      marginMax: String(input.marginMax),
      reorderLevel: input.reorderLevel,
      importSource: source,
      createdBy: ctx.user.id,
    })
    .returning()

  // Registra a movimentação de entrada inicial, se houver quantidade.
  if (input.quantity > 0) {
    await db.insert(stockMovements).values({
      tenantId: ctx.tenantId,
      productId: created.id,
      type: 'in',
      quantity: input.quantity,
      note: 'Estoque inicial no cadastro',
      createdBy: ctx.user.id,
    })
  }

  await logAudit({
    action: 'create',
    resource: 'products',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: created.id,
    summary: `Produto "${created.name}" (${created.sku}) criado`,
    metadata: { source, quantity: input.quantity, priceUsd: input.priceUsd },
  })

  revalidatePath('/produtos')
  revalidatePath('/dashboard')
  return { product: created, merged: false }
}

export async function updateProduct(id: number, input: ProductInput) {
  const ctx = await requirePermission('products', 'update')

  if (input.marginMin > input.marginMax) {
    throw new Error('A margem mínima não pode ser maior que a máxima')
  }

  await db
    .update(products)
    .set({
      sku: input.sku.trim(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      ...resolveColorFields(input.name, input.color, input.colorHex),
      priceUsd: String(input.priceUsd),
      marginMin: String(input.marginMin),
      marginMax: String(input.marginMax),
      reorderLevel: input.reorderLevel,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, id), eq(products.tenantId, ctx.tenantId)))

  await logAudit({
    action: 'update',
    resource: 'products',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: id,
    summary: `Produto "${input.name.trim()}" (${input.sku.trim()}) editado`,
    metadata: { priceUsd: input.priceUsd, marginMin: input.marginMin, marginMax: input.marginMax },
  })

  revalidatePath('/produtos')
  revalidatePath('/dashboard')
}

export async function deleteProduct(id: number) {
  const ctx = await requirePermission('products', 'delete')

  // Impede exclusão se houver vendas registradas (mantém histórico).
  const [{ value: salesCount }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(sales)
    .where(and(eq(sales.productId, id), eq(sales.tenantId, ctx.tenantId)))
  if (Number(salesCount) > 0) {
    throw new Error(
      'Não é possível excluir: há vendas registradas para este produto',
    )
  }

  const [existing] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, id), eq(products.tenantId, ctx.tenantId)))
  if (!existing) throw new Error('Produto não encontrado')

  await db
    .delete(stockMovements)
    .where(and(eq(stockMovements.productId, id), eq(stockMovements.tenantId, ctx.tenantId)))
  await db.delete(products).where(and(eq(products.id, id), eq(products.tenantId, ctx.tenantId)))

  await logAudit({
    action: 'delete',
    resource: 'products',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: id,
    summary: existing
      ? `Produto "${existing.name}" (${existing.sku}) excluído`
      : `Produto #${id} excluído`,
  })

  revalidatePath('/produtos')
  revalidatePath('/dashboard')
}

export type BulkDeleteResult = {
  deleted: number
  blocked: { id: number; name: string; reason: string }[]
}

/**
 * Exclui múltiplos produtos de uma vez. Produtos com vendas registradas são
 * mantidos (reportados em `blocked`) para preservar o histórico.
 */
export async function deleteProducts(ids: number[]): Promise<BulkDeleteResult> {
  const ctx = await requirePermission('products', 'delete')

  const result: BulkDeleteResult = { deleted: 0, blocked: [] }
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id))))
  if (uniqueIds.length === 0) return result

  const rows = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, uniqueIds), eq(products.tenantId, ctx.tenantId)))
  const byId = new Map(rows.map((p) => [p.id, p]))

  // Conta vendas por produto para bloquear exclusões que apagariam histórico.
  const salesRows = await db
    .select({ productId: sales.productId, value: sql<number>`count(*)` })
    .from(sales)
    .where(and(inArray(sales.productId, uniqueIds), eq(sales.tenantId, ctx.tenantId)))
    .groupBy(sales.productId)
  const salesByProduct = new Map(salesRows.map((r) => [r.productId, Number(r.value)]))

  const deletableIds: number[] = []
  for (const id of uniqueIds) {
    const product = byId.get(id)
    if (!product) continue
    if ((salesByProduct.get(id) ?? 0) > 0) {
      result.blocked.push({ id, name: product.name, reason: 'Possui vendas registradas' })
      continue
    }
    deletableIds.push(id)
  }

  if (deletableIds.length > 0) {
    await db
      .delete(stockMovements)
      .where(and(inArray(stockMovements.productId, deletableIds), eq(stockMovements.tenantId, ctx.tenantId)))
    await db
      .delete(products)
      .where(and(inArray(products.id, deletableIds), eq(products.tenantId, ctx.tenantId)))
    result.deleted = deletableIds.length

    await logAudit({
      action: 'delete',
      resource: 'products',
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      userEmail: ctx.user.email,
      summary: `Exclusão em massa: ${result.deleted} produto(s) excluído(s)${
        result.blocked.length > 0 ? `, ${result.blocked.length} bloqueado(s)` : ''
      }`,
      metadata: {
        deletedIds: deletableIds,
        blocked: result.blocked.map((b) => b.id),
      },
    })

    revalidatePath('/produtos')
    revalidatePath('/dashboard')
  }

  return result
}

// --- Importação em lote -----------------------------------------------------

export type ImportRow = {
  sku: string
  name: string
  description?: string
  color?: string | null
  colorHex?: string | null
  quantity: number
  priceUsd: number
  marginMin: number
  marginMax: number
  reorderLevel: number
}

export type ImportResult = {
  imported: number
  merged: number
  skipped: number
  mergedNames: string[]
  errors: { row: number; sku: string; message: string }[]
}

/**
 * Importa múltiplos produtos de uma vez (lote CSV/XLSX ou IA).
 * SKUs já existentes são ignorados (reportados em `errors`).
 */
export async function importProducts(
  rows: ImportRow[],
  source: ImportSource,
): Promise<ImportResult> {
  const ctx = await requirePermission('products', 'create')

  const result: ImportResult = { imported: 0, merged: 0, skipped: 0, mergedNames: [], errors: [] }

  // SKUs e nomes existentes (do tenant) para detectar duplicidade.
  const existing = await db.select().from(products).where(eq(products.tenantId, ctx.tenantId))
  const existingSkus = new Set(existing.map((p) => p.sku.toLowerCase()))
  const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]))

  // Produtos novos são acumulados e inseridos em LOTE (chunks) após o loop, em
  // vez de um round-trip por linha — essencial para catálogos com milhares de
  // itens (evita timeout). Merges com produtos já existentes seguem inline.
  type NewProduct = { values: typeof products.$inferInsert; quantity: number }
  const toInsert: NewProduct[] = []
  const pendingByName = new Map<string, NewProduct>()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1
    const sku = String(row.sku ?? '').trim()
    const name = String(row.name ?? '').trim()

    if (!sku || !name) {
      result.errors.push({ row: rowNum, sku, message: 'SKU e nome são obrigatórios' })
      result.skipped++
      continue
    }
    const priceUsd = Number(row.priceUsd)
    if (!Number.isFinite(priceUsd) || priceUsd < 0) {
      result.errors.push({ row: rowNum, sku, message: 'Preço (USD) inválido' })
      result.skipped++
      continue
    }
    const marginMin = Number(row.marginMin) || 0
    const marginMax = Number(row.marginMax) || 0
    if (marginMin > marginMax) {
      result.errors.push({ row: rowNum, sku, message: 'Margem mínima maior que a máxima' })
      result.skipped++
      continue
    }
    const quantity = Math.max(0, Math.trunc(Number(row.quantity) || 0))
    const reorderLevel = Math.max(0, Math.trunc(Number(row.reorderLevel) || 5))

    // Deduplicação por nome: mescla com o produto existente em vez de duplicar.
    const dup = byName.get(name.toLowerCase())
    if (dup) {
      const m = mergeProductValues(dup, {
        quantity,
        priceUsd,
        marginMin,
        marginMax,
        reorderLevel,
        description: row.description?.toString().trim() || null,
      })
      const [updated] = await db
        .update(products)
        .set({
          quantity: m.quantity,
          priceUsd: String(m.priceUsd),
          marginMin: String(m.marginMin),
          marginMax: String(m.marginMax),
          reorderLevel: m.reorderLevel,
          description: m.description,
          updatedAt: new Date(),
        })
        .where(eq(products.id, dup.id))
        .returning()

      if (quantity > 0) {
        await db.insert(stockMovements).values({
          tenantId: ctx.tenantId,
          productId: dup.id,
          type: 'in',
          quantity,
          note: 'Merge de produto duplicado (importação)',
          createdBy: ctx.user.id,
        })
      }
      // Atualiza o cache local para que duplicatas dentro do mesmo lote também somem.
      byName.set(name.toLowerCase(), updated)
      result.merged++
      result.mergedNames.push(dup.name)
      continue
    }

    const description = row.description?.toString().trim() || null

    // Deduplicação por nome DENTRO do mesmo lote: soma estoque e mantém os
    // maiores valores, sem criar produto duplicado.
    const pend = pendingByName.get(name.toLowerCase())
    if (pend) {
      pend.values.quantity = (Number(pend.values.quantity) || 0) + quantity
      pend.quantity += quantity
      pend.values.priceUsd = String(Math.max(Number(pend.values.priceUsd), priceUsd))
      pend.values.marginMin = String(Math.min(Number(pend.values.marginMin), marginMin))
      pend.values.marginMax = String(Math.max(Number(pend.values.marginMax), marginMax))
      if (!pend.values.description && description) pend.values.description = description
      result.merged++
      result.mergedNames.push(name)
      continue
    }

    if (existingSkus.has(sku.toLowerCase())) {
      result.errors.push({ row: rowNum, sku, message: 'SKU já cadastrado' })
      result.skipped++
      continue
    }

    const np: NewProduct = {
      values: {
        tenantId: ctx.tenantId,
        sku,
        name,
        description,
        ...resolveColorFields(name, row.color, row.colorHex),
        quantity,
        priceUsd: String(priceUsd),
        marginMin: String(marginMin),
        marginMax: String(marginMax),
        reorderLevel,
        importSource: source,
        createdBy: ctx.user.id,
      },
      quantity,
    }
    toInsert.push(np)
    pendingByName.set(name.toLowerCase(), np)
    existingSkus.add(sku.toLowerCase())
  }

  // Fase 2: inserção em lote dos produtos novos + movimentos de estoque, em
  // blocos, para suportar milhares de linhas sem estourar o tempo limite.
  const CHUNK = 500
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK)
    const created = await db
      .insert(products)
      .values(slice.map((s) => s.values))
      .returning({ id: products.id })

    const movements = created
      .map((c, j) => ({ id: c.id, quantity: slice[j].quantity }))
      .filter((m) => m.quantity > 0)
      .map((m) => ({
        tenantId: ctx.tenantId,
        productId: m.id,
        type: 'in' as const,
        quantity: m.quantity,
        note: source === 'ai' ? 'Importação por IA' : 'Importação em lote',
        createdBy: ctx.user.id,
      }))
    if (movements.length > 0) await db.insert(stockMovements).values(movements)
    result.imported += created.length
  }

  await logAudit({
    action: 'create',
    resource: 'products',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Importação ${source === 'ai' ? 'por IA' : 'em lote'}: ${result.imported} cadastrado(s), ${result.merged} mesclado(s), ${result.skipped} ignorado(s)`,
    metadata: { source, imported: result.imported, merged: result.merged, skipped: result.skipped },
  })

  revalidatePath('/produtos')
  revalidatePath('/dashboard')
  return result
}
