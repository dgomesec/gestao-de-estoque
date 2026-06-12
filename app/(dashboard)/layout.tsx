import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/rbac'
import { NAV_ITEMS } from '@/lib/constants'
import { Sidebar } from '@/components/sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/sign-in')

  // Filtra itens de navegação pela permissão de "view" no recurso.
  const items = NAV_ITEMS.filter(
    (item) =>
      ctx.isSuperAdmin || ctx.permissions.has(`${item.resource}:view`),
  )

  const roleLabel = ctx.isSuperAdmin
    ? 'Super Admin'
    : ctx.roleNames.length > 0
      ? ctx.roleNames.join(', ')
      : 'Sem papel atribuído'

  return (
    <div className="flex min-h-svh flex-col md:flex-row bg-background">
      <Sidebar
        items={items}
        user={{ name: ctx.user.name, email: ctx.user.email }}
        roleLabel={roleLabel}
      />
      <div className="flex-1 min-w-0">
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
