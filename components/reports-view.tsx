"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { Download, TrendingUp, ShoppingCart, Boxes, Target, Trash2 } from "lucide-react"
import { getSalesReport, getSalesReportByRange, type SalesReport } from "@/app/actions/reports"
import { deleteGoal, type GoalProgress } from "@/app/actions/goals"
import { formatBRL, formatUSD, formatDateTime, formatPct } from "@/lib/format"

const PERIODS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Últimos 12 meses" },
  { value: "custom", label: "Intervalo personalizado" },
]

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
}

type StockRow = {
  name: string
  sku: string
  quantity: number
  reorderLevel: number
  costUsd: number
  costBrl: number
  stockValueBrl: number
}

export function ReportsView({
  initialReport,
  initialDays,
  goals,
  stockRows,
  stockTotalBrl,
  canDeleteGoals = false,
}: {
  initialReport: SalesReport
  initialDays: string
  goals: GoalProgress[]
  stockRows: StockRow[]
  stockTotalBrl: number
  canDeleteGoals?: boolean
}) {
  const [days, setDays] = useState(initialDays)
  const [report, setReport] = useState(initialReport)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleDeleteGoal(month: string, label: string) {
    if (!confirm(`Excluir a meta de ${label}?`)) return
    startTransition(async () => {
      try {
        await deleteGoal(month)
        toast.success("Meta excluída")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao excluir meta")
      }
    })
  }

  function onPeriodChange(value: string) {
    setDays(value)
    if (value === "custom") {
      // Aguarda o usuário escolher as datas e clicar em "Aplicar".
      return
    }
    startTransition(async () => {
      try {
        const r = await getSalesReport(Number(value))
        setReport(r)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar relatório")
      }
    })
  }

  function applyRange() {
    if (!from || !to) {
      toast.error("Selecione as datas inicial e final")
      return
    }
    startTransition(async () => {
      try {
        const r = await getSalesReportByRange(from, to)
        setReport(r)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar relatório")
      }
    })
  }

  function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
    const escape = (v: string | number) => {
      const s = String(v).replace(/"/g, '""')
      return /[",\n;]/.test(s) ? `"${s}"` : s
    }
    const content = [headers, ...rows].map((r) => r.map(escape).join(";")).join("\n")
    const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Relatório exportado")
  }

  function exportSales() {
    downloadCsv(
      `relatorio-vendas-${days}d.csv`,
      ["Data", "Produto", "SKU", "Quantidade", "Total USD", "Total BRL", "Lucro BRL", "Cliente"],
      report.rows.map((r) => [
        formatDateTime(r.createdAt),
        r.productName,
        r.sku,
        r.quantity,
        r.totalUsd.toFixed(2),
        r.totalBrl.toFixed(2),
        r.profitBrl.toFixed(2),
        r.customer ?? "",
      ]),
    )
  }

  function exportStock() {
    downloadCsv(
      "relatorio-estoque.csv",
      ["Produto", "SKU", "Quantidade", "Nivel reposicao", "Custo USD", "Custo BRL", "Valor em estoque BRL"],
      stockRows.map((r) => [
        r.name,
        r.sku,
        r.quantity,
        r.reorderLevel,
        r.costUsd.toFixed(2),
        r.costBrl.toFixed(2),
        r.stockValueBrl.toFixed(2),
      ]),
    )
  }

  const kpis = [
    { label: "Vendas", value: String(report.rows.length), icon: ShoppingCart },
    { label: "Unidades vendidas", value: String(report.totalUnits), icon: Boxes },
    { label: "Receita total", value: formatBRL(report.totalRevenueBrl), icon: TrendingUp },
    { label: "Lucro total", value: formatBRL(report.totalProfitBrl), icon: TrendingUp },
  ]

  return (
    <div className="space-y-6">
      {/* Metas mensais */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Target className="size-4 text-primary" aria-hidden="true" />
          Metas mensais
        </h2>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Receita (real / meta)</TableHead>
                    <TableHead className="text-right">% Receita</TableHead>
                    <TableHead className="text-right">Lucro (real / meta)</TableHead>
                    <TableHead className="text-right">% Lucro</TableHead>
                    {canDeleteGoals && <TableHead className="w-12" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {goals.filter((g) => g.hasGoal).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canDeleteGoals ? 6 : 5} className="h-24 text-center text-muted-foreground">
                        Nenhuma meta definida. Configure metas no painel.
                      </TableCell>
                    </TableRow>
                  ) : (
                    goals
                      .filter((g) => g.hasGoal)
                      .map((g) => (
                        <TableRow key={g.month}>
                          <TableCell className="font-medium capitalize">{monthLabel(g.month)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {formatBRL(g.revenueActualBrl)} / {formatBRL(g.revenueTargetBrl)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={g.revenuePct >= 100 ? "secondary" : "outline"}>
                              {formatPct(g.revenuePct)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {formatBRL(g.profitActualBrl)} / {formatBRL(g.profitTargetBrl)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={g.profitPct >= 100 ? "secondary" : "outline"}>
                              {formatPct(g.profitPct)}
                            </Badge>
                          </TableCell>
                          {canDeleteGoals && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive"
                                aria-label={`Excluir meta de ${monthLabel(g.month)}`}
                                disabled={isPending}
                                onClick={() => handleDeleteGoal(g.month, monthLabel(g.month))}
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Relatório de vendas */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Vendas</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={days} onValueChange={(v) => onPeriodChange(v ?? days)}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {days === "custom" && (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-40"
                  aria-label="Data inicial"
                />
                <span className="text-sm text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-40"
                  aria-label="Data final"
                />
                <Button variant="secondary" onClick={applyRange} disabled={isPending}>
                  Aplicar
                </Button>
              </div>
            )}
            <Button variant="outline" onClick={exportSales} className="gap-2" disabled={report.rows.length === 0}>
              <Download className="size-4" aria-hidden="true" />
              CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Total BRL</TableHead>
                    <TableHead className="text-right">Lucro BRL</TableHead>
                    <TableHead>Cliente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        {isPending ? "Carregando..." : "Nenhuma venda no período."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    report.rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(r.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{r.productName}</div>
                          <div className="text-xs text-muted-foreground">SKU {r.sku}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatBRL(r.totalBrl)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-chart-2">
                          {formatBRL(r.profitBrl)}
                        </TableCell>
                        <TableCell className="text-sm">{r.customer ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Relatório de estoque */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Estoque{" "}
            <span className="text-sm font-normal text-muted-foreground">
              · valor total {formatBRL(stockTotalBrl)}
            </span>
          </h2>
          <Button variant="outline" onClick={exportStock} className="gap-2" disabled={stockRows.length === 0}>
            <Download className="size-4" aria-hidden="true" />
            CSV
          </Button>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Custo USD</TableHead>
                    <TableHead className="text-right">Custo BRL</TableHead>
                    <TableHead className="text-right">Valor em estoque (BRL)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        Nenhum produto cadastrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    stockRows.map((r) => {
                      const low = r.quantity <= r.reorderLevel
                      return (
                        <TableRow key={r.sku}>
                          <TableCell>
                            <div className="font-medium">{r.name}</div>
                            <div className="text-xs text-muted-foreground">SKU {r.sku}</div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={low ? (r.quantity === 0 ? "destructive" : "secondary") : "outline"}>
                              {r.quantity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatUSD(r.costUsd)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(r.costBrl)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatBRL(r.stockValueBrl)}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
