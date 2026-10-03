"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Plus, Trash2, FolderPlus, Mail, FileText, ListChecks } from "lucide-react"
import { saveFlow } from "@/app/actions/flows"
import {
  TRIGGERS,
  FIELDS,
  FIELD_MAP,
  OPERATORS,
  OPERATOR_MAP,
  TEMPLATE_VARIABLES,
  emptyGroup,
  uid,
  type ConditionGroup,
  type ConditionNode,
  type ConditionRule,
  type FlowAction,
} from "@/lib/flows/types"

export type TemplateOption = { id: number; name: string }

export type EditableFlow = {
  id?: number
  name: string
  description: string
  trigger: string
  enabled: boolean
  conditions: ConditionGroup
  actions: FlowAction[]
}

export function blankFlow(): EditableFlow {
  return { name: "", description: "", trigger: "sale_created", enabled: true, conditions: emptyGroup(), actions: [] }
}

function newRule(): ConditionRule {
  return { type: "rule", id: uid(), field: "pedido.total", operator: "gte", value: "" }
}

function updateNode(group: ConditionGroup, id: string, fn: (g: ConditionGroup) => ConditionGroup): ConditionGroup {
  if (group.id === id) return fn(group)
  return {
    ...group,
    children: group.children.map((c) => (c.type === "group" ? updateNode(c, id, fn) : c)),
  }
}

function RuleEditor({
  rule,
  onChange,
  onRemove,
}: {
  rule: ConditionRule
  onChange: (r: ConditionRule) => void
  onRemove: () => void
}) {
  const field = FIELD_MAP[rule.field]
  const operators = OPERATORS.filter((o) => (o.types as readonly string[]).includes(field?.type ?? "text"))

  function setField(key: string) {
    const f = FIELD_MAP[key]
    const stillValid = OPERATORS.find((o) => o.key === rule.operator && (o.types as readonly string[]).includes(f.type))
    onChange({ ...rule, field: key, operator: stillValid ? rule.operator : (operators[0]?.key ?? "eq"), value: "" })
  }

  const needsValue = OPERATOR_MAP[rule.operator]?.needsValue !== false
  const groups = Array.from(new Set(FIELDS.map((f) => f.group)))

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-2 md:flex-row md:items-center">
      <Select value={rule.field} onValueChange={(v) => v && setField(v)}>
        <SelectTrigger className="md:w-56" aria-label="Campo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groups.map((g) => (
            <div key={g}>
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">{g}</p>
              {FIELDS.filter((f) => f.group === g).map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
      <Select value={rule.operator} onValueChange={(v) => onChange({ ...rule, operator: v as ConditionRule["operator"] })}>
        <SelectTrigger className="md:w-56" aria-label="Operador">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((o) => (
            <SelectItem key={o.key} value={o.key}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {needsValue &&
        (field?.type === "boolean" ? (
          <Select value={rule.value || "true"} onValueChange={(v) => onChange({ ...rule, value: v ?? "true" })}>
            <SelectTrigger className="md:flex-1" aria-label="Valor">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Sim</SelectItem>
              <SelectItem value="false">Não</SelectItem>
            </SelectContent>
          </Select>
        ) : field?.options ? (
          <Select value={rule.value || undefined} onValueChange={(v) => onChange({ ...rule, value: v ?? "" })}>
            <SelectTrigger className="md:flex-1" aria-label="Valor">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            className="md:flex-1"
            aria-label="Valor"
            value={rule.value}
            placeholder={rule.operator === "between" ? "mínimo, máximo" : rule.operator === "in" ? "a, b, c" : "valor"}
            onChange={(e) => onChange({ ...rule, value: e.target.value })}
          />
        ))}
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remover condição">
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function GroupEditor({
  group,
  root,
  onChange,
  onRemove,
}: {
  group: ConditionGroup
  root?: boolean
  onChange: (g: ConditionGroup) => void
  onRemove?: () => void
}) {
  function setChild(i: number, node: ConditionNode) {
    onChange({ ...group, children: group.children.map((c, idx) => (idx === i ? node : c)) })
  }
  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Satisfazer</span>
        <Select value={group.op} onValueChange={(v) => onChange({ ...group, op: v as "AND" | "OR" })}>
          <SelectTrigger className="h-8 w-44" aria-label="Operador lógico">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">TODAS (AND)</SelectItem>
            <SelectItem value="OR">QUALQUER UMA (OR)</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={group.negate} onCheckedChange={(v) => onChange({ ...group, negate: v })} />
          Inverter resultado (NOT)
        </label>
        {group.negate && <Badge variant="secondary">NOT ativo</Badge>}
        {!root && onRemove && (
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onRemove}>
            <Trash2 className="mr-1 size-3.5" /> Remover grupo
          </Button>
        )}
      </div>
      {group.children.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {root ? "Sem condições: o fluxo dispara sempre que o gatilho ocorrer." : "Grupo vazio (ignorado)."}
        </p>
      )}
      <div className="space-y-2">
        {group.children.map((c, i) =>
          c.type === "rule" ? (
            <RuleEditor
              key={c.id}
              rule={c}
              onChange={(r) => setChild(i, r)}
              onRemove={() => onChange({ ...group, children: group.children.filter((_, idx) => idx !== i) })}
            />
          ) : (
            <GroupEditor
              key={c.id}
              group={c}
              onChange={(g) => setChild(i, g)}
              onRemove={() => onChange({ ...group, children: group.children.filter((_, idx) => idx !== i) })}
            />
          ),
        )}
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...group, children: [...group.children, newRule()] })}>
          <Plus className="mr-1 size-3.5" /> Condição
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange({ ...group, children: [...group.children, { ...emptyGroup(), op: "OR" }] })}
        >
          <FolderPlus className="mr-1 size-3.5" /> Subgrupo
        </Button>
      </div>
    </div>
  )
}

function VariableHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Variáveis: {TEMPLATE_VARIABLES.map((v) => `{{${v.key}}}`).join("  ")}
    </p>
  )
}

function ActionEditor({
  action,
  templates,
  onChange,
  onRemove,
}: {
  action: FlowAction
  templates: TemplateOption[]
  onChange: (a: FlowAction) => void
  onRemove: () => void
}) {
  const TemplateSelect = ({ value, onValue, none }: { value: number | null; onValue: (v: number | null) => void; none: string }) => (
    <Select value={value ? String(value) : "none"} onValueChange={(v) => onValue(v === "none" ? null : Number(v))}>
      <SelectTrigger aria-label="Modelo de documento">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{none}</SelectItem>
        {templates.map((t) => (
          <SelectItem key={t.id} value={String(t.id)}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const title =
    action.type === "send_email" ? "Enviar e-mail" : action.type === "generate_document" ? "Gerar documento PDF" : "Criar tarefa"
  const Icon = action.type === "send_email" ? Mail : action.type === "generate_document" ? FileText : ListChecks

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-primary" /> {title}
        </span>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label="Remover ação">
          <Trash2 className="size-4" />
        </Button>
      </div>
      {action.type === "send_email" && (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Destinatário</Label>
              <Select value={action.to} onValueChange={(v) => v && onChange({ ...action, to: v as "customer" | "custom" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">E-mail do cliente da venda</SelectItem>
                  <SelectItem value="custom">E-mail específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {action.to === "custom" && (
              <div className="space-y-1.5">
                <Label>E-mail(s)</Label>
                <Input value={action.customTo} placeholder="logistica@empresa.com" onChange={(e) => onChange({ ...action, customTo: e.target.value })} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Assunto</Label>
            <Input value={action.subject} onChange={(e) => onChange({ ...action, subject: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem</Label>
            <Textarea rows={4} value={action.body} onChange={(e) => onChange({ ...action, body: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Anexar PDF (modelo)</Label>
            <TemplateSelect value={action.attachTemplateId} onValue={(v) => onChange({ ...action, attachTemplateId: v })} none="Sem anexo" />
          </div>
          <VariableHint />
        </div>
      )}
      {action.type === "generate_document" && (
        <div className="space-y-1.5">
          <Label>Modelo de documento</Label>
          <TemplateSelect value={action.templateId} onValue={(v) => onChange({ ...action, templateId: v })} none="Selecione um modelo" />
          {templates.length === 0 && (
            <p className="text-xs text-muted-foreground">Crie um modelo na aba &quot;Modelos de documento&quot; (pode usar a IA).</p>
          )}
        </div>
      )}
      {action.type === "create_task" && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título da tarefa</Label>
            <Input value={action.title} onChange={(e) => onChange({ ...action, title: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={3} value={action.description} onChange={(e) => onChange({ ...action, description: e.target.value })} />
          </div>
          <VariableHint />
        </div>
      )}
    </div>
  )
}

export function FlowEditorDialog({
  open,
  onOpenChange,
  initial,
  templates,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: EditableFlow
  templates: TemplateOption[]
}) {
  const [flow, setFlow] = useState<EditableFlow>(initial)
  const [pending, start] = useTransition()

  function addAction(type: FlowAction["type"]) {
    const id = uid()
    const action: FlowAction =
      type === "send_email"
        ? { type, id, to: "customer", customTo: "", subject: "Pedido {{pedido.codigo}} - {{loja.nome}}", body: "Olá {{cliente.nome}},\n\nSegue o seu pedido {{pedido.codigo}} no valor de {{pedido.total}}.", attachTemplateId: null }
        : type === "generate_document"
          ? { type, id, templateId: null }
          : { type, id, title: "Liberar carga do pedido {{pedido.codigo}}", description: "Cliente: {{cliente.nome}}\nProdutos: {{pedido.produtos}}" }
    setFlow((f) => ({ ...f, actions: [...f.actions, action] }))
  }

  function submit() {
    start(async () => {
      try {
        await saveFlow({
          id: flow.id,
          name: flow.name,
          description: flow.description,
          trigger: flow.trigger,
          enabled: flow.enabled,
          conditions: flow.conditions,
          actions: flow.actions,
        })
        toast.success("Fluxo salvo.")
        onOpenChange(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar o fluxo.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{flow.id ? "Editar fluxo" : "Novo fluxo"}</DialogTitle>
          <DialogDescription>Defina o gatilho, as condições e as ações automáticas.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="flow-name">Nome</Label>
                <Input id="flow-name" value={flow.name} placeholder="Ex.: Liberação de carga - vendas acima de R$ 10 mil" onChange={(e) => setFlow({ ...flow, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>1. Quando disparar (gatilho)</Label>
                <Select value={flow.trigger} onValueChange={(v) => setFlow({ ...flow, trigger: v ?? flow.trigger })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="flow-desc">Descrição</Label>
              <Input id="flow-desc" value={flow.description} onChange={(e) => setFlow({ ...flow, description: e.target.value })} />
            </div>
          </section>

          <section className="space-y-2">
            <Label>2. Condições (opcional)</Label>
            <GroupEditor root group={flow.conditions} onChange={(g) => setFlow({ ...flow, conditions: g })} />
          </section>

          <section className="space-y-3">
            <Label>3. Ações (executadas em ordem)</Label>
            {flow.actions.map((a, i) => (
              <ActionEditor
                key={a.id}
                action={a}
                templates={templates}
                onChange={(na) => setFlow({ ...flow, actions: flow.actions.map((x, idx) => (idx === i ? na : x)) })}
                onRemove={() => setFlow({ ...flow, actions: flow.actions.filter((_, idx) => idx !== i) })}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addAction("send_email")}>
                <Mail className="mr-1 size-3.5" /> Enviar e-mail
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addAction("generate_document")}>
                <FileText className="mr-1 size-3.5" /> Gerar documento PDF
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addAction("create_task")}>
                <ListChecks className="mr-1 size-3.5" /> Criar tarefa
              </Button>
            </div>
          </section>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={flow.enabled} onCheckedChange={(v) => setFlow({ ...flow, enabled: v })} />
            Fluxo ativo
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Salvando..." : "Salvar fluxo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
