'use server'

import { db } from '@/lib/db'
import { appRoles, user as userTable, userRoles } from '@/lib/db/schema'
import { count, eq } from 'drizzle-orm'

/**
 * Chamado logo após o cadastro. Garante que:
 * - O PRIMEIRO usuário do sistema recebe o papel `super_admin`.
 * - Demais usuários ficam sem papel até que um admin os configure
 *   (acesso restrito até lá).
 *
 * É idempotente: se o usuário já tem papel, não faz nada.
 */
export async function assignInitialRole(userId: string) {
  // Já possui algum papel?
  const existing = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))
  if (existing.length > 0) return

  // Quantos usuários existem no total?
  const [{ value: totalUsers }] = await db
    .select({ value: count() })
    .from(userTable)

  // Se este é o único usuário, ele vira super admin.
  if (Number(totalUsers) <= 1) {
    const [superRole] = await db
      .select()
      .from(appRoles)
      .where(eq(appRoles.isSuperAdmin, true))
      .limit(1)
    if (superRole) {
      await db
        .insert(userRoles)
        .values({ userId, roleId: superRole.id })
        .onConflictDoNothing()
    }
  }
}
