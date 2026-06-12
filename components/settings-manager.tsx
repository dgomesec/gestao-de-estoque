"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { RefreshCw, Save } from "lucide-react"
import { updateSettings, refreshLiveRate } from "@/app/actions/settings"
import { formatBRL, formatDateTime, formatPct } from "@/lib/format"

export function SettingsManager({
  initial,
  canEdit,
}: {
  initial: {
    exchangeRate: number
    manualRate: boolean
    currencyProtectionPct: number
    rateUpdatedAt: Date
  }
  canEdit: boolean
}) {
  const [rate, setRate] = useState(initial.exchangeRate)
  const [manual, setManual] = useState(initial.manualRate)
  const [protection, setProtection] = useState(initial.currencyProtectionPct)
  const [updatedAt, setUpdatedAt] = useState(initial.rateUpdatedAt)
  const [isPending, startTransition] = useTransition()

  function save() {
    if (rate <= 0) {
      toast.error("A cotação deve ser maior que zero")
      return
    }
    startTransition(async () => {
      try {
        await updateSettings({
          exchangeRate: rate,
          manualRate: manual,
          currencyProtectionPct: protection,
        })
        toast.success("Configurações salvas")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar")
      }
    })
  }

  function refresh() {
    startTransition(async () => {
      try {
        const res = await refreshLiveRate()
        setRate(res.rate)
        setManual(false)
        setUpdatedAt(new Date())
        toast.success(`Cotação atualizada: ${formatBRL(res.rate)}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar cotação")
      }
    })
  }

  // Exemplo demonstrativo: US$ 100 com configurações atuais.
  const factor = rate * (1 + protection / 100)

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Cotação do dólar (USD → BRL)</CardTitle>
            <CardDescription>
              A cotação é buscada automaticamente. Ative o modo manual para fixar um valor.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="manual">Cotação manual</Label>
                <p className="text-sm text-muted-foreground">
                  {manual
                    ? "Valor fixo definido por você."
                    : "Atualização automática pela API do dia."}
                </p>
              </div>
              <Switch id="manual" checked={manual} onCheckedChange={setManual} disabled={!canEdit} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rate">Cotação (R$ por US$ 1)</Label>
                <Input
                  id="rate"
                  type="number"
                  min={0}
                  step="0.0001"
                  value={rate}
                  disabled={!canEdit || !manual}
                  onChange={(e) => setRate(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={refresh}
                  disabled={!canEdit || isPending}
                  className="w-full gap-2"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Buscar cotação atual
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Última atualização: {formatDateTime(updatedAt)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proteção cambial</CardTitle>
            <CardDescription>
              Percentual adicional aplicado sobre o preço final em real para proteger contra variação do dólar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 sm:max-w-xs">
              <Label htmlFor="protection">Adicional (%)</Label>
              <Input
                id="protection"
                type="number"
                min={0}
                step="0.01"
                value={protection}
                disabled={!canEdit}
                onChange={(e) => setProtection(Math.max(0, Number(e.target.value)))}
              />
            </div>
          </CardContent>
        </Card>

        {canEdit && (
          <Button onClick={save} disabled={isPending} className="gap-2">
            <Save className="size-4" aria-hidden="true" />
            {isPending ? "Salvando..." : "Salvar configurações"}
          </Button>
        )}
      </div>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Simulação</CardTitle>
          <CardDescription>Conversão de um custo de US$ 100</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cotação</span>
            <span className="tabular-nums">
              {rate.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Proteção cambial</span>
            <span className="tabular-nums">{formatPct(protection)}</span>
          </div>
          <div className="flex justify-between border-t pt-3">
            <span className="text-muted-foreground">US$ 100 sem proteção</span>
            <span className="tabular-nums">{formatBRL(100 * rate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">US$ 100 final</span>
            <span className="font-medium tabular-nums">{formatBRL(100 * factor)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
