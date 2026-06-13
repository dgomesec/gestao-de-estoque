import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, count } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tenants, user as userTable } from '@/lib/db/schema'
import { requirePlatformAdmin } from '@/lib/rbac'
import { parseFeatures } from '@/lib/tenant'
import { TenantEditor } from '@/components/platform/tenant-editor'
import { ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePlatformAdmin()
  const { id } = await params

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
  if (!tenant) notFound()

  const [{ value: userCount }] = await db
    .select({ value: count() })
    .from(userTable)
    .where(eq(userTable.tenantId, id))

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/admin"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Voltar para clientes
      </Link>
      <TenantEditor
        tenant={{
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          status: tenant.status,
          brandName: tenant.brandName,
          logoUrl: tenant.logoUrl,
          colorPrimary: tenant.colorPrimary,
          colorPrimaryForeground: tenant.colorPrimaryForeground,
          colorAccent: tenant.colorAccent,
          colorAccentForeground: tenant.colorAccentForeground,
          colorBackground: tenant.colorBackground,
          colorForeground: tenant.colorForeground,
        }}
        features={parseFeatures(tenant.features)}
        userCount={Number(userCount)}
      />
    </div>
  )
}
