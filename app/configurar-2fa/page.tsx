import { redirect } from "next/navigation"
import { getAuthContext } from "@/lib/rbac"
import { getActiveTenant } from "@/lib/tenant"
import { TenantBrandStyle } from "@/components/tenant-brand-style"
import { MandatoryTwoFactorSetup } from "@/components/mandatory-two-factor-setup"

/**
 * Tela de configuração OBRIGATÓRIA do 2FA, exibida fora do layout do dashboard
 * para não haver navegação lateral enquanto o acesso está bloqueado. O layout do
 * dashboard redireciona para cá quando `twoFactorRequired && !twoFactorEnabled`.
 */
export default async function MandatoryTwoFactorPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")

  // Já configurou ou não é obrigatório: volta ao sistema.
  if (ctx.twoFactorEnabled || !ctx.twoFactorRequired) redirect("/dashboard")

  const tenant = await getActiveTenant()

  return (
    <>
      <TenantBrandStyle tenant={tenant} />
      <MandatoryTwoFactorSetup
        brand={{ name: "Rareon Inventory Control", logoUrl: "/rareon-icon.png" }}
      />
    </>
  )
}
