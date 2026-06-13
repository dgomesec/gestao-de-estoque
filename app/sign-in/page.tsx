import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { user as userTable } from '@/lib/db/schema'
import { count } from 'drizzle-orm'
import { getActiveTenant } from '@/lib/tenant'
import { AuthForm } from '@/components/auth-form'
import { TenantBrandStyle } from '@/components/tenant-brand-style'

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/dashboard')

  const [[{ value: totalUsers }], tenant] = await Promise.all([
    db.select({ value: count() }).from(userTable),
    getActiveTenant(),
  ])

  // Sem tenant resolvido (domínio base/master), usa um nome neutro — nunca a
  // marca de um cliente específico.
  const brandName = tenant?.brandName?.trim() || tenant?.name || 'Gestão de Estoque'

  return (
    <>
      <TenantBrandStyle tenant={tenant} />
      <AuthForm
        needsBootstrap={Number(totalUsers) === 0}
        brand={{ name: brandName, logoUrl: tenant?.logoUrl ?? null }}
      />
    </>
  )
}
