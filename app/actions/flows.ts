'use server'

import { generateText, Output } from 'ai'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { Resend } from 'resend'
import { renderStoredDocument } from '@/lib/flows/documents'
import { db } from '@/lib/db'
import { flows, flowRuns, flowTasks, documentTemplates, generatedDocuments, sales } from '@/lib/db/schema'
import { requirePermission } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { buildOrderContext } from '@/lib/flows/context'
import { saveGeneratedDocument } from '@/lib/flows/engine'
import { TRIGGERS, type ConditionGroup, type DocSpec, type FlowAction, TEMPLATE_VARIABLES } from '@/lib/flows/types'

const MODEL = 'google/gemini-2.5-flash'

function tenantOf(ctx: { tenantId: string | null }) {
  if (!ctx.tenantId) throw new Error('Selecione um cliente para usar fluxos.')
  return ctx.tenantId
}

// ---------- Fluxos ----------

export type FlowInput = {
  id?: number
  name: string
  description?: string | null
  trigger: string
  enabled: boolean
  conditions: ConditionGroup
  actions: FlowAction[]
}

export async function getFlows() {
  const ctx = await requirePermission('flows', 'view')
  const tenantId = tenantOf(ctx)
  return db.select().from(flows).where(eq(flows.tenantId, tenantId)).orderBy(desc(flows.updatedAt))
}

export async function saveFlow(input: FlowInput) {
  const ctx = await requirePermission('flows', input.id ? 'update' : 'create')
  const tenantId = tenantOf(ctx)
  if (!input.name.trim()) throw new Error('Informe um nome para o fluxo.')
  if (!TRIGGERS.some((t) => t.key === input.trigger)) throw new Error('Gatilho inválido.')
  if (input.actions.length === 0) throw new Error('Adicione ao menos uma ação.')

  const values = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    trigger: input.trigger,
    enabled: input.enabled,
    conditions: JSON.stringify(input.conditions),
    actions: JSON.stringify(input.actions),
    updatedAt: new Date(),
  }
  let id = input.id
  if (id) {
    await db.update(flows).set(values).where(and(eq(flows.id, id), eq(flows.tenantId, tenantId)))
  } else {
    const [row] = await db.insert(flows).values({ ...values, tenantId, createdBy: ctx.user.id }).returning()
    id = row.id
  }
  await logAudit({
    action: input.id ? 'update' : 'create',
    resource: 'flows',
    tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Fluxo "${values.name}" ${input.id ? 'atualizado' : 'criado'}`,
  })
  revalidatePath('/fluxos')
  return { id }
}

export async function toggleFlow(id: number, enabled: boolean) {
  const ctx = await requirePermission('flows', 'update')
  const tenantId = tenantOf(ctx)
  await db.update(flows).set({ enabled, updatedAt: new Date() }).where(and(eq(flows.id, id), eq(flows.tenantId, tenantId)))
  revalidatePath('/fluxos')
}

export async function deleteFlow(id: number) {
  const ctx = await requirePermission('flows', 'delete')
  const tenantId = tenantOf(ctx)
  await db.delete(flows).where(and(eq(flows.id, id), eq(flows.tenantId, tenantId)))
  await logAudit({
    action: 'delete', resource: 'flows', tenantId, userId: ctx.user.id, userName: ctx.user.name,
    userEmail: ctx.user.email, summary: `Fluxo #${id} excluído`,
  })
  revalidatePath('/fluxos')
}

export async function getFlowRuns(limit = 50) {
  const ctx = await requirePermission('flows', 'view')
  return db.select().from(flowRuns).where(eq(flowRuns.tenantId, tenantOf(ctx))).orderBy(desc(flowRuns.createdAt)).limit(limit)
}

// ---------- Tarefas ----------

export async function getTasks() {
  const ctx = await requirePermission('flows', 'view')
  return db.select().from(flowTasks).where(eq(flowTasks.tenantId, tenantOf(ctx))).orderBy(desc(flowTasks.createdAt)).limit(100)
}

export async function setTaskDone(id: number, done: boolean) {
  const ctx = await requirePermission('flows', 'update')
  await db
    .update(flowTasks)
    .set({ status: done ? 'done' : 'open', completedBy: done ? ctx.user.id : null, completedAt: done ? new Date() : null })
    .where(and(eq(flowTasks.id, id), eq(flowTasks.tenantId, tenantOf(ctx))))
  revalidatePath('/fluxos')
}

// ---------- Modelos de documento ----------

export async function getTemplates() {
  const ctx = await requirePermission('flows', 'view')
  return db.select().from(documentTemplates).where(eq(documentTemplates.tenantId, tenantOf(ctx))).orderBy(desc(documentTemplates.updatedAt))
}

const blockSchema = z.object({
  type: z.enum(['heading', 'paragraph', 'bullets', 'kv', 'items_table', 'totals', 'signatures', 'spacer']),
  text: z.string().nullable().describe('Texto para heading/paragraph.'),
  items: z.array(z.string()).nullable().describe('Itens para bullets.'),
  rows: z.array(z.object({ label: z.string(), value: z.string() })).nullable().describe('Linhas para kv.'),
  labels: z.array(z.string()).nullable().describe('Rótulos de assinatura para signatures.'),
})
const specSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable(),
  blocks: z.array(blockSchema),
})

function normalizeSpec(raw: z.infer<typeof specSchema>): DocSpec {
  const blocks: DocSpec['blocks'] = []
  for (const b of raw.blocks) {
    if (b.type === 'heading' && b.text) blocks.push({ type: 'heading', text: b.text })
    else if (b.type === 'paragraph' && b.text) blocks.push({ type: 'paragraph', text: b.text })
    else if (b.type === 'bullets' && b.items?.length) blocks.push({ type: 'bullets', items: b.items })
    else if (b.type === 'kv' && b.rows?.length) blocks.push({ type: 'kv', rows: b.rows })
    else if (b.type === 'signatures' && b.labels?.length) blocks.push({ type: 'signatures', labels: b.labels })
    else if (b.type === 'items_table' || b.type === 'totals' || b.type === 'spacer') blocks.push({ type: b.type })
  }
  return { title: raw.title, subtitle: raw.subtitle ?? undefined, blocks }
}

const AI_SYSTEM = `Você cria documentos comerciais em português do Brasil (autorizações de liberação de carga, propostas, termos, comprovantes, contratos simples).
Responda com a estrutura do documento. O visual (logo, cores, rodapé) é aplicado automaticamente pelo sistema, não se preocupe com design.
Use as variáveis no formato {{chave}} para dados do pedido, ex.: {{cliente.nome}}, {{pedido.codigo}}, {{pedido.total}}.
Variáveis disponíveis: ${TEMPLATE_VARIABLES.map((v) => v.key).join(', ')}.
Inclua um bloco "items_table" para listar os produtos do pedido e "totals" quando o valor for relevante. Use "signatures" quando houver assinatura.
Não invente dados que não foram fornecidos; use as variáveis.`

/** Gera um modelo de documento (reutilizável) a partir de uma descrição. */
export async function generateTemplateWithAI(prompt: string): Promise<DocSpec> {
  await requirePermission('flows', 'create')
  if (!prompt.trim()) throw new Error('Descreva o documento desejado.')
  const { output } = await generateText({
    model: MODEL,
    system: AI_SYSTEM,
    prompt: `Crie o modelo de documento: ${prompt}`,
    output: Output.object({ schema: specSchema }),
  })
  return normalizeSpec(output)
}

export async function saveTemplate(input: { id?: number; name: string; description?: string | null; spec: DocSpec }) {
  const ctx = await requirePermission('flows', input.id ? 'update' : 'create')
  const tenantId = tenantOf(ctx)
  if (!input.name.trim()) throw new Error('Informe um nome para o modelo.')
  if (!input.spec.blocks.length) throw new Error('O modelo está vazio.')
  const values = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    spec: JSON.stringify(input.spec),
    updatedAt: new Date(),
  }
  if (input.id) {
    await db.update(documentTemplates).set(values).where(and(eq(documentTemplates.id, input.id), eq(documentTemplates.tenantId, tenantId)))
  } else {
    await db.insert(documentTemplates).values({ ...values, tenantId, createdBy: ctx.user.id })
  }
  revalidatePath('/fluxos')
}

export async function deleteTemplate(id: number) {
  const ctx = await requirePermission('flows', 'delete')
  await db.delete(documentTemplates).where(and(eq(documentTemplates.id, id), eq(documentTemplates.tenantId, tenantOf(ctx))))
  revalidatePath('/fluxos')
}

// ---------- Documentos gerados ----------

export async function getRecentOrders() {
  const ctx = await requirePermission('flows', 'view')
  const rows = await db
    .select({ groupId: sales.groupId, id: sales.id, kind: sales.kind, customer: sales.customer, totalBrl: sales.totalBrl, createdAt: sales.createdAt })
    .from(sales)
    .where(eq(sales.tenantId, tenantOf(ctx)))
    .orderBy(desc(sales.createdAt))
    .limit(200)
  const seen = new Map<string, { groupId: string; id: number; kind: string; customer: string | null; totalBrl: number; createdAt: Date }>()
  for (const r of rows) {
    if (!r.groupId) continue
    const cur = seen.get(r.groupId)
    if (cur) cur.totalBrl += Number(r.totalBrl)
    else seen.set(r.groupId, { groupId: r.groupId, id: r.id, kind: r.kind, customer: r.customer, totalBrl: Number(r.totalBrl), createdAt: r.createdAt })
  }
  return Array.from(seen.values()).slice(0, 40)
}

export async function getGeneratedDocuments() {
  const ctx = await requirePermission('flows', 'view')
  return db
    .select({ id: generatedDocuments.id, title: generatedDocuments.title, groupId: generatedDocuments.groupId, source: generatedDocuments.source, createdAt: generatedDocuments.createdAt })
    .from(generatedDocuments)
    .where(eq(generatedDocuments.tenantId, tenantOf(ctx)))
    .orderBy(desc(generatedDocuments.createdAt))
    .limit(50)
}

/** Exclui um ou mais documentos gerados do cliente atual. */
export async function deleteGeneratedDocuments(ids: number[]) {
  const ctx = await requirePermission('flows', 'delete')
  const tenantId = tenantOf(ctx)
  const list = Array.from(new Set(ids.filter((n) => Number.isInteger(n))))
  if (list.length === 0) throw new Error('Selecione ao menos um documento.')
  await db.delete(generatedDocuments).where(and(eq(generatedDocuments.tenantId, tenantId), inArray(generatedDocuments.id, list)))
  await logAudit({
    action: 'delete',
    resource: 'flows',
    summary: `${list.length} documento(s) excluído(s)`,
    metadata: { ids: list },
  })
  revalidatePath('/fluxos')
  return { deleted: list.length }
}

/** Envia por e-mail os documentos selecionados (PDF ou Word) aos destinatários informados. */
export async function sendDocumentsEmail(input: { ids: number[]; to: string; subject: string; message: string; format: 'pdf' | 'docx' }) {
  const ctx = await requirePermission('flows', 'create')
  const tenantId = tenantOf(ctx)
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false as const, error: 'Envio de e-mail não configurado (RESEND_API_KEY ausente).' }

  const recipients = input.to.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (recipients.length === 0) return { ok: false as const, error: 'Informe ao menos um destinatário.' }
  const invalid = recipients.find((r) => !emailRe.test(r))
  if (invalid) return { ok: false as const, error: `E-mail inválido: ${invalid}` }
  if (recipients.length > 20) return { ok: false as const, error: 'Máximo de 20 destinatários.' }
  if (input.ids.length === 0 || input.ids.length > 10) return { ok: false as const, error: 'Selecione de 1 a 10 documentos.' }

  const docs = []
  for (const id of input.ids) {
    const d = await renderStoredDocument(tenantId, id, input.format)
    if (d) docs.push(d)
  }
  if (docs.length === 0) return { ok: false as const, error: 'Documentos não encontrados.' }

  const storeName = docs[0].storeName
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;">
    <h2 style="margin:0 0 16px;">${esc(storeName)}</h2>${esc(input.message).replace(/\n/g, '<br/>')}</div>`
  const safeName = storeName.replace(/[<>"]/g, '').trim() || 'Documentos'
  const from = process.env.RESEND_FROM_EMAIL || `${safeName} <onboarding@resend.dev>`

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from,
    to: recipients,
    subject: input.subject.trim() || `Documentos - ${storeName}`,
    html,
    replyTo: docs[0].storeEmail || undefined,
    attachments: docs.map((d) => ({ filename: d.filename, content: d.buffer })),
  })
  if (error) return { ok: false as const, error: error.message || 'Falha ao enviar e-mail.' }

  await logAudit({
    action: 'update',
    resource: 'flows',
    summary: `${docs.length} documento(s) enviado(s) por e-mail para ${recipients.join(', ')}`,
    metadata: { ids: input.ids, recipients },
  })
  return { ok: true as const, count: docs.length, recipients: recipients.length }
}

/** Gera um documento para um pedido, via modelo salvo ou instruções para a IA. */
export async function createDocumentForOrder(input: { groupId: string; templateId?: number | null; prompt?: string }) {
  const ctx = await requirePermission('flows', 'create')
  const tenantId = tenantOf(ctx)
  const oc = await buildOrderContext(tenantId, input.groupId)
  if (!oc) throw new Error('Pedido não encontrado.')

  let spec: DocSpec
  let source: 'template' | 'ai' = 'template'
  let templateId: number | null = null

  if (input.templateId) {
    const [t] = await db.select().from(documentTemplates).where(and(eq(documentTemplates.id, input.templateId), eq(documentTemplates.tenantId, tenantId)))
    if (!t) throw new Error('Modelo não encontrado.')
    spec = JSON.parse(t.spec) as DocSpec
    templateId = t.id
  } else if (input.prompt?.trim()) {
    source = 'ai'
    const data = {
      pedido: oc.vars,
      itens: oc.order.items.map((i) => ({ produto: i.productName, sku: i.sku, quantidade: i.quantity })),
    }
    const { output } = await generateText({
      model: MODEL,
      system: AI_SYSTEM,
      prompt: `Dados reais do pedido (JSON):\n${JSON.stringify(data)}\n\nInstruções do administrador:\n${input.prompt}`,
      output: Output.object({ schema: specSchema }),
    })
    spec = normalizeSpec(output)
  } else {
    throw new Error('Escolha um modelo ou descreva o documento.')
  }

  const doc = await saveGeneratedDocument(oc, spec, { source, templateId, createdBy: ctx.user.id })
  revalidatePath('/fluxos')
  return { id: doc.id, title: doc.title }
}
