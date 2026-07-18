import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getActiveTenant } from "@/lib/tenant"
import { TwoFactorChallenge } from "@/components/two-factor-challenge"
import { TenantBrandStyle } from "@/components/tenant-brand-style"

export default async function TwoFactorPage() {
  // Se já houver sessão completa, não há desafio pendente.
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/dashboard")

  const tenant = await getActiveTenant()

  return (
    <>
      <TenantBrandStyle tenant={tenant} />
      <TwoFactorChallenge
        brand={{ name: "Rareon Inventory Control", logoUrl: "/rareon-icon.png" }}
      />
    </>
  )
}
