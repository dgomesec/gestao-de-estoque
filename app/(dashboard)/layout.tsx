import { redirect } from 'next/navigation'
import { getAuthContext } from '@/lib/rbac'
import { NAV_ITEMS } from '@/lib/constants'
import { enabledFeatureSet } from '@/lib/tenant'
import { Sidebar } from '@/components/sidebar'
import { TenantBrandStyle } from '@/components/tenant-brand-style'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/sign-in')

  // Super-usuário de plataforma sem cliente selecionado vai para o painel master.
  if (ctx.isPlatformAdmin && !ctx.tenant) redirect('/admin')

  // Usuário comum sem cliente vinculado não tem onde operar.
  if (!ctx.tenant) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground text-balance">
            Conta sem cliente vinculado
          </h1>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            Sua conta ainda não está associada a nenhum cliente. Entre em contato
            com o administrador para liberar o acesso.
          </p>
        </div>
      </main>
    )
  }

  // Cliente suspenso bloqueia o acesso de todos os usuários (exceto plataforma).
  if (ctx.tenant.status === 'suspended' && !ctx.isPlatformAdmin) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-foreground text-balance">
            Acesso temporariamente suspenso
          </h1>
          <p className="mt-2 text-sm text-muted-foreground text-pretty">
            O acesso a esta conta está suspenso. Entre em contato com o suporte
            para regularizar a situação.
          </p>
        </div>
      </main>
    )
  }

  // Funcionalidades habilitadas para o tenant (gating por cliente).
  const features = enabledFeatureSet(ctx.tenant)

  // Itens de navegação visíveis: permissão de "view" E funcionalidade ativa.
  const items = NAV_ITEMS.filter((item) => {
    if (!features.has(item.resource as never)) return false
    return ctx.isSuperAdmin || ctx.permissions.has(`${item.resource}:view`)
  })

  const roleLabel = ctx.isPlatformAdmin
    ? 'Plataforma'
    : ctx.isSuperAdmin
      ? 'Super Admin'
      : ctx.roleNames.length > 0
        ? ctx.roleNames.join(', ')
        : 'Sem papel atribuído'

  return (
    <div className="flex min-h-svh flex-col md:flex-row bg-background">
      <TenantBrandStyle tenant={ctx.tenant} />
      <Sidebar
        items={items}
        user={{ name: ctx.user.name, email: ctx.user.email }}
        roleLabel={roleLabel}
        brand={{ name: 'Rareon Inventory Control', logoUrl: '/rareon-icon.png' }}
        isPlatformAdmin={ctx.isPlatformAdmin}
      />
      <div className="flex-1 min-w-0">
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
