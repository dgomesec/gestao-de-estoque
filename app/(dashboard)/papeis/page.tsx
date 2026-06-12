import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getRoles } from "@/app/actions/roles"
import { PageHeader } from "@/components/page-header"
import { RolesManager } from "@/components/roles-manager"

export default async function RolesPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "roles", "view")) redirect("/dashboard")

  const roles = await getRoles()

  return (
    <>
      <PageHeader
        title="Papéis e Permissões"
        description="Controle de acesso baseado em papéis (RBAC) com granularidade por recurso e ação."
      />
      <RolesManager
        roles={roles}
        perms={{
          create: hasPermission(ctx, "roles", "create"),
          update: hasPermission(ctx, "roles", "update"),
          delete: hasPermission(ctx, "roles", "delete"),
        }}
      />
    </>
  )
}
