'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Package,
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  BarChart3,
  Users,
  UserRound,
  ShieldCheck,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  X,
} from 'lucide-react'

type NavItem = { href: string; label: string; resource: string }

const ICONS: Record<string, React.ElementType> = {
  '/dashboard': LayoutDashboard,
  '/produtos': Package,
  '/estoque': Boxes,
  '/vendas': ShoppingCart,
  '/clientes': UserRound,
  '/relatorios': BarChart3,
  '/usuarios': Users,
  '/papeis': ShieldCheck,
  '/configuracoes': Settings,
  '/auditoria': ScrollText,
}

export function Sidebar({
  items,
  user,
  roleLabel,
}: {
  items: NavItem[]
  user: { name: string; email: string }
  roleLabel: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const handleSignOut = async () => {
    await authClient.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <>
      {/* Top bar mobile */}
      <header className="md:hidden flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Package className="size-4" aria-hidden="true" />
          </div>
          <span className="font-semibold">EletroStock</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </header>

      <aside
        className={cn(
          'bg-sidebar text-sidebar-foreground flex flex-col w-64 shrink-0 border-r border-sidebar-border',
          'md:sticky md:top-0 md:h-svh',
          open
            ? 'fixed inset-x-0 top-[57px] bottom-0 z-40 w-full md:w-64'
            : 'hidden md:flex',
        )}
      >
        <div className="hidden md:flex items-center gap-2 px-5 py-5 border-b border-sidebar-border">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Package className="size-5" aria-hidden="true" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-semibold">EletroStock</span>
            <span className="text-xs text-sidebar-foreground/60">
              Gestão de estoque
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const Icon = ICONS[item.href] ?? LayoutDashboard
              const active =
                pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground text-sm font-medium">
              {initials || '?'}
            </div>
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/60">
                {roleLabel}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mt-1 w-full justify-start gap-3 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sair
          </Button>
        </div>
      </aside>
    </>
  )
}
