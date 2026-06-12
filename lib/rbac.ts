import 'server-only'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { appRoles, rolePermissions, userRoles } from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import type { ActionKey, ResourceKey } from '@/lib/constants'

export type SessionUser = {
  id: string
  name: string
  email: string
}

export type AuthContext = {
  user: SessionUser
  roleIds: number[]
  roleNames: string[]
  isSuperAdmin: boolean
  permissions: Set<string> // "resource:action"
}

/**
 * Retorna a sessão e o contexto de permissões do usuário atual, ou null.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null

  const user: SessionUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  }

  // Papéis do usuário.
  const links = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id))

  const roleIds = links.map((l) => l.roleId)
  if (roleIds.length === 0) {
    return {
      user,
      roleIds: [],
      roleNames: [],
      isSuperAdmin: false,
      permissions: new Set(),
    }
  }

  const roles = await db
    .select()
    .from(appRoles)
    .where(inArray(appRoles.id, roleIds))

  const isSuperAdmin = roles.some((r) => r.isSuperAdmin)
  const roleNames = roles.map((r) => r.name)

  const perms = await db
    .select()
    .from(rolePermissions)
    .where(inArray(rolePermissions.roleId, roleIds))

  const permissions = new Set(perms.map((p) => `${p.resource}:${p.action}`))

  return { user, roleIds, roleNames, isSuperAdmin, permissions }
}

export function hasPermission(
  ctx: AuthContext | null,
  resource: ResourceKey,
  action: ActionKey,
): boolean {
  if (!ctx) return false
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
 * Garante que o usuário possui a permissão indicada. Lança erro caso contrário.
 */
export async function requirePermission(
  resource: ResourceKey,
  action: ActionKey,
): Promise<AuthContext> {
  const ctx = await requireUser()
  if (!hasPermission(ctx, resource, action)) {
    throw new Error('Acesso negado: permissão insuficiente')
  }
  return ctx
}
