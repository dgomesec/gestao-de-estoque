import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getSales } from "@/app/actions/sales"
import { getProducts } from "@/app/actions/products"
import { getCustomerOptions } from "@/app/actions/customers"
import { getEffectiveRate } from "@/lib/exchange"
import { PageHeader } from "@/components/page-header"
import { SalesManager } from "@/components/sales-manager"

export default async function SalesPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "sales", "view")) redirect("/dashboard")

  const [sales, products, customers, settings] = await Promise.all([
    getSales(),
    getProducts(),
    getCustomerOptions(),
    getEffectiveRate(),
  ])

  return (
    <>
      <PageHeader
        title="Vendas e Orçamentos"
        description="Registre vendas e orçamentos em dólar com conversão para real, margem manual e cliente vinculado."
      />
      <SalesManager
        sales={sales}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          color: p.color,
          colorHex: p.colorHex,
          quantity: p.quantity,
          priceUsd: p.priceUsd,
          marginMin: p.marginMin,
          marginMax: p.marginMax,
        }))}
        customers={customers}
        rate={settings.exchangeRate}
        protectionPct={settings.currencyProtectionPct}
        storeName={settings.storeName}
        perms={{
          create: hasPermission(ctx, "sales", "create"),
          update: hasPermission(ctx, "sales", "update"),
          delete: hasPermission(ctx, "sales", "delete"),
        }}
      />
    </>
  )
}
