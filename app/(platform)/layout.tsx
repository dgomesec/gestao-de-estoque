import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAuthContext } from '@/lib/rbac'
import { ShieldCheck } from 'lucide-react'
import { PlatformSignOut } from '@/components/platform/platform-sign-out'

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/sign-in')
  if (!ctx.isPlatformAdmin) redirect('/dashboard')

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 md:px-8">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-foreground">Painel Master</span>
              <span className="text-xs text-muted-foreground">Gestão de clientes</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{ctx.user.email}</span>
            <PlatformSignOut />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  )
}
