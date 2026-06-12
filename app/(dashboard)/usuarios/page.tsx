import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getUsers } from "@/app/actions/users"
import { getRoles } from "@/app/actions/roles"
import { PageHeader } from "@/components/page-header"
import { UsersManager } from "@/components/users-manager"

export default async function UsersPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "users", "view")) redirect("/dashboard")

  const [users, roles] = await Promise.all([getUsers(), getRoles()])

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Crie contas e atribua perfis administrativos ou de vendas."
      />
      <UsersManager
        users={users}
        roles={roles.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          isSuperAdmin: r.isSuperAdmin,
        }))}
        currentUserId={ctx.user.id}
        perms={{
          create: hasPermission(ctx, "users", "create"),
          update: hasPermission(ctx, "users", "update"),
          delete: hasPermission(ctx, "users", "delete"),
        }}
      />
    </>
  )
}
