"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Sparkles, FileDown, FilePlus2, Trash2, Mail, MessageCircle, FileText, MoreHorizontal, Send } from "lucide-react"
import { createDocumentForOrder, deleteGeneratedDocuments, sendDocumentsEmail } from "@/app/actions/flows"

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
  canDelete,
}: {
  orders: OrderRow[]
  documents: DocRow[]
  templates: TemplateOpt[]
  canCreate: boolean
  canDelete: boolean
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

  const [selected, setSelected] = useState<number[]>([])
  const [emailOpen, setEmailOpen] = useState(false)
  const [emailIds, setEmailIds] = useState<number[]>([])
  const [emailTo, setEmailTo] = useState("")
  const [emailSubject, setEmailSubject] = useState("")
  const [emailMessage, setEmailMessage] = useState("")
  const [emailFormat, setEmailFormat] = useState<"pdf" | "docx">("pdf")
  const [busy, startBusy] = useTransition()

  const allSelected = documents.length > 0 && selected.length === documents.length
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const visibleSelected = selected.filter((id) => documents.some((d) => d.id === id))

  function removeSelected() {
    if (visibleSelected.length === 0) return
    if (!window.confirm(`Excluir ${visibleSelected.length} documento(s)? Esta ação não pode ser desfeita.`)) return
    startBusy(async () => {
      try {
        const r = await deleteGeneratedDocuments(visibleSelected)
        toast.success(`${r.deleted} documento(s) excluído(s).`)
        setSelected([])
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao excluir.")
      }
    })
  }

  function openEmail(ids: number[]) {
    const first = documents.find((d) => d.id === ids[0])
    setEmailIds(ids)
    setEmailSubject(ids.length === 1 && first ? first.title : `Documentos (${ids.length})`)
    setEmailMessage("Olá,\n\nSegue em anexo o documento solicitado.\n\nAtenciosamente.")
    setEmailOpen(true)
  }

  function submitEmail() {
    startBusy(async () => {
      const r = await sendDocumentsEmail({ ids: emailIds, to: emailTo, subject: emailSubject, message: emailMessage, format: emailFormat })
      if (r.ok) {
        toast.success(`${r.count} documento(s) enviado(s) para ${r.recipients} destinatário(s).`)
        setEmailOpen(false)
        setEmailTo("")
      } else {
        toast.error(r.error)
      }
    })
  }

  function downloadWord(ids: number[]) {
    ids.forEach((id, i) => setTimeout(() => window.open(`/api/documents/${id}?format=docx`, "_self"), i * 600))
  }

  function openOutlook(ids: number[]) {
    ids.forEach((id, i) => setTimeout(() => window.open(`/api/documents/${id}?format=eml`, "_self"), i * 800))
    toast.info("Abra o arquivo .eml baixado: o Outlook instalado abrirá o e-mail com o PDF anexado.")
  }

  async function shareWhatsApp(d: DocRow) {
    try {
      const res = await fetch(`/api/documents/${d.id}?format=pdf`)
      if (!res.ok) throw new Error("Falha ao gerar o arquivo.")
      const blob = await res.blob()
      const file = new File([blob], `${d.title.replace(/[^\w\- ]+/g, "").trim() || "documento"}.pdf`, { type: "application/pdf" })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: d.title })
        return
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = file.name
      a.click()
      URL.revokeObjectURL(url)
      window.open(`https://wa.me/?text=${encodeURIComponent(`Segue o documento: ${d.title}`)}`, "_blank")
      toast.info("O PDF foi baixado. Anexe-o na conversa do WhatsApp que abriu.")
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return
      toast.error(e instanceof Error ? e.message : "Erro ao compartilhar.")
    }
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
          {documents.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => setSelected(v ? documents.map((d) => d.id) : [])}
                  aria-label="Selecionar todos os documentos"
                />
                {visibleSelected.length > 0 ? `${visibleSelected.length} selecionado(s)` : "Selecionar todos"}
              </label>
              {visibleSelected.length > 0 && (
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => downloadWord(visibleSelected)}>
                    <FileText className="mr-1 size-3.5" /> Word
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openOutlook(visibleSelected)}>
                    <Mail className="mr-1 size-3.5" /> Outlook
                  </Button>
                  {canCreate && (
                    <Button variant="outline" size="sm" onClick={() => openEmail(visibleSelected)}>
                      <Send className="mr-1 size-3.5" /> E-mail
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="destructive" size="sm" onClick={removeSelected} disabled={busy}>
                      <Trash2 className="mr-1 size-3.5" /> Excluir
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum documento gerado ainda.</p>
          ) : (
            <ul className="divide-y">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <Checkbox checked={selected.includes(d.id)} onCheckedChange={() => toggle(d.id)} aria-label={`Selecionar ${d.title}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(d.createdAt)}</p>
                  </div>
                  <Badge variant="secondary">{SOURCE_LABEL[d.source] ?? d.source}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" />}
                  >
                    <FileDown className="mr-1 size-3.5" /> PDF
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Mais ações para ${d.title}`} />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={() => downloadWord([d.id])}>
                        <FileText className="size-4" /> Baixar em Word (editável)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openOutlook([d.id])}>
                        <Mail className="size-4" /> Enviar pelo Outlook
                      </DropdownMenuItem>
                      {canCreate && (
                        <DropdownMenuItem onClick={() => openEmail([d.id])}>
                          <Send className="size-4" /> Enviar por e-mail
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => shareWhatsApp(d)}>
                        <MessageCircle className="size-4" /> Enviar por WhatsApp
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar {emailIds.length} documento(s) por e-mail</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email-to">Destinatários</Label>
              <Input id="email-to" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="a@empresa.com, b@empresa.com" />
              <p className="text-xs text-muted-foreground">Separe vários e-mails por vírgula.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-subject">Assunto</Label>
              <Input id="email-subject" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-message">Mensagem</Label>
              <Textarea id="email-message" rows={5} value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Formato do anexo</Label>
              <Select value={emailFormat} onValueChange={(v) => setEmailFormat((v as "pdf" | "docx") ?? "pdf")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="docx">Word (.docx)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitEmail} disabled={busy || !emailTo.trim()}>
              <Send className="mr-1 size-4" /> {busy ? "Enviando..." : "Enviar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
