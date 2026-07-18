import 'server-only'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appRoles, rolePermissions, userRoles, user as userTable, tenants } from '@/lib/db/schema'
import { eq, inArray, and } from 'drizzle-orm'
import { headers } from 'next/headers'
import type { ActionKey, ResourceKey } from '@/lib/constants'
import { getActiveTenant, isFeatureEnabled, type Tenant } from '@/lib/tenant'

export type SessionUser = {
  id: string
  name: string
  email: string
}

export type AuthContext = {
  user: SessionUser
  // Tenant efetivo no qual o usuário está operando. Para usuários comuns é o
  // tenant ao qual pertencem; para super-usuários de plataforma é o tenant que
  // estão impersonando (ou null quando no portal master).
  tenantId: string | null
  tenant: Tenant | null
  // Super-usuário de PLATAFORMA (controlador master), acima de todos os tenants.
  isPlatformAdmin: boolean
  roleIds: number[]
  roleNames: string[]
  // Super-usuário DENTRO do tenant (admin do cliente).
  isSuperAdmin: boolean
  permissions: Set<string> // "resource:action"
  // 2FA: se o usuário já concluiu a inscrição do app autenticador e se o admin
  // exige 2FA para esta conta.
  twoFactorEnabled: boolean
  twoFactorRequired: boolean
}

/**
 * Retorna a sessão e o contexto de permissões do usuário atual, ou null.
 * Todo o RBAC é escopado pelo tenant efetivo do usuário.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const user: SessionUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  }

  // Carrega tenantId e flag de plataforma direto da tabela user (fonte de verdade).
  const [row] = await db
    .select({
      tenantId: userTable.tenantId,
      isPlatformAdmin: userTable.isPlatformAdmin,
      twoFactorEnabled: userTable.twoFactorEnabled,
      twoFactorRequired: userTable.twoFactorRequired,
    })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1)

  const isPlatformAdmin = row?.isPlatformAdmin ?? false
  const twoFactorEnabled = row?.twoFactorEnabled ?? false
  const twoFactorRequired = row?.twoFactorRequired ?? false

  // Determina o tenant efetivo:
  // - Plataforma: tenant impersonado (resolvido do host/cookie), pode ser null.
  // - Usuário comum: sempre o próprio tenant (ignora o host por segurança).
  let tenant: Tenant | null = null
  let tenantId: string | null = null
  if (isPlatformAdmin) {
    tenant = await getActiveTenant()
    tenantId = tenant?.id ?? null
  } else {
    tenantId = row?.tenantId ?? null
    if (tenantId) {
      const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
      tenant = t ?? null
    }
  }

  const base = {
    user,
    tenantId,
    tenant,
    isPlatformAdmin,
    twoFactorEnabled,
    twoFactorRequired,
  }

  // Sem tenant efetivo (plataforma no portal master): sem papéis de tenant.
  if (!tenantId) {
    return { ...base, roleIds: [], roleNames: [], isSuperAdmin: false, permissions: new Set() }
  }

  // Papéis do usuário DENTRO do tenant efetivo.
  const links = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(and(eq(userRoles.userId, user.id), eq(userRoles.tenantId, tenantId)))

  const roleIds = links.map((l) => l.roleId)
  if (roleIds.length === 0) {
    return { ...base, roleIds: [], roleNames: [], isSuperAdmin: false, permissions: new Set() }
  }

  const roles = await db
    .select()
    .from(appRoles)
    .where(and(inArray(appRoles.id, roleIds), eq(appRoles.tenantId, tenantId)))

  const isSuperAdmin = roles.some((r) => r.isSuperAdmin)
  const roleNames = roles.map((r) => r.name)

  const perms = await db
    .select()
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, roleIds))

  const permissions = new Set(perms.map((p) => `${p.resource}:${p.action}`))

  return { ...base, roleIds, roleNames, isSuperAdmin, permissions }
}

export function hasPermission(
  ctx: AuthContext | null,
  resource: ResourceKey,
  action: ActionKey,
): boolean {
  if (!ctx) return false
  // Super-usuário de plataforma tem acesso total a tudo.
  if (ctx.isPlatformAdmin) return true
  // Funcionalidade desativada para o tenant bloqueia o acesso de todos.
  if (!isFeatureEnabled(ctx.tenant, resource)) return false
  if (ctx.isSuperAdmin) return true
  return ctx.permissions.has(`${resource}:${action}`)
}

/**
 * Garante que há um usuário logado. Lança erro caso contrário.
 */
export async function requireUser(): Promise<AuthContext> {
  const ctx = await getAuthContext()
  if (!ctx) throw new Error('Não autenticado')
  return ctx
}

/**
 * Garante que o usuário possui a permissão indicada (e que a funcionalidade
 * está habilitada para o tenant). Lança erro caso contrário. Retorna o contexto
 * com `tenantId` garantidamente não-nulo para uso no escopo das queries.
 */
export async function requirePermission(
  resource: ResourceKey,
  action: ActionKey,
): Promise<AuthContext & { tenantId: string }> {
  const ctx = await requireUser()
  if (!ctx.tenantId) {
    throw new Error('Nenhum cliente selecionado para esta operação')
  }
  if (!hasPermission(ctx, resource, action)) {
    throw new Error('Acesso negado: permissão insuficiente')
  }
  return ctx as AuthContext & { tenantId: string }
}

/**
 * Garante que o usuário é super-usuário de PLATAFORMA (controlador master).
 */
export async function requirePlatformAdmin(): Promise<AuthContext> {
  const ctx = await requireUser()
  if (!ctx.isPlatformAdmin) {
    throw new Error('Acesso negado: requer super-usuário de plataforma')
  }
  return ctx
}
