import { redirect } from "next/navigation"
import { getAuthContext, hasPermission } from "@/lib/rbac"
import { getSettings } from "@/lib/exchange"
import { PageHeader } from "@/components/page-header"
import { SettingsManager } from "@/components/settings-manager"

export default async function SettingsPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")
  if (!hasPermission(ctx, "settings", "view")) redirect("/dashboard")

  const settings = await getSettings()

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Cotação do dólar e proteção cambial usadas em todo o sistema."
      />
      <SettingsManager initial={settings} canEdit={hasPermission(ctx, "settings", "update")} />
    </>
  )
}
