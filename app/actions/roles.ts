"use server"

import { db } from "@/lib/db"
import { appRoles, rolePermissions, userRoles } from "@/lib/db/schema"
import { requirePermission } from "@/lib/rbac"
import { logAudit } from "@/lib/audit"
import { RESOURCES, ACTIONS, type Permission } from "@/lib/constants"
import { and, asc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export type RoleRow = {
  id: number
  name: string
  description: string | null
  isSystem: boolean
  isSuperAdmin: boolean
  permissions: Permission[]
  userCount: number
}

const VALID_RESOURCES = new Set(RESOURCES.map((r) => r.key))
const VALID_ACTIONS = new Set(ACTIONS.map((a) => a.key))

export async function getRoles(): Promise<RoleRow[]> {
  const ctx = await requirePermission("roles", "view")

  const roles = await db
    .select()
    .from(appRoles)
    .where(eq(appRoles.tenantId, ctx.tenantId))
    .orderBy(asc(appRoles.id))
  const roleIds = roles.map((r) => r.id)
  // rolePermissions herdam o escopo via roleId (que já é por tenant).
  const perms = roleIds.length
    ? await db.select().from(rolePermissions).where(inArray(rolePermissions.roleId, roleIds))
    : []
  const links = await db.select().from(userRoles).where(eq(userRoles.tenantId, ctx.tenantId))

  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    isSuperAdmin: r.isSuperAdmin,
    permissions: perms
      .filter((p) => p.roleId === r.id)
      .map((p) => `${p.resource}:${p.action}` as Permission),
    userCount: links.filter((l) => l.roleId === r.id).length,
  }))
}

export async function createRole(input: {
  name: string
  description: string
  permissions: Permission[]
}) {
  const ctx = await requirePermission("roles", "create")

  const name = input.name.trim()
  if (!name) throw new Error("Nome do papel é obrigatório")

  const inserted = await db
    .insert(appRoles)
    .values({
      tenantId: ctx.tenantId,
      name,
      description: input.description.trim() || null,
      isSystem: false,
      isSuperAdmin: false,
    })
    .returning()

  await replacePermissions(inserted[0].id, input.permissions)
  await logAudit({
    action: "create",
    resource: "roles",
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: inserted[0].id,
    summary: `Papel "${name}" criado`,
    metadata: { permissions: input.permissions },
  })
  revalidatePath("/papeis")
  return { ok: true }
}

export async function updateRolePermissions(roleId: number, permissions: Permission[]) {
  const ctx = await requirePermission("roles", "update")

  const target = await db
    .select()
    .from(appRoles)
    .where(and(eq(appRoles.id, roleId), eq(appRoles.tenantId, ctx.tenantId)))
  if (!target[0]) throw new Error("Papel não encontrado")
  if (target[0].isSuperAdmin) {
    throw new Error("O papel Super Admin possui acesso total e não é editável")
  }

  await replacePermissions(roleId, permissions)
  await logAudit({
    action: "update",
    resource: "roles",
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: roleId,
    summary: `Permissões do papel "${target[0].name}" atualizadas`,
    metadata: { permissions },
  })
  revalidatePath("/papeis")
  return { ok: true }
}

export async function updateRoleInfo(roleId: number, input: { name: string; description: string }) {
  const ctx = await requirePermission("roles", "update")

  const target = await db
    .select()
    .from(appRoles)
    .where(and(eq(appRoles.id, roleId), eq(appRoles.tenantId, ctx.tenantId)))
  if (!target[0]) throw new Error("Papel não encontrado")
  if (target[0].isSystem) {
    throw new Error("Papéis do sistema não podem ser renomeados")
  }

  await db
    .update(appRoles)
    .set({ name: input.name.trim(), description: input.description.trim() || null })
    .where(and(eq(appRoles.id, roleId), eq(appRoles.tenantId, ctx.tenantId)))
  await logAudit({
    action: "update",
    resource: "roles",
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: roleId,
    summary: `Papel "${target[0].name}" renomeado para "${input.name.trim()}"`,
  })
  revalidatePath("/papeis")
  return { ok: true }
}

export async function deleteRole(roleId: number) {
  const ctx = await requirePermission("roles", "delete")

  const target = await db
    .select()
    .from(appRoles)
    .where(and(eq(appRoles.id, roleId), eq(appRoles.tenantId, ctx.tenantId)))
  if (!target[0]) throw new Error("Papel não encontrado")
  if (target[0].isSystem) {
    throw new Error("Papéis do sistema não podem ser excluídos")
  }

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))
  await db
    .delete(userRoles)
    .where(and(eq(userRoles.roleId, roleId), eq(userRoles.tenantId, ctx.tenantId)))
  await db.delete(appRoles).where(and(eq(appRoles.id, roleId), eq(appRoles.tenantId, ctx.tenantId)))
  await logAudit({
    action: "delete",
    resource: "roles",
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    resourceId: roleId,
    summary: `Papel "${target[0].name}" excluído`,
  })
  revalidatePath("/papeis")
  return { ok: true }
}

async function replacePermissions(roleId: number, permissions: Permission[]) {
  // Valida e remove duplicatas.
  const clean = Array.from(new Set(permissions)).filter((p) => {
    const [resource, action] = p.split(":")
    return VALID_RESOURCES.has(resource as never) && VALID_ACTIONS.has(action as never)
  })

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId))
  if (clean.length) {
    await db.insert(rolePermissions).values(
      clean.map((p) => {
        const [resource, action] = p.split(":")
        return { roleId, resource, action }
      }),
    )
  }
}
