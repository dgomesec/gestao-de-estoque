"use server"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user, userRoles, appRoles } from "@/lib/db/schema"
import { requirePermission, requireUser } from "@/lib/rbac"
import { logAudit } from "@/lib/audit"
import { and, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export type UserRow = {
  id: string
  name: string
  email: string
  createdAt: Date
  roleIds: number[]
  roleNames: string[]
}

export async function getUsers(): Promise<UserRow[]> {
  const ctx = await requirePermission("users", "view")

  const users = await db
    .select()
    .from(user)
    .where(eq(user.tenantId, ctx.tenantId))
    .orderBy(desc(user.createdAt))
  const links = await db.select().from(userRoles).where(eq(userRoles.tenantId, ctx.tenantId))
  const roles = await db.select().from(appRoles).where(eq(appRoles.tenantId, ctx.tenantId))

  const roleById = new Map(roles.map((r) => [r.id, r.name]))

  return users.map((u) => {
    const myLinks = links.filter((l) => l.userId === u.id)
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      roleIds: myLinks.map((l) => l.roleId),
      roleNames: myLinks.map((l) => roleById.get(l.roleId) ?? "—"),
    }
  })
}

export async function createUser(input: {
  name: string
  email: string
  password: string
  roleIds: number[]
}) {
  const ctx = await requirePermission("users", "create")

  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  if (!name || !email || input.password.length < 8) {
    throw new Error("Nome, e-mail e senha (mín. 8 caracteres) são obrigatórios")
  }

  // Cria o usuário via Better Auth (faz o hash da senha e cria account).
  await auth.api.signUpEmail({
    body: { name, email, password: input.password },
  })

  const created = await db.select().from(user).where(eq(user.email, email))
  const newUser = created[0]
  if (!newUser) throw new Error("Falha ao criar usuário")

  // Vincula o novo usuário ao tenant atual (o signup não define o tenant).
  await db.update(user).set({ tenantId: ctx.tenantId }).where(eq(user.id, newUser.id))

  // Impede atribuição de super_admin por quem não é super_admin.
  await assignRolesInternal(ctx.tenantId, newUser.id, input.roleIds)

  await logAudit({
    action: "create",
    resource: "users",
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: newUser.id,
    summary: `Usuário "${name}" (${email}) criado`,
  })

  revalidatePath("/usuarios")
  return { ok: true }
}

export async function setUserRoles(userId: string, roleIds: number[]) {
  const ctx = await requirePermission("users", "update")

  // Garante que o alvo pertence ao mesmo tenant do operador.
  const [target] = await db
    .select()
    .from(user)
    .where(and(eq(user.id, userId), eq(user.tenantId, ctx.tenantId)))
  if (!target) throw new Error("Usuário não encontrado")

  await assignRolesInternal(ctx.tenantId, userId, roleIds)
  await logAudit({
    action: "update",
    resource: "users",
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: userId,
    summary: "Papéis do usuário atualizados",
    metadata: { roleIds },
  })
  revalidatePath("/usuarios")
  return { ok: true }
}

async function assignRolesInternal(tenantId: string, userId: string, roleIds: number[]) {
  const ctx = await requireUser()

  // Os papéis precisam pertencer ao mesmo tenant.
  const targetRoles = roleIds.length
    ? await db
        .select()
        .from(appRoles)
        .where(and(inArray(appRoles.id, roleIds), eq(appRoles.tenantId, tenantId)))
    : []
  if (targetRoles.length !== roleIds.length) {
    throw new Error("Um ou mais papéis são inválidos para este cliente")
  }
  // Apenas super admins podem conceder o papel de super admin.
  if (targetRoles.some((r) => r.isSuperAdmin) && !ctx.isSuperAdmin) {
    throw new Error("Apenas super admins podem conceder o papel de Super Admin")
  }

  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.tenantId, tenantId)))
  if (roleIds.length) {
    await db.insert(userRoles).values(roleIds.map((roleId) => ({ tenantId, userId, roleId })))
  }
}

export async function deleteUser(userId: string) {
  const authCtx = await requirePermission("users", "delete")
  const ctx = await requireUser()

  if (userId === ctx.user.id) {
    throw new Error("Você não pode excluir sua própria conta")
  }

  const [target] = await db
    .select()
    .from(user)
    .where(and(eq(user.id, userId), eq(user.tenantId, authCtx.tenantId)))
  if (!target) throw new Error("Usuário não encontrado")

  // Protege o último super admin do tenant.
  const superRoles = await db
    .select()
    .from(appRoles)
    .where(and(eq(appRoles.isSuperAdmin, true), eq(appRoles.tenantId, authCtx.tenantId)))
  const superRoleIds = superRoles.map((r) => r.id)
  if (superRoleIds.length) {
    const targetLinks = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), inArray(userRoles.roleId, superRoleIds)))
    if (targetLinks.length) {
      const allSuperLinks = await db
        .select()
        .from(userRoles)
        .where(and(inArray(userRoles.roleId, superRoleIds), eq(userRoles.tenantId, authCtx.tenantId)))
      const distinctSupers = new Set(allSuperLinks.map((l) => l.userId))
      if (distinctSupers.size <= 1) {
        throw new Error("Não é possível excluir o único Super Admin do cliente")
      }
    }
  }

  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.tenantId, authCtx.tenantId)))
  await db.delete(user).where(eq(user.id, userId))

  await logAudit({
    action: "delete",
    resource: "users",
    tenantId: authCtx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: userId,
    summary: `Usuário "${target?.name ?? userId}" excluído`,
  })

  revalidatePath("/usuarios")
  return { ok: true }
}
