import 'server-only'

import { db } from '@/lib/db'
import { appRoles, rolePermissions, settings } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import type { Permission } from '@/lib/constants'

/**
 * Template dos papéis de sistema criados para CADA novo tenant. Espelha o
 * conjunto original do primeiro cliente (TechBless):
 * - super_admin: acesso total (sem permissões explícitas, bypassa as checagens).
 * - administrativo: gestão completa, exceto edição de papéis e exclusão de vendas.
 * - vendas: foco operacional em vendas/clientes, com visão de estoque/produtos.
 */
const SYSTEM_ROLE_TEMPLATE: {
  name: string
  description: string
  isSuperAdmin: boolean
  permissions: Permission[]
}[] = [
  {
    name: 'super_admin',
    description: 'Acesso total ao sistema',
    isSuperAdmin: true,
    permissions: [],
  },
  {
    name: 'administrativo',
    description: 'Gestão completa da operação',
    isSuperAdmin: false,
    permissions: [
      'audit:view',
      'customers:create',
      'customers:delete',
      'customers:update',
      'customers:view',
      'products:create',
      'products:delete',
      'products:update',
      'products:view',
      'reports:create',
      'reports:update',
      'reports:view',
      'roles:view',
      'sales:create',
      'sales:update',
      'sales:view',
      'settings:view',
      'stock:create',
      'stock:update',
      'stock:view',
      'users:view',
    ],
  },
  {
    name: 'vendas',
    description: 'Operação de vendas e atendimento',
    isSuperAdmin: false,
    permissions: [
      'customers:create',
      'customers:delete',
      'customers:update',
      'customers:view',
      'products:view',
      'reports:view',
      'sales:create',
      'sales:view',
      'stock:view',
    ],
  },
]

/**
 * Cria (de forma idempotente) os papéis de sistema e a linha de configurações
 * de um tenant. Retorna o papel super_admin do tenant (para vincular o 1º admin).
 */
export async function provisionTenantDefaults(tenantId: string): Promise<{ superAdminRoleId: number }> {
  let superAdminRoleId = 0

  for (const tpl of SYSTEM_ROLE_TEMPLATE) {
    // Já existe um papel com este nome no tenant?
    const existing = await db
      .select()
      .from(appRoles)
      .where(and(eq(appRoles.tenantId, tenantId), eq(appRoles.name, tpl.name)))
      .limit(1)

    let roleId: number
    if (existing[0]) {
      roleId = existing[0].id
    } else {
      const [created] = await db
        .insert(appRoles)
        .values({
          tenantId,
          name: tpl.name,
          description: tpl.description,
          isSystem: true,
          isSuperAdmin: tpl.isSuperAdmin,
        })
        .returning()
      roleId = created.id

      if (tpl.permissions.length) {
        await db.insert(rolePermissions).values(
          tpl.permissions.map((p) => {
            const [resource, action] = p.split(':')
            return { roleId, resource, action }
          }),
        )
      }
    }

    if (tpl.isSuperAdmin) superAdminRoleId = roleId
  }

  // Garante a linha de configurações do tenant (câmbio padrão).
  await db.insert(settings).values({ tenantId }).onConflictDoNothing()

  return { superAdminRoleId }
}
