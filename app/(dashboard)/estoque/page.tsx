import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getStockMovements } from "@/app/actions/stock"
import { getProducts } from "@/app/actions/products"
import { PageHeader } from "@/components/page-header"
import { StockManager } from "@/components/stock-manager"

export default async function StockPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "stock", "view")) redirect("/dashboard")

  const [movements, products] = await Promise.all([getStockMovements(), getProducts()])

  return (
    <>
      <PageHeader
        title="Estoque"
        description="Controle de entradas e saídas. Vendas geram saída automática."
      />
      <StockManager
        movements={movements}
        products={products.map((p) => ({ id: p.id, name: p.name, sku: p.sku, quantity: p.quantity }))}
        canCreate={hasPermission(ctx, "stock", "create")}
      />
    </>
  )
}
