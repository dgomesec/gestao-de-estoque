import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getSalesReport } from "@/app/actions/reports"
import { getGoalsHistory } from "@/app/actions/goals"
import { getProducts } from "@/app/actions/products"
import { getEffectiveRate } from "@/lib/exchange"
import { PageHeader } from "@/components/page-header"
import { ReportsView } from "@/components/reports-view"

export default async function ReportsPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "reports", "view")) redirect("/dashboard")

  const [report, goals, products, settings] = await Promise.all([
    getSalesReport(30),
    getGoalsHistory(6),
    getProducts(),
    getEffectiveRate(),
  ])

  const factor = settings.exchangeRate * (1 + settings.currencyProtectionPct / 100)
  const stockRows = products.map((p) => {
    const costUsd = Number(p.priceUsd)
    return {
      name: p.name,
      sku: p.sku,
      quantity: p.quantity,
      reorderLevel: p.reorderLevel,
      costUsd,
      costBrl: costUsd * factor,
      stockValueBrl: costUsd * p.quantity * factor,
    }
  })
  const stockTotalBrl = stockRows.reduce((s, r) => s + r.stockValueBrl, 0)

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Gestão de vendas e estoque com exportação para CSV."
      />
      <ReportsView
        initialReport={report}
        initialDays="30"
        goals={goals}
        stockRows={stockRows}
        stockTotalBrl={stockTotalBrl}
        canDeleteGoals={hasPermission(ctx, "reports", "delete")}
      />
    </>
  )
}
