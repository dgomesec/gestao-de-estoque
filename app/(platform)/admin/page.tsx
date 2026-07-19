import { getTenants, getAllSegments } from '@/app/actions/platform'
import { TenantsManager } from '@/components/platform/tenants-manager'
import { SegmentsManager } from '@/components/platform/segments-manager'
import { Separator } from '@/components/ui/separator'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const [tenants, segments] = await Promise.all([getTenants(), getAllSegments()])
  return (
    <div className="flex flex-col gap-8">
      <SegmentsManager segments={segments} />
      <Separator />
      <TenantsManager tenants={tenants} segments={segments} />
    </div>
  )
}
