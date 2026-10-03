"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Sparkles, FileDown, FilePlus2 } from "lucide-react"
import { createDocumentForOrder } from "@/app/actions/flows"

type OrderRow = { groupId: string; kind: string; customer: string | null; totalBrl: number; createdAt: string }
type DocRow = { id: number; title: string; source: string; createdAt: string }
type TemplateOpt = { id: number; name: string }

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const fmtDate = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
const SOURCE_LABEL: Record<string, string> = { template: "Modelo", ai: "IA", flow: "Fluxo" }

export function DocumentsPanel({
  orders,
  documents,
  templates,
  canCreate,
}: {
  orders: OrderRow[]
  documents: DocRow[]
  templates: TemplateOpt[]
  canCreate: boolean
}) {
  const [groupId, setGroupId] = useState<string | undefined>()
  const [templateId, setTemplateId] = useState<string>("ai")
  const [prompt, setPrompt] = useState("")
  const [pending, start] = useTransition()

  function generate() {
    if (!groupId) return toast.error("Escolha o pedido.")
    start(async () => {
      try {
        const doc = await createDocumentForOrder({
          groupId,
          templateId: templateId === "ai" ? null : Number(templateId),
          prompt: templateId === "ai" ? prompt : undefined,
        })
        toast.success(`Documento "${doc.title}" gerado.`)
        window.open(`/api/documents/${doc.id}`, "_blank")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao gerar documento.")
      }
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FilePlus2 className="size-4 text-primary" /> Gerar documento para um pedido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Pedido</Label>
              <Select value={groupId} onValueChange={(v) => setGroupId(v ?? undefined)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione venda ou orçamento" />
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o) => (
                    <SelectItem key={o.groupId} value={o.groupId}>
                      {o.kind === "quote" ? "Orçamento" : "Venda"} - {o.customer || "Sem cliente"} - {brl.format(o.totalBrl)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Origem do conteúdo</Label>
              <Select value={templateId} onValueChange={(v) => setTemplateId(v ?? "ai")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai">Assistente de IA (descrever)</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      Modelo: {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {templateId === "ai" && (
              <div className="space-y-1.5">
                <Label htmlFor="doc-prompt">Instruções para a IA</Label>
                <Textarea
                  id="doc-prompt"
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ex.: Autorização de liberação da carga com os produtos vendidos, retirada em até 48h, e campo de assinatura do motorista."
                />
              </div>
            )}
            <Button onClick={generate} disabled={pending}>
              <Sparkles className="mr-1 size-4" /> {pending ? "Gerando PDF..." : "Gerar PDF"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documentos gerados</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum documento gerado ainda.</p>
          ) : (
            <ul className="divide-y">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(d.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{SOURCE_LABEL[d.source] ?? d.source}</Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      nativeButton={false}
                      render={<a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" />}
                    >
                      <FileDown className="mr-1 size-3.5" /> PDF
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
