'use server'

import { db } from '@/lib/db'
import { products, stockMovements } from '@/lib/db/schema'
import { requirePermission } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function getStockMovements(limit = 100) {
  await requirePermission('stock', 'view')
  return db
    .select({
      id: stockMovements.id,
      productId: stockMovements.productId,
      productName: products.name,
      sku: products.sku,
      type: stockMovements.type,
      quantity: stockMovements.quantity,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .leftJoin(products, eq(stockMovements.productId, products.id))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit)
}

export async function registerMovement(input: {
  productId: number
  type: 'in' | 'out'
  quantity: number
  note?: string
}) {
  const ctx = await requirePermission('stock', 'create')

  if (input.quantity <= 0) throw new Error('A quantidade deve ser positiva')

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, input.productId))
  if (!product) throw new Error('Produto não encontrado')

  if (input.type === 'out' && product.quantity < input.quantity) {
    throw new Error(
      `Estoque insuficiente. Disponível: ${product.quantity} unidade(s)`,
    )
  }

  const delta = input.type === 'in' ? input.quantity : -input.quantity

  await db
    .update(products)
    .set({
      quantity: sql`${products.quantity} + ${delta}`,
      updatedAt: new Date(),
    })
    .where(eq(products.id, input.productId))

  await db.insert(stockMovements).values({
    productId: input.productId,
    type: input.type,
    quantity: input.quantity,
    note: input.note?.trim() || null,
    createdBy: ctx.user.id,
  })

  await logAudit({
    action: 'create',
    resource: 'stock',
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: input.productId,
    summary: `Movimentação de ${input.type === 'in' ? 'entrada' : 'saída'} de ${input.quantity}x "${product.name}"`,
    metadata: { type: input.type, quantity: input.quantity, note: input.note ?? null },
  })

  revalidatePath('/estoque')
  revalidatePath('/produtos')
  revalidatePath('/dashboard')
}

export async function registerMovements(input: {
  type: 'in' | 'out'
  note?: string
  items: { productId: number; quantity: number }[]
}) {
  const ctx = await requirePermission('stock', 'create')

  if (!input.items.length) throw new Error('Adicione ao menos um produto')

  // Carrega os produtos envolvidos e valida antes de aplicar qualquer alteração.
  const ids = input.items.map((i) => i.productId)
  const found = await db.select().from(products).where(inArray(products.id, ids))
  const byId = new Map(found.map((p) => [p.id, p]))

  for (const item of input.items) {
    if (item.quantity <= 0) throw new Error('A quantidade deve ser positiva')
    const product = byId.get(item.productId)
    if (!product) throw new Error('Produto não encontrado')
    if (input.type === 'out' && product.quantity < item.quantity) {
      throw new Error(
        `Estoque insuficiente para "${product.name}". Disponível: ${product.quantity} unidade(s)`,
      )
    }
  }

  const note = input.note?.trim() || null

  for (const item of input.items) {
    const product = byId.get(item.productId)!
    const delta = input.type === 'in' ? item.quantity : -item.quantity

    await db
      .update(products)
      .set({ quantity: sql`${products.quantity} + ${delta}`, updatedAt: new Date() })
      .where(eq(products.id, item.productId))

    await db.insert(stockMovements).values({
      productId: item.productId,
      type: input.type,
      quantity: item.quantity,
      note,
      createdBy: ctx.user.id,
    })

    await logAudit({
      action: 'create',
      resource: 'stock',
      userId: ctx.user.id,
      userName: ctx.user.name,
      userEmail: ctx.user.email,
      resourceId: item.productId,
      summary: `Movimentação de ${input.type === 'in' ? 'entrada' : 'saída'} de ${item.quantity}x "${product.name}"`,
      metadata: { type: input.type, quantity: item.quantity, note },
    })
  }

  revalidatePath('/estoque')
  revalidatePath('/produtos')
  revalidatePath('/dashboard')
}
