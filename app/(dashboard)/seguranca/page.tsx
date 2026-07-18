import { redirect } from "next/navigation"
import { getAuthContext } from "@/lib/rbac"
import { PageHeader } from "@/components/page-header"
import { TwoFactorCard } from "@/components/two-factor-card"

export default async function SecurityPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect("/sign-in")

  return (
    <>
      <PageHeader
        title="Segurança"
        description="Gerencie a proteção da sua conta e a verificação em duas etapas."
      />
      <div className="max-w-2xl">
        <TwoFactorCard enabled={ctx.twoFactorEnabled} required={ctx.twoFactorRequired} />
      </div>
    </>
  )
}
