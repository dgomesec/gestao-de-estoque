import "server-only"
import { Resend } from "resend"
import { db } from "@/lib/db"
import { flows, flowRuns, flowTasks, documentTemplates, generatedDocuments } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { buildOrderContext, getTenantBrand, renderVars, type OrderContext } from "./context"
import { evaluate } from "./evaluate"
import { renderDocumentPdf } from "./pdf"
import type { ConditionGroup, DocSpec, FlowAction, TriggerKey } from "./types"

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** Gera o PDF de um DocSpec com os dados do pedido e a marca do tenant. */
export async function generatePdfForOrder(ctx: OrderContext, spec: DocSpec) {
  const tenant = await getTenantBrand(ctx.tenantId)
  return renderDocumentPdf(spec, ctx.order, ctx.vars, {
    name: tenant?.brandName || tenant?.name || ctx.order.store.name,
    logoUrl: tenant?.logoUrl || ctx.order.store.logoUrl,
    colorPrimary: tenant?.colorPrimary ?? null,
    colorAccent: tenant?.colorAccent ?? null,
    colorForeground: tenant?.colorForeground ?? null,
  })
}

/** Persiste o documento (snapshot) para download posterior em PDF. */
export async function saveGeneratedDocument(
  ctx: OrderContext,
  spec: DocSpec,
  meta: { source: "template" | "ai" | "flow"; templateId?: number | null; flowId?: number | null; createdBy?: string | null },
) {
  const [row] = await db
    .insert(generatedDocuments)
    .values({
      tenantId: ctx.tenantId,
      title: renderVars(spec.title, ctx.vars),
      groupId: ctx.order.groupId,
      templateId: meta.templateId ?? null,
      flowId: meta.flowId ?? null,
      source: meta.source,
      payload: JSON.stringify({ spec, vars: ctx.vars }),
      createdBy: meta.createdBy ?? null,
    })
    .returning()
  return row
}

async function loadTemplateSpec(tenantId: string, id: number | null): Promise<{ spec: DocSpec; id: number } | null> {
  if (!id) return null
  const [t] = await db
    .select()
    .from(documentTemplates)
    .where(and(eq(documentTemplates.id, id), eq(documentTemplates.tenantId, tenantId)))
  if (!t) return null
  return { spec: safeJson<DocSpec>(t.spec, { title: t.name, blocks: [] }), id: t.id }
}

type StepResult = { action: string; ok: boolean; message: string }

async function runAction(action: FlowAction, ctx: OrderContext, flowId: number): Promise<StepResult> {
  try {
    if (action.type === "create_task") {
      await db.insert(flowTasks).values({
        tenantId: ctx.tenantId,
        flowId,
        groupId: ctx.order.groupId,
        title: renderVars(action.title, ctx.vars),
        description: renderVars(action.description ?? "", ctx.vars) || null,
      })
      return { action: "Criar tarefa", ok: true, message: renderVars(action.title, ctx.vars) }
    }

    if (action.type === "generate_document") {
      const tpl = await loadTemplateSpec(ctx.tenantId, action.templateId)
      if (!tpl) return { action: "Gerar documento", ok: false, message: "Modelo não encontrado." }
      const doc = await saveGeneratedDocument(ctx, tpl.spec, { source: "flow", templateId: tpl.id, flowId })
      return { action: "Gerar documento", ok: true, message: `${doc.title} (PDF #${doc.id})` }
    }

    if (action.type === "send_email") {
      const apiKey = process.env.RESEND_API_KEY
      if (!apiKey) return { action: "Enviar e-mail", ok: false, message: "RESEND_API_KEY ausente." }
      const to = action.to === "customer" ? ctx.vars["cliente.email"] : renderVars(action.customTo, ctx.vars)
      if (!to) return { action: "Enviar e-mail", ok: false, message: "Destinatário sem e-mail." }

      const attachments: { filename: string; content: Buffer }[] = []
      if (action.attachTemplateId) {
        const tpl = await loadTemplateSpec(ctx.tenantId, action.attachTemplateId)
        if (tpl) {
          const pdf = await generatePdfForOrder(ctx, tpl.spec)
          attachments.push({ filename: `${ctx.vars["pedido.codigo"]}-${renderVars(tpl.spec.title, ctx.vars).slice(0, 40).replace(/[^\w\- ]+/g, "")}.pdf`, content: pdf })
          await saveGeneratedDocument(ctx, tpl.spec, { source: "flow", templateId: tpl.id, flowId })
        }
      }

      const body = renderVars(action.body, ctx.vars)
      const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.55;">
        <h2 style="margin:0 0 16px;">${escapeHtml(ctx.order.store.name)}</h2>
        ${escapeHtml(body).replace(/\n/g, "<br/>")}
      </div>`
      const safeName = ctx.order.store.name.replace(/[<>"]/g, "").trim() || "Vendas"
      const from = process.env.RESEND_FROM_EMAIL || `${safeName} <onboarding@resend.dev>`
      const resend = new Resend(apiKey)
      const { error } = await resend.emails.send({
        from,
        to,
        subject: renderVars(action.subject, ctx.vars),
        html,
        replyTo: ctx.order.store.email || undefined,
        attachments: attachments.length ? attachments : undefined,
      })
      if (error) return { action: "Enviar e-mail", ok: false, message: error.message }
      return { action: "Enviar e-mail", ok: true, message: `Enviado para ${to}` }
    }
    return { action: "Desconhecida", ok: false, message: "Ação inválida." }
  } catch (err) {
    return { action: action.type, ok: false, message: err instanceof Error ? err.message : "Erro inesperado" }
  }
}

/**
 * Executa todos os fluxos ativos do tenant para o evento. Nunca lança erro:
 * falhas são registradas no histórico para não quebrar a venda.
 */
export async function runFlows(tenantId: string, trigger: TriggerKey, groupId: string): Promise<void> {
  try {
    const list = await db
      .select()
      .from(flows)
      .where(and(eq(flows.tenantId, tenantId), eq(flows.trigger, trigger), eq(flows.enabled, true)))
    if (list.length === 0) return

    const ctx = await buildOrderContext(tenantId, groupId)
    if (!ctx) return

    for (const flow of list) {
      const conditions = safeJson<ConditionGroup | null>(flow.conditions, null)
      const matched = evaluate(conditions && conditions.type === "group" ? conditions : null, ctx.facts)
      if (!matched) {
        await db.insert(flowRuns).values({
          tenantId, flowId: flow.id, flowName: flow.name, trigger, groupId, status: "skipped",
          log: JSON.stringify([{ action: "Condições", ok: true, message: "Condições não atendidas." }]),
        })
        continue
      }
      const actions = safeJson<FlowAction[]>(flow.actions, [])
      const log: StepResult[] = []
      for (const a of actions) log.push(await runAction(a, ctx, flow.id))
      await db.insert(flowRuns).values({
        tenantId, flowId: flow.id, flowName: flow.name, trigger, groupId,
        status: log.every((l) => l.ok) ? "success" : "error",
        log: JSON.stringify(log),
      })
    }
  } catch (err) {
    console.log("[v0] runFlows failed:", err instanceof Error ? err.message : String(err))
  }
}
