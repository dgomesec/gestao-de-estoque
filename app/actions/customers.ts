'use server'

import { db } from '@/lib/db'
import { customers, sales } from '@/lib/db/schema'
import { requirePermission } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { and, desc, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export type CustomerInput = {
  name: string
  phone?: string
  email?: string
  document?: string
  addressLine?: string
  city?: string
  state?: string
  zipCode?: string
  notes?: string
}

export type CustomerWithStats = {
  id: number
  name: string
  phone: string | null
  email: string | null
  document: string | null
  addressLine: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  notes: string | null
  createdAt: Date
  salesCount: number
  totalSpentBrl: number
}

/**
 * Lista clientes com estatísticas de compras (apenas vendas finalizadas).
 */
export async function getCustomers(): Promise<CustomerWithStats[]> {
  const ctx = await requirePermission('customers', 'view')

  const rows = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
      email: customers.email,
      document: customers.document,
      addressLine: customers.addressLine,
      city: customers.city,
      state: customers.state,
      zipCode: customers.zipCode,
      notes: customers.notes,
      createdAt: customers.createdAt,
      salesCount: sql<number>`count(${sales.id}) filter (where ${sales.kind} = 'sale')`,
      totalSpentBrl: sql<number>`coalesce(sum(${sales.totalBrl}) filter (where ${sales.kind} = 'sale'), 0)`,
    })
    .from(customers)
    .leftJoin(sales, and(eq(sales.customerId, customers.id), eq(sales.tenantId, ctx.tenantId)))
    .where(eq(customers.tenantId, ctx.tenantId))
    .groupBy(customers.id)
    .orderBy(desc(customers.createdAt))

  return rows.map((r) => ({
    ...r,
    salesCount: Number(r.salesCount),
    totalSpentBrl: Number(r.totalSpentBrl),
  }))
}

function validate(input: CustomerInput) {
  if (!input.name?.trim()) throw new Error('O nome do cliente é obrigatório')
  if (input.email && input.email.trim()) {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())
    if (!ok) throw new Error('E-mail inválido')
  }
}

function clean(input: CustomerInput) {
  return {
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    document: input.document?.trim() || null,
    addressLine: input.addressLine?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    zipCode: input.zipCode?.trim() || null,
    notes: input.notes?.trim() || null,
  }
}

export async function createCustomer(input: CustomerInput) {
  const ctx = await requirePermission('customers', 'create')
  validate(input)

  const [created] = await db
    .insert(customers)
    .values({ ...clean(input), tenantId: ctx.tenantId, createdBy: ctx.user.id })
    .returning()

  await logAudit({
    action: 'create',
    resource: 'customers',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: created.id,
    summary: `Cliente "${created.name}" cadastrado`,
  })

  revalidatePath('/clientes')
  revalidatePath('/vendas')
  return created
}

export async function updateCustomer(id: number, input: CustomerInput) {
  const ctx = await requirePermission('customers', 'update')
  validate(input)

  await db
    .update(customers)
    .set({ ...clean(input), updatedAt: new Date() })
    .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)))

  await logAudit({
    action: 'update',
    resource: 'customers',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: id,
    summary: `Cliente "${input.name.trim()}" editado`,
  })

  revalidatePath('/clientes')
  revalidatePath('/vendas')
}

export async function deleteCustomer(id: number) {
  const ctx = await requirePermission('customers', 'delete')

  // Não exclui se houver vendas/orçamentos vinculados (mantém histórico).
  const [{ value: linked }] = await db
    .select({ value: sql<number>`count(*)` })
    .from(sales)
    .where(and(eq(sales.customerId, id), eq(sales.tenantId, ctx.tenantId)))
  if (Number(linked) > 0) {
    throw new Error(
      'Não é possível excluir: há vendas ou orçamentos vinculados a este cliente',
    )
  }

  const [existing] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)))
  if (!existing) throw new Error('Cliente não encontrado')
  await db.delete(customers).where(and(eq(customers.id, id), eq(customers.tenantId, ctx.tenantId)))

  await logAudit({
    action: 'delete',
    resource: 'customers',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: id,
    summary: existing ? `Cliente "${existing.name}" excluído` : `Cliente #${id} excluído`,
  })

  revalidatePath('/clientes')
}

/**
 * Lista enxuta para selects (ex.: vincular cliente a uma venda).
 */
export async function getCustomerOptions() {
  const ctx = await requirePermission('sales', 'view')
  return db
    .select({ id: customers.id, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(eq(customers.tenantId, ctx.tenantId))
    .orderBy(customers.name)
}

export type CustomerImportResult = {
  imported: number
  skipped: number
  errors: { index: number; message: string }[]
}

/**
 * Importa clientes em lote. Linhas sem nome são ignoradas. Quando informado,
 * documento ou e-mail já existentes evitam duplicatas (linha ignorada).
 */
export async function importCustomers(rows: CustomerInput[]): Promise<CustomerImportResult> {
  const ctx = await requirePermission('customers', 'create')

  const result: CustomerImportResult = { imported: 0, skipped: 0, errors: [] }
  if (!Array.isArray(rows) || rows.length === 0) return result

  // Carrega documentos e e-mails existentes (do tenant) para deduplicar.
  const existing = await db
    .select({ email: customers.email, document: customers.document })
    .from(customers)
    .where(eq(customers.tenantId, ctx.tenantId))
  const existingEmails = new Set(
    existing.map((e) => e.email?.trim().toLowerCase()).filter(Boolean) as string[],
  )
  const existingDocs = new Set(
    existing.map((e) => e.document?.trim()).filter(Boolean) as string[],
  )

  let importedCount = 0
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    try {
      if (!row.name?.trim()) {
        result.skipped++
        continue
      }
      validate(row)
      const data = clean(row)

      const emailKey = data.email?.toLowerCase()
      if (emailKey && existingEmails.has(emailKey)) {
        result.skipped++
        continue
      }
      if (data.document && existingDocs.has(data.document)) {
        result.skipped++
        continue
      }

      await db.insert(customers).values({ ...data, tenantId: ctx.tenantId, createdBy: ctx.user.id })
      if (emailKey) existingEmails.add(emailKey)
      if (data.document) existingDocs.add(data.document)
      result.imported++
      importedCount++
    } catch (e) {
      result.skipped++
      result.errors.push({ index: i, message: e instanceof Error ? e.message : 'Erro' })
    }
  }

  if (importedCount > 0) {
    await logAudit({
      action: 'create',
      resource: 'customers',
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      userName: ctx.user.name,
      userEmail: ctx.user.email,
      summary: `${importedCount} cliente(s) importado(s) em lote`,
      metadata: { skipped: result.skipped },
    })
    revalidatePath('/clientes')
    revalidatePath('/vendas')
  }

  return result
}
