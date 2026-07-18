import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getDashboardData } from "@/app/actions/reports"
import { getGoalProgress } from "@/app/actions/goals"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SalesTrendChart, TopProductsChart } from "@/components/dashboard-charts"
import { GoalCard } from "@/components/goal-card"
import { formatMoney, formatUSD, formatPct, formatDateTime } from "@/lib/format"
import {
  Package,
  Boxes,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  AlertTriangle,
} from "lucide-react"

export default async function DashboardPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "reports", "view")) {
    redirect("/produtos")
  }

  const data = await getDashboardData()
  const goal = await getGoalProgress()
  const canEditGoal = hasPermission(ctx, "reports", "update")

  const kpis = [
    {
      label: "Produtos cadastrados",
      value: String(data.totalProducts),
      hint: `${data.totalUnits} unidades em estoque`,
      icon: Package,
    },
    {
      label: `Valor do estoque (${data.currency})`,
      value: formatMoney(data.stockValueBrl, data.currency),
      hint: `${formatUSD(data.stockValueUsd)} em custo`,
      icon: Boxes,
    },
    {
      label: "Receita (30 dias)",
      value: formatMoney(data.revenueBrl30d, data.currency),
      hint: `${data.salesCount30d} venda(s)`,
      icon: ShoppingCart,
    },
    {
      label: "Lucro (30 dias)",
      value: formatMoney(data.profitBrl30d, data.currency),
      hint: "Após câmbio e proteção",
      icon: TrendingUp,
    },
  ]

  return (
    <>
      <PageHeader
        title={`Olá, ${ctx.user.name.split(" ")[0]}`}
        description="Visão geral do estoque e das vendas."
      >
        <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 text-sm">
          <DollarSign className="size-3.5" aria-hidden="true" />
          {data.currency === "USD" ? (
            "Moeda: US$"
          ) : (
            <>
              {`USD/${data.currency} ${data.rate.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}`}
              <span className="text-muted-foreground">
                {data.manualRate ? "· manual" : "· automático"}
              </span>
            </>
          )}
        </Badge>
      </PageHeader>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex items-start justify-between gap-3 pt-6">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-semibold tracking-tight">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.hint}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <kpi.icon className="size-5" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GoalCard goal={goal} canEdit={canEditGoal} currency={data.currency} />
        <SalesTrendChart data={data.salesByDay} currency={data.currency} />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopProductsChart data={data.topProducts} currency={data.currency} />
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <AlertTriangle className="size-4 text-chart-3" aria-hidden="true" />
            <CardTitle className="text-base">Estoque baixo</CardTitle>
          </CardHeader>
          <CardContent>
            {data.lowStock.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Nenhum produto abaixo do nível de reposição.
              </p>
            ) : (
              <ul className="divide-y">
                {data.lowStock.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">SKU {p.sku}</p>
                    </div>
                    <Badge
                      variant={p.quantity === 0 ? "destructive" : "secondary"}
                    >
                      {p.quantity} / mín {p.reorderLevel}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Cotação atualizada em {formatDateTime(data.rateUpdatedAt)} · Proteção
        cambial {formatPct(data.protectionPct)}
      </p>
    </>
  )
}
