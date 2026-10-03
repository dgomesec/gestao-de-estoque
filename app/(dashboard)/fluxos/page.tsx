import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import {
  getFlowRuns,
  getFlows,
  getGeneratedDocuments,
  getRecentOrders,
  getTasks,
  getTemplates,
} from "@/app/actions/flows"
import { PageHeader } from "@/components/page-header"
import { FlowsManager } from "@/components/flows/flows-manager"

const iso = (d: Date | string) => new Date(d).toISOString()

export default async function FlowsPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "flows", "view")) redirect("/dashboard")

  const [flows, runs, tasks, templates, orders, documents] = await Promise.all([
    getFlows(),
    getFlowRuns(),
    getTasks(),
    getTemplates(),
    getRecentOrders(),
    getGeneratedDocuments(),
  ])

  return (
    <>
      <PageHeader
        title="Fluxos de vendas"
        description="Automatize e-mails, documentos em PDF e tarefas a partir de vendas e orçamentos, com condições AND, OR e NOT."
      />
      <FlowsManager
        flows={flows.map((f) => ({
          id: f.id,
          name: f.name,
          description: f.description,
          trigger: f.trigger,
          enabled: f.enabled,
          conditions: f.conditions,
          actions: f.actions,
        }))}
        runs={runs.map((r) => ({ id: r.id, flowName: r.flowName, status: r.status, log: r.log, createdAt: iso(r.createdAt) }))}
        tasks={tasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          createdAt: iso(t.createdAt),
        }))}
        templates={templates.map((t) => ({ id: t.id, name: t.name, description: t.description, spec: t.spec }))}
        orders={orders.map((o) => ({
          groupId: o.groupId,
          kind: o.kind,
          customer: o.customer,
          totalBrl: o.totalBrl,
          createdAt: iso(o.createdAt),
        }))}
        documents={documents.map((d) => ({ id: d.id, title: d.title, source: d.source, createdAt: iso(d.createdAt) }))}
        perms={{
          create: hasPermission(ctx, "flows", "create"),
          update: hasPermission(ctx, "flows", "update"),
          delete: hasPermission(ctx, "flows", "delete"),
        }}
      />
    </>
  )
}
