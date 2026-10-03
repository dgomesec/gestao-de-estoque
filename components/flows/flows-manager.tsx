"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Pencil, Plus, Trash2, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { FlowEditorDialog, blankFlow, type EditableFlow } from "@/components/flows/flow-editor"
import { DocumentsPanel } from "@/components/flows/documents-panel"
import { TemplatesPanel, type TemplateRow } from "@/components/flows/templates-panel"
import { ActivityPanel } from "@/components/flows/activity-panel"
import { deleteFlow, toggleFlow } from "@/app/actions/flows"
import { TRIGGER_LABELS, emptyGroup, type ConditionGroup, type FlowAction, type TriggerKey } from "@/lib/flows/types"

export type FlowRow = {
  id: number
  name: string
  description: string | null
  trigger: string
  enabled: boolean
  conditions: string
  actions: string
}
type RunRow = { id: number; flowName: string; status: string; log: string; createdAt: string }
type TaskRow = { id: number; title: string; description: string | null; status: string; createdAt: string }
type OrderRow = { groupId: string; kind: string; customer: string | null; totalBrl: number; createdAt: string }
type DocRow = { id: number; title: string; source: string; createdAt: string }

function parseActions(raw: string): FlowAction[] {
  try {
    return JSON.parse(raw) as FlowAction[]
  } catch {
    return []
  }
}

function toEditable(f: FlowRow): EditableFlow {
  let conditions: ConditionGroup = emptyGroup()
  try {
    const parsed = JSON.parse(f.conditions)
    if (parsed?.type === "group") conditions = parsed
  } catch {}
  return {
    id: f.id,
    name: f.name,
    description: f.description ?? "",
    trigger: f.trigger,
    enabled: f.enabled,
    conditions,
    actions: parseActions(f.actions),
  }
}

function actionSummary(raw: string) {
  const list = parseActions(raw)
  const e = list.filter((a) => a.type === "send_email").length
  const d = list.filter((a) => a.type === "generate_document").length
  const t = list.filter((a) => a.type === "create_task").length
  return [e && `${e} e-mail`, d && `${d} documento`, t && `${t} tarefa`].filter(Boolean).join(" · ")
}

export function FlowsManager({
  flows,
  runs,
  tasks,
  templates,
  orders,
  documents,
  perms,
}: {
  flows: FlowRow[]
  runs: RunRow[]
  tasks: TaskRow[]
  templates: TemplateRow[]
  orders: OrderRow[]
  documents: DocRow[]
  perms: { create: boolean; update: boolean; delete: boolean }
}) {
  const [initial, setInitial] = useState<EditableFlow>(blankFlow())
  const [open, setOpen] = useState(false)
  const [editorKey, setEditorKey] = useState(0)

  const openEditor = (f: FlowRow | null) => {
    setInitial(f ? toEditable(f) : blankFlow())
    setEditorKey((k) => k + 1)
    setOpen(true)
  }
  const templateOptions = templates.map((t) => ({ id: t.id, name: t.name }))
  const openTasks = tasks.filter((t) => t.status === "open").length

  return (
    <>
      <Tabs defaultValue="flows" className="space-y-4">
        <TabsList>
          <TabsTrigger value="flows">Fluxos</TabsTrigger>
          <TabsTrigger value="templates">Modelos</TabsTrigger>
          <TabsTrigger value="documents">Documentos</TabsTrigger>
          <TabsTrigger value="activity">Atividade{openTasks ? ` (${openTasks})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="flows" className="space-y-3">
          {perms.create && (
            <Button onClick={() => openEditor(null)}>
              <Plus className="mr-1 size-4" /> Novo fluxo
            </Button>
          )}
          {flows.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Workflow className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Nenhum fluxo criado. Crie o primeiro para automatizar vendas e orçamentos.
                </p>
              </CardContent>
            </Card>
          )}
          {flows.map((f) => (
            <Card key={f.id}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{f.name}</p>
                    <Badge variant={f.enabled ? "default" : "secondary"}>{f.enabled ? "Ativo" : "Pausado"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Quando: {TRIGGER_LABELS[f.trigger as TriggerKey] ?? f.trigger} · {actionSummary(f.actions)}
                  </p>
                  {f.description && <p className="text-sm text-muted-foreground">{f.description}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {perms.update && (
                    <>
                      <Switch
                        checked={f.enabled}
                        aria-label={`Ativar ou pausar ${f.name}`}
                        onCheckedChange={(v) => toggleFlow(f.id, v).catch((e) => toast.error(e.message))}
                      />
                      <Button variant="outline" size="sm" onClick={() => openEditor(f)}>
                        <Pencil className="mr-1 size-4" /> Editar
                      </Button>
                    </>
                  )}
                  {perms.delete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir ${f.name}`}
                      onClick={() => {
                        if (confirm(`Excluir o fluxo "${f.name}"?`)) deleteFlow(f.id).catch((e) => toast.error(e.message))
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="templates">
          <TemplatesPanel templates={templates} canCreate={perms.create} canUpdate={perms.update} canDelete={perms.delete} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsPanel orders={orders} documents={documents} templates={templateOptions} canCreate={perms.create} canDelete={perms.delete} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivityPanel tasks={tasks} runs={runs} canUpdate={perms.update} />
        </TabsContent>
      </Tabs>

      <FlowEditorDialog key={editorKey} open={open} onOpenChange={setOpen} initial={initial} templates={templateOptions} />
    </>
  )
}
