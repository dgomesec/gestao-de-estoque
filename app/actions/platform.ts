'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  tenants,
  user as userTable,
  userRoles,
  appRoles,
  rolePermissions,
  products,
  stockMovements,
  sales,
  customers,
  salesGoals,
  settings,
  auditLogs,
} from '@/lib/db/schema'
import { requirePlatformAdmin } from '@/lib/rbac'
import { provisionTenantDefaults } from '@/lib/tenant-provision'
import { logAudit } from '@/lib/audit'
import { TENANT_COOKIE, TOGGLEABLE_FEATURES, parseFeatures } from '@/lib/tenant'
import type { ResourceKey } from '@/lib/constants'
import { and, asc, count, eq, inArray } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export type TenantRow = {
  id: string
  slug: string
  name: string
  brandName: string | null
  status: string
  segment: string
  userCount: number
  features: Record<string, boolean>
  createdAt: Date
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/
const RESERVED_SLUGS = new Set(['admin', 'www', 'api', 'app'])

function normalizeSlug(input: string): string {
  return input.trim().toLowerCase()
}

/** Lista todos os clientes da plataforma com contagem de usuários. */
export async function getTenants(): Promise<TenantRow[]> {
  await requirePlatformAdmin()

  const rows = await db.select().from(tenants).orderBy(asc(tenants.name))
  const links = await db
    .select({ tenantId: userTable.tenantId, value: count() })
    .from(userTable)
    .groupBy(userTable.tenantId)

  const countByTenant = new Map(links.map((l) => [l.tenantId, Number(l.value)]))

  return rows.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    brandName: t.brandName,
    status: t.status,
    segment: t.segment,
    userCount: countByTenant.get(t.id) ?? 0,
    features: parseFeatures(t.features),
    createdAt: t.createdAt,
  }))
}

/** Carrega um cliente específico (ou null). */
export async function getTenant(id: string) {
  await requirePlatformAdmin()
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
  return t ?? null
}

/**
 * Cria um novo cliente: tenant + papéis de sistema + (opcional) primeiro admin.
 */
export async function createTenant(input: {
  slug: string
  name: string
  brandName?: string
  segment?: string
  adminName?: string
  adminEmail?: string
  adminPassword?: string
}) {
  const ctx = await requirePlatformAdmin()

  const slug = normalizeSlug(input.slug)
  const name = input.name.trim()
  if (!name) throw new Error('Nome do cliente é obrigatório')
  if (!SLUG_RE.test(slug)) {
    throw new Error('Slug inválido. Use 3-32 caracteres: letras minúsculas, números e hífen.')
  }
  if (RESERVED_SLUGS.has(slug)) throw new Error('Este slug é reservado')

  const existing = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
  if (existing[0]) throw new Error('Já existe um cliente com este slug')

  const id = crypto.randomUUID()
  const segment = input.segment?.trim() || 'eletronica'
  await db.insert(tenants).values({
    id,
    slug,
    name,
    brandName: input.brandName?.trim() || null,
    segment,
    status: 'active',
  })

  const { superAdminRoleId } = await provisionTenantDefaults(id)

  // Cria opcionalmente o primeiro administrador do cliente.
  if (input.adminEmail && input.adminPassword) {
    await createTenantAdminInternal({
      tenantId: id,
      superAdminRoleId,
      name: input.adminName?.trim() || name,
      email: input.adminEmail,
      password: input.adminPassword,
    })
  }

  await logAudit({
    action: 'create',
    resource: 'settings',
    tenantId: id,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Cliente "${name}" (${slug}) criado pela plataforma`,
  })

  revalidatePath('/admin')
  return { ok: true, id }
}

/** Atualiza o branding (nome de marca, logo e cores) de um cliente. */
export async function updateTenantBranding(
  id: string,
  input: {
    brandName: string
    logoUrl: string
    colorPrimary: string
    colorPrimaryForeground: string
    colorAccent: string
    colorAccentForeground: string
    colorBackground: string
    colorForeground: string
  },
) {
  const ctx = await requirePlatformAdmin()

  const clean = (v: string) => (v.trim() ? v.trim() : null)
  await db
    .update(tenants)
    .set({
      brandName: clean(input.brandName),
      logoUrl: clean(input.logoUrl),
      colorPrimary: clean(input.colorPrimary),
      colorPrimaryForeground: clean(input.colorPrimaryForeground),
      colorAccent: clean(input.colorAccent),
      colorAccentForeground: clean(input.colorAccentForeground),
      colorBackground: clean(input.colorBackground),
      colorForeground: clean(input.colorForeground),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, id))

  await logAudit({
    action: 'update',
    resource: 'settings',
    tenantId: id,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: 'Branding do cliente atualizado pela plataforma',
  })

  revalidatePath('/admin')
  revalidatePath(`/admin/${id}`)
  return { ok: true }
}

/** Ativa/desativa funcionalidades (recursos) de um cliente. */
export async function updateTenantFeatures(id: string, features: Record<string, boolean>) {
  const ctx = await requirePlatformAdmin()

  // Mantém apenas chaves de recursos toggleáveis.
  const map: Record<string, boolean> = {}
  for (const r of TOGGLEABLE_FEATURES as ResourceKey[]) {
    map[r] = features[r] !== false
  }

  await db
    .update(tenants)
    .set({ features: JSON.stringify(map), updatedAt: new Date() })
    .where(eq(tenants.id, id))

  await logAudit({
    action: 'update',
    resource: 'settings',
    tenantId: id,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: 'Funcionalidades do cliente atualizadas pela plataforma',
    metadata: map,
  })

  revalidatePath('/admin')
  revalidatePath(`/admin/${id}`)
  return { ok: true }
}

/** Atualiza o segmento (categoria de negócio) de um cliente (ex: eletronica, joalheria). */
export async function updateTenantSegment(id: string, segment: string) {
  const ctx = await requirePlatformAdmin()
  const validSegments = ['eletronica', 'joalheria']
  if (!validSegments.includes(segment)) {
    throw new Error('Segmento inválido')
  }

  await db.update(tenants).set({ segment, updatedAt: new Date() }).where(eq(tenants.id, id))

  await logAudit({
    action: 'update',
    resource: 'settings',
    tenantId: id,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Segmento do cliente atualizado para "${segment}" pela plataforma`,
  })

  revalidatePath('/admin')
  revalidatePath(`/admin/${id}`)
  return { ok: true }
}

/** Define o status do cliente (active | suspended). */
export async function setTenantStatus(id: string, status: 'active' | 'suspended') {
  const ctx = await requirePlatformAdmin()
  if (status !== 'active' && status !== 'suspended') throw new Error('Status inválido')

  await db.update(tenants).set({ status, updatedAt: new Date() }).where(eq(tenants.id, id))

  await logAudit({
    action: 'update',
    resource: 'settings',
    tenantId: id,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Cliente ${status === 'suspended' ? 'suspenso' : 'reativado'} pela plataforma`,
  })

  revalidatePath('/admin')
  revalidatePath(`/admin/${id}`)
  return { ok: true }
}

/** Cria um administrador (super_admin do tenant) para um cliente existente. */
export async function createTenantAdmin(
  tenantId: string,
  input: { name: string; email: string; password: string },
) {
  const ctx = await requirePlatformAdmin()

  const [superRole] = await db
    .select()
    .from(appRoles)
    .where(and(eq(appRoles.tenantId, tenantId), eq(appRoles.isSuperAdmin, true)))
    .limit(1)
  if (!superRole) throw new Error('Cliente sem papel de Super Admin provisionado')

  await createTenantAdminInternal({
    tenantId,
    superAdminRoleId: superRole.id,
    name: input.name.trim(),
    email: input.email,
    password: input.password,
  })

  await logAudit({
    action: 'create',
    resource: 'users',
    tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Administrador do cliente criado pela plataforma (${input.email.trim().toLowerCase()})`,
  })

  revalidatePath(`/admin/${tenantId}`)
  return { ok: true }
}

async function createTenantAdminInternal(input: {
  tenantId: string
  superAdminRoleId: number
  name: string
  email: string
  password: string
}) {
  const email = input.email.trim().toLowerCase()
  if (!input.name || !email || input.password.length < 8) {
    throw new Error('Nome, e-mail e senha (mín. 8 caracteres) são obrigatórios')
  }

  await auth.api.signUpEmail({
    body: { name: input.name, email, password: input.password },
  })

  const [created] = await db.select().from(userTable).where(eq(userTable.email, email)).limit(1)
  if (!created) throw new Error('Falha ao criar administrador')

  await db
    .update(userTable)
    .set({ tenantId: input.tenantId, isPlatformAdmin: false })
    .where(eq(userTable.id, created.id))

  await db
    .insert(userRoles)
    .values({ tenantId: input.tenantId, userId: created.id, roleId: input.superAdminRoleId })
    .onConflictDoNothing()
}

/**
 * Exclui um cliente e TODOS os seus dados. Requer confirmação pelo nome exato.
 * Operação destrutiva e irreversível.
 */
export async function deleteTenant(id: string, confirmName: string) {
  const ctx = await requirePlatformAdmin()

  const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
  if (!t) throw new Error('Cliente não encontrado')
  if (confirmName.trim() !== t.name) {
    throw new Error('O nome de confirmação não confere com o nome do cliente')
  }

  // Remove dados em ordem segura (filhos antes dos pais).
  const roleRows = await db
    .select({ id: appRoles.id })
    .from(appRoles)
    .where(eq(appRoles.tenantId, id))
  const roleIds = roleRows.map((r) => r.id)
  if (roleIds.length) {
    await db.delete(rolePermissions).where(inArray(rolePermissions.roleId, roleIds))
  }

  await db.delete(stockMovements).where(eq(stockMovements.tenantId, id))
  await db.delete(sales).where(eq(sales.tenantId, id))
  await db.delete(salesGoals).where(eq(salesGoals.tenantId, id))
  await db.delete(customers).where(eq(customers.tenantId, id))
  await db.delete(products).where(eq(products.tenantId, id))
  await db.delete(settings).where(eq(settings.tenantId, id))
  await db.delete(userRoles).where(eq(userRoles.tenantId, id))
  await db.delete(appRoles).where(eq(appRoles.tenantId, id))
  await db.delete(userTable).where(eq(userTable.tenantId, id))
  await db.delete(auditLogs).where(eq(auditLogs.tenantId, id))
  await db.delete(tenants).where(eq(tenants.id, id))

  await logAudit({
    action: 'delete',
    resource: 'settings',
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Cliente "${t.name}" (${t.slug}) excluído permanentemente pela plataforma`,
  })

  revalidatePath('/admin')
  return { ok: true }
}

/** Ativa/suspende vários clientes de uma vez. */
export async function bulkSetTenantStatus(ids: string[], status: 'active' | 'suspended') {
  const ctx = await requirePlatformAdmin()
  if (status !== 'active' && status !== 'suspended') throw new Error('Status inválido')
  if (!ids.length) return { ok: true, count: 0 }

  await db.update(tenants).set({ status, updatedAt: new Date() }).where(inArray(tenants.id, ids))

  await logAudit({
    action: 'update',
    resource: 'settings',
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `${ids.length} cliente(s) ${status === 'suspended' ? 'suspenso(s)' : 'reativado(s)'} em massa`,
  })

  revalidatePath('/admin')
  return { ok: true, count: ids.length }
}

/** Liga/desliga uma funcionalidade específica para vários clientes. */
export async function bulkToggleFeature(ids: string[], feature: string, enabled: boolean) {
  const ctx = await requirePlatformAdmin()
  if (!(TOGGLEABLE_FEATURES as string[]).includes(feature)) {
    throw new Error('Funcionalidade inválida')
  }
  if (!ids.length) return { ok: true, count: 0 }

  const rows = await db.select().from(tenants).where(inArray(tenants.id, ids))
  for (const t of rows) {
    const map = parseFeatures(t.features)
    map[feature] = enabled
    await db
      .update(tenants)
      .set({ features: JSON.stringify(map), updatedAt: new Date() })
      .where(eq(tenants.id, t.id))
  }

  await logAudit({
    action: 'update',
    resource: 'settings',
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Funcionalidade "${feature}" ${enabled ? 'ativada' : 'desativada'} em ${rows.length} cliente(s)`,
  })

  revalidatePath('/admin')
  return { ok: true, count: rows.length }
}

/**
 * Inicia a impersonação de um cliente: grava o slug no cookie de tenant e
 * redireciona para o console do cliente.
 */
export async function impersonateTenant(slug: string) {
  await requirePlatformAdmin()
  const normalized = normalizeSlug(slug)
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, normalized)).limit(1)
  if (!t) throw new Error('Cliente não encontrado')

  const c = await cookies()
  c.set(TENANT_COOKIE, normalized, { path: '/', sameSite: 'lax' })
  redirect('/dashboard')
}

/** Encerra a impersonação (limpa o cookie) e volta ao painel master. */
export async function stopImpersonation() {
  await requirePlatformAdmin()
  const c = await cookies()
  c.delete(TENANT_COOKIE)
  redirect('/admin')
}
