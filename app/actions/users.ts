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
  await requirePermission("users", "view")

  const users = await db.select().from(user).orderBy(desc(user.createdAt))
  const links = await db.select().from(userRoles)
  const roles = await db.select().from(appRoles)

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

  // Impede atribuição de super_admin por quem não é super_admin.
  await assignRolesInternal(newUser.id, input.roleIds)

  await logAudit({
    action: "create",
    resource: "users",
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
  await assignRolesInternal(userId, roleIds)
  await logAudit({
    action: "update",
    resource: "users",
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

async function assignRolesInternal(userId: string, roleIds: number[]) {
  const ctx = await requireUser()

  // Apenas super admins podem conceder o papel de super admin.
  const targetRoles = roleIds.length
    ? await db.select().from(appRoles).where(inArray(appRoles.id, roleIds))
    : []
  if (targetRoles.some((r) => r.isSuperAdmin) && !ctx.isSuperAdmin) {
    throw new Error("Apenas super admins podem conceder o papel de Super Admin")
  }

  await db.delete(userRoles).where(eq(userRoles.userId, userId))
  if (roleIds.length) {
    await db.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId })))
  }
}

export async function deleteUser(userId: string) {
  await requirePermission("users", "delete")
  const ctx = await requireUser()

  if (userId === ctx.user.id) {
    throw new Error("Você não pode excluir sua própria conta")
  }

  const [target] = await db.select().from(user).where(eq(user.id, userId))

  // Protege o último super admin.
  const superRoles = await db.select().from(appRoles).where(eq(appRoles.isSuperAdmin, true))
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
        .where(inArray(userRoles.roleId, superRoleIds))
      const distinctSupers = new Set(allSuperLinks.map((l) => l.userId))
      if (distinctSupers.size <= 1) {
        throw new Error("Não é possível excluir o único Super Admin do sistema")
      }
    }
  }

  await db.delete(userRoles).where(eq(userRoles.userId, userId))
  await db.delete(user).where(eq(user.id, userId))

  await logAudit({
    action: "delete",
    resource: "users",
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: userId,
    summary: `Usuário "${target?.name ?? userId}" excluído`,
  })

  revalidatePath("/usuarios")
  return { ok: true }
}
