import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getProducts } from "@/app/actions/products"
import { getEffectiveRate } from "@/lib/exchange"
import { PageHeader } from "@/components/page-header"
import { ProductsManager } from "@/components/products-manager"

export default async function ProductsPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "products", "view")) redirect("/dashboard")

  const [products, settings] = await Promise.all([getProducts(), getEffectiveRate()])

  return (
    <>
      <PageHeader
        title="Produtos"
        description={
          settings.showCostUsd
            ? "Cadastro de eletrônicos com preço em dólar e custo convertido para a moeda de venda."
            : "Cadastro de eletrônicos com custo informado na moeda de venda."
        }
      />
      <ProductsManager
        products={products}
        segment={ctx.tenant?.segment ?? "eletronica"}
        rate={settings.exchangeRate}
        currency={settings.displayCurrency}
        showCostUsd={settings.showCostUsd}
        protectionPct={settings.currencyProtectionPct}
        perms={{
          create: hasPermission(ctx, "products", "create"),
          update: hasPermission(ctx, "products", "update"),
          delete: hasPermission(ctx, "products", "delete"),
        }}
      />
    </>
  )
}
