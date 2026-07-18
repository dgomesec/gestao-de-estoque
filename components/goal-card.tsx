"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Target, Pencil } from "lucide-react"
import { setGoal, type GoalProgress } from "@/app/actions/goals"
import { formatMoney, formatPct, type DisplayCurrency } from "@/lib/format"

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  const reached = pct >= 100
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full rounded-full ${reached ? "bg-chart-2" : "bg-primary"}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export function GoalCard({
  goal,
  canEdit,
  currency = "BRL",
}: {
  goal: GoalProgress
  canEdit: boolean
  currency?: DisplayCurrency
}) {
  const [open, setOpen] = useState(false)
  const [revenue, setRevenue] = useState(goal.revenueTargetBrl)
  const [profit, setProfit] = useState(goal.profitTargetBrl)
  const [isPending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      try {
        await setGoal({ month: goal.month, revenueTargetBrl: revenue, profitTargetBrl: profit })
        toast.success("Meta atualizada")
        setOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar meta")
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="size-4 text-primary" aria-hidden="true" />
          Metas de {monthLabel(goal.month)}
        </CardTitle>
        {canEdit && (
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
            <Pencil className="size-3.5" aria-hidden="true" />
            {goal.hasGoal ? "Editar" : "Definir"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!goal.hasGoal ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nenhuma meta definida para este mês.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Receita</span>
                <span className="tabular-nums font-medium">
                  {formatMoney(goal.revenueActualBrl, currency)} / {formatMoney(goal.revenueTargetBrl, currency)}
                </span>
              </div>
              <ProgressBar pct={goal.revenuePct} />
              <p className="text-right text-xs text-muted-foreground">
                {formatPct(goal.revenuePct)} da meta
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Lucro</span>
                <span className="tabular-nums font-medium">
                  {formatMoney(goal.profitActualBrl, currency)} / {formatMoney(goal.profitTargetBrl, currency)}
                </span>
              </div>
              <ProgressBar pct={goal.profitPct} />
              <p className="text-right text-xs text-muted-foreground">
                {formatPct(goal.profitPct)} da meta
              </p>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Metas de {monthLabel(goal.month)}</DialogTitle>
            <DialogDescription>
              Defina os objetivos de receita e lucro (em {currency}) para o mês.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="grev">Meta de receita ({currency})</Label>
              <Input
                id="grev"
                type="number"
                min={0}
                step="0.01"
                value={revenue}
                onChange={(e) => setRevenue(Math.max(0, Number(e.target.value)))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gprof">Meta de lucro ({currency})</Label>
              <Input
                id="gprof"
                type="number"
                min={0}
                step="0.01"
                value={profit}
                onChange={(e) => setProfit(Math.max(0, Number(e.target.value)))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar meta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
