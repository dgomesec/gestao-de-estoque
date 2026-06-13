'use server'

import { db } from '@/lib/db'
import { user as userTable } from '@/lib/db/schema'
import { count, eq } from 'drizzle-orm'

/**
 * Chamado logo após o cadastro inicial (base vazia). Garante que o PRIMEIRO
 * usuário do sistema vire o super-usuário de PLATAFORMA (dono/controlador
 * master), com acesso ao painel /admin e capacidade de impersonar clientes.
 *
 * Em produção multi-tenant os usuários de clientes são criados pelo master,
 * portanto este caminho só roda uma única vez, para o dono da plataforma.
 *
 * É idempotente: se já houver mais de um usuário, não faz nada.
 */
export async function assignInitialRole(userId: string) {
  const [{ value: totalUsers }] = await db
    .select({ value: count() })
    .from(userTable)

  // Se este é o único usuário da base, ele se torna admin de plataforma.
  if (Number(totalUsers) <= 1) {
    await db
      .update(userTable)
      .set({ isPlatformAdmin: true, tenantId: null })
      .where(eq(userTable.id, userId))
  }
}
