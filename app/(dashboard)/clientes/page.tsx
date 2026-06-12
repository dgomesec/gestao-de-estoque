import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getCustomers } from "@/app/actions/customers"
import { PageHeader } from "@/components/page-header"
import { CustomersManager } from "@/components/customers-manager"
import { CustomerImport } from "@/components/customer-import"

export default async function CustomersPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "customers", "view")) redirect("/dashboard")

  const customers = await getCustomers()
  const canCreate = hasPermission(ctx, "customers", "create")

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Cadastro completo de clientes com histórico de compras."
      >
        {canCreate && <CustomerImport />}
      </PageHeader>
      <CustomersManager
        customers={customers}
        perms={{
          create: canCreate,
          update: hasPermission(ctx, "customers", "update"),
          delete: hasPermission(ctx, "customers", "delete"),
        }}
      />
    </>
  )
}
