"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { RefreshCw, Save, Upload, Trash2, Store } from "lucide-react"
import {
  updateSettings,
  refreshLiveRate,
  updateStoreInfo,
  uploadStoreLogo,
  removeStoreLogo,
} from "@/app/actions/settings"
import { formatBRL, formatDateTime, formatPct } from "@/lib/format"

type StoreFields = {
  storeName: string | null
  storeLogoUrl: string | null
  storeAddress: string | null
  storePhone: string | null
  storeEmail: string | null
}

export function SettingsManager({
  initial,
  store,
  canEdit,
}: {
  initial: {
    exchangeRate: number
    manualRate: boolean
    currencyProtectionPct: number
    rateUpdatedAt: Date
  }
  store: StoreFields
  canEdit: boolean
}) {
  const [rate, setRate] = useState(initial.exchangeRate)
  const [manual, setManual] = useState(initial.manualRate)
  const [protection, setProtection] = useState(initial.currencyProtectionPct)
  const [updatedAt, setUpdatedAt] = useState(initial.rateUpdatedAt)
  const [isPending, startTransition] = useTransition()

  // Estado dos dados da loja.
  const [storeName, setStoreName] = useState(store.storeName ?? "")
  const [storeAddress, setStoreAddress] = useState(store.storeAddress ?? "")
  const [storePhone, setStorePhone] = useState(store.storePhone ?? "")
  const [storeEmail, setStoreEmail] = useState(store.storeEmail ?? "")
  const [logoUrl, setLogoUrl] = useState(store.storeLogoUrl)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function saveStore() {
    startTransition(async () => {
      try {
        await updateStoreInfo({ storeName, storeAddress, storePhone, storeEmail })
        toast.success("Dados da loja salvos")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar dados da loja")
      }
    })
  }

  function onLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append("logo", file)
    setUploading(true)
    startTransition(async () => {
      try {
        const res = await uploadStoreLogo(formData)
        setLogoUrl(res.url)
        toast.success("Logo atualizado")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao enviar logo")
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ""
      }
    })
  }

  function removeLogo() {
    startTransition(async () => {
      try {
        await removeStoreLogo()
        setLogoUrl(null)
        toast.success("Logo removido")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao remover logo")
      }
    })
  }

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
            <CardTitle className="flex items-center gap-2">
              <Store className="size-5" aria-hidden="true" />
              Dados da loja
            </CardTitle>
            <CardDescription>
              Essas informações aparecem nos recibos e orçamentos enviados aos clientes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl || "/placeholder.svg"}
                    alt="Logo da loja"
                    className="size-full object-contain"
                  />
                ) : (
                  <Store className="size-8 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="space-y-2">
                <Label>Logo da empresa</Label>
                <p className="text-sm text-muted-foreground">PNG, JPG ou SVG até 2 MB.</p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onLogoSelected}
                    disabled={!canEdit || uploading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={!canEdit || uploading || isPending}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="size-4" aria-hidden="true" />
                    {uploading ? "Enviando..." : logoUrl ? "Trocar logo" : "Enviar logo"}
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-destructive hover:text-destructive"
                      disabled={!canEdit || isPending}
                      onClick={removeLogo}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="storeName">Nome da loja</Label>
                <Input
                  id="storeName"
                  value={storeName}
                  disabled={!canEdit}
                  placeholder="Ex.: Minha Loja Ltda."
                  onChange={(e) => setStoreName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="storeAddress">Endereço</Label>
                <Input
                  id="storeAddress"
                  value={storeAddress}
                  disabled={!canEdit}
                  placeholder="Rua, número, bairro, cidade - UF"
                  onChange={(e) => setStoreAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="storePhone">Telefone</Label>
                <Input
                  id="storePhone"
                  value={storePhone}
                  disabled={!canEdit}
                  placeholder="(00) 00000-0000"
                  onChange={(e) => setStorePhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="storeEmail">E-mail</Label>
                <Input
                  id="storeEmail"
                  type="email"
                  value={storeEmail}
                  disabled={!canEdit}
                  placeholder="contato@minhaloja.com.br"
                  onChange={(e) => setStoreEmail(e.target.value)}
                />
              </div>
            </div>

            {canEdit && (
              <Button onClick={saveStore} disabled={isPending} className="gap-2">
                <Save className="size-4" aria-hidden="true" />
                {isPending ? "Salvando..." : "Salvar dados da loja"}
              </Button>
            )}
          </CardContent>
        </Card>

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
