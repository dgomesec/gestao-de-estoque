import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getAuditLogs, getAuditStats } from "@/app/actions/audit"
import { PageHeader } from "@/components/page-header"
import { AuditMonitor } from "@/components/audit-monitor"

export default async function AuditPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "audit", "view")) redirect("/dashboard")

  const [logs, stats] = await Promise.all([getAuditLogs(), getAuditStats()])

  return (
    <>
      <PageHeader
        title="Auditoria e Monitoramento"
        description="Registro completo de acessos e alterações: quem fez, o quê, quando e de onde."
      />
      <AuditMonitor initialLogs={logs} stats={stats} />
    </>
  )
}
