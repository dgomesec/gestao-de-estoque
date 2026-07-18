import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getCustomers } from "@/app/actions/customers"
import { getSettings } from "@/lib/exchange"
import { PageHeader } from "@/components/page-header"
import { CustomersManager } from "@/components/customers-manager"
import { CustomerImport } from "@/components/customer-import"

export default async function CustomersPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "customers", "view")) redirect("/dashboard")

  const [customers, settings] = await Promise.all([getCustomers(), getSettings()])
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
        currency={settings.displayCurrency}
        perms={{
          create: canCreate,
          update: hasPermission(ctx, "customers", "update"),
          delete: hasPermission(ctx, "customers", "delete"),
        }}
      />
    </>
  )
}
