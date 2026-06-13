import { getTenants } from '@/app/actions/platform'
import { TenantsManager } from '@/components/platform/tenants-manager'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const tenants = await getTenants()
  return <TenantsManager tenants={tenants} />
}
