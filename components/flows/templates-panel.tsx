"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Sparkles, Trash2, Pencil, Plus, FileText } from "lucide-react"
import { deleteTemplate, generateTemplateWithAI, saveTemplate } from "@/app/actions/flows"
import { TEMPLATE_VARIABLES, type DocSpec } from "@/lib/flows/types"

export type TemplateRow = { id: number; name: string; description: string | null; spec: string }

function SpecPreview({ spec }: { spec: DocSpec }) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
      <p className="font-semibold">{spec.title}</p>
      {spec.subtitle && <p className="text-muted-foreground">{spec.subtitle}</p>}
      {spec.blocks.map((b, i) => {
        if (b.type === "heading") return <p key={i} className="pt-1 font-medium">{b.text}</p>
        if (b.type === "paragraph") return <p key={i} className="whitespace-pre-wrap text-muted-foreground">{b.text}</p>
        if (b.type === "bullets") return <ul key={i} className="list-disc pl-5 text-muted-foreground">{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        if (b.type === "kv") return <div key={i} className="text-muted-foreground">{b.rows.map((r, j) => <p key={j}><span className="font-medium text-foreground">{r.label}:</span> {r.value}</p>)}</div>
        if (b.type === "items_table") return <p key={i} className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">[Tabela de itens do pedido]</p>
        if (b.type === "totals") return <p key={i} className="rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">[Totais]</p>
        if (b.type === "signatures") return <p key={i} className="text-xs text-muted-foreground">Assinaturas: {b.labels.join(" / ")}</p>
        return null
      })}
    </div>
  )
}

export function TemplatesPanel({ templates, canCreate, canUpdate, canDelete }: { templates: TemplateRow[]; canCreate: boolean; canUpdate: boolean; canDelete: boolean }) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | undefined>()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [prompt, setPrompt] = useState("")
  const [spec, setSpec] = useState<DocSpec | null>(null)
  const [generating, startGenerate] = useTransition()
  const [saving, startSave] = useTransition()

  function openNew() {
    setEditingId(undefined)
    setName("")
    setDescription("")
    setPrompt("")
    setSpec(null)
    setOpen(true)
  }
  function openEdit(t: TemplateRow) {
    setEditingId(t.id)
    setName(t.name)
    setDescription(t.description ?? "")
    setPrompt("")
    setSpec(JSON.parse(t.spec) as DocSpec)
    setOpen(true)
  }

  function generate() {
    startGenerate(async () => {
      try {
        const result = await generateTemplateWithAI(prompt)
        setSpec(result)
        if (!name.trim()) setName(result.title)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao gerar com IA.")
      }
    })
  }

  function save() {
    if (!spec) return
    startSave(async () => {
      try {
        await saveTemplate({ id: editingId, name, description, spec })
        toast.success("Modelo salvo.")
        setOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar.")
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Modelos são sempre exportados em PDF com a logo e as cores da marca do cliente.
        </p>
        {canCreate && (
          <Button onClick={openNew}>
            <Plus className="mr-1 size-4" /> Novo modelo
          </Button>
        )}
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum modelo ainda. Descreva o documento e deixe a IA montar a estrutura.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 size-5 text-primary" />
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-sm text-muted-foreground">{t.description || `${(JSON.parse(t.spec) as DocSpec).blocks.length} blocos`}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {canUpdate && (
                    <Button variant="ghost" size="icon" onClick={() => openEdit(t)} aria-label="Editar modelo">
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir modelo"
                      onClick={async () => {
                        try {
                          await deleteTemplate(t.id)
                          toast.success("Modelo excluído.")
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Erro ao excluir.")
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar modelo" : "Novo modelo de documento"}</DialogTitle>
            <DialogDescription>Descreva o documento e a IA cria a estrutura usando as variáveis do pedido.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-prompt">Descreva o documento</Label>
              <Textarea
                id="tpl-prompt"
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex.: Autorização de liberação de carga de peixes, com dados do cliente, lista dos produtos, local de retirada, responsável e campos de assinatura."
              />
              <Button type="button" variant="secondary" onClick={generate} disabled={generating || !prompt.trim()}>
                <Sparkles className="mr-1 size-4" /> {generating ? "Gerando..." : spec ? "Gerar novamente" : "Gerar com IA"}
              </Button>
            </div>
            {spec && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tpl-name">Nome do modelo</Label>
                    <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tpl-desc">Descrição</Label>
                    <Input id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                </div>
                <SpecPreview spec={spec} />
                <p className="text-xs text-muted-foreground">
                  Variáveis: {TEMPLATE_VARIABLES.map((v) => `{{${v.key}}}`).join("  ")}
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!spec || saving}>
              {saving ? "Salvando..." : "Salvar modelo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
