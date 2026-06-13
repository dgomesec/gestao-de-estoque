'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  createTenant,
  impersonateTenant,
  bulkSetTenantStatus,
  bulkToggleFeature,
  type TenantRow,
} from '@/app/actions/platform'
import { TOGGLEABLE_FEATURES } from '@/lib/features'
import { RESOURCE_LABELS, type ResourceKey } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, LogIn, Settings2, Building2 } from 'lucide-react'

// Detecta o "erro" especial lançado por `redirect()` em Server Actions, para
// que ele não seja tratado como falha (re-lançado para o Next concluir a navegação).
function isRedirectError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'digest' in e &&
    typeof (e as { digest?: unknown }).digest === 'string' &&
    (e as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  )
}

export function TenantsManager({ tenants }: { tenants: TenantRow[] }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tenants
    return tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q),
    )
  }, [tenants, query])

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((t) => t.id)),
    )
  }

  function handleImpersonate(slug: string) {
    startTransition(async () => {
      try {
        await impersonateTenant(slug)
      } catch (e) {
        // `redirect()` dentro do server action lança NEXT_REDIRECT — não é erro.
        if (isRedirectError(e)) throw e
        toast.error(e instanceof Error ? e.message : 'Erro ao acessar o cliente')
      }
    })
  }

  function runBulk(fn: () => Promise<unknown>, successMsg: string) {
    startTransition(async () => {
      try {
        await fn()
        toast.success(successMsg)
        setSelected(new Set())
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro na operação em massa')
      }
    })
  }

  const ids = Array.from(selected)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
            Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            {tenants.length} cliente(s) na plataforma
          </p>
        </div>
        <CreateTenantDialog onDone={() => router.refresh()} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, slug ou ID..."
          className="pl-9"
        />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selecionado(s)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => runBulk(() => bulkSetTenantStatus(ids, 'active'), 'Clientes reativados')}
            >
              Ativar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => runBulk(() => bulkSetTenantStatus(ids, 'suspended'), 'Clientes suspensos')}
            >
              Suspender
            </Button>
            <BulkFeatureControl ids={ids} disabled={isPending} onRun={runBulk} />
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 px-3 py-3">
                <Checkbox
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onCheckedChange={toggleAll}
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="px-3 py-3 font-medium">Cliente</th>
              <th className="hidden px-3 py-3 font-medium md:table-cell">Slug</th>
              <th className="hidden px-3 py-3 font-medium lg:table-cell">Usuários</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
            {filtered.map((t) => (
              <tr key={t.id} className="hover:bg-muted/30">
                <td className="px-3 py-3">
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={() => toggleOne(t.id)}
                    aria-label={`Selecionar ${t.name}`}
                  />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Building2 className="size-4" aria-hidden="true" />
                    </div>
                    <div className="flex flex-col leading-tight">
                      <span className="font-medium text-foreground">{t.name}</span>
                      <span className="text-xs text-muted-foreground">{t.brandName || '—'}</span>
                    </div>
                  </div>
                </td>
                <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{t.slug}</td>
                <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">{t.userCount}</td>
                <td className="px-3 py-3">
                  <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>
                    {t.status === 'active' ? 'Ativo' : 'Suspenso'}
                  </Badge>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => handleImpersonate(t.slug)}
                    >
                      <LogIn className="size-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Acessar</span>
                    </Button>
                    <Button
                      render={<Link href={`/admin/${t.id}`} />}
                      nativeButton={false}
                      size="sm"
                      variant="ghost"
                    >
                      <Settings2 className="size-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Gerenciar</span>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BulkFeatureControl({
  ids,
  disabled,
  onRun,
}: {
  ids: string[]
  disabled: boolean
  onRun: (fn: () => Promise<unknown>, msg: string) => void
}) {
  const [feature, setFeature] = useState<string>('')

  return (
    <div className="flex items-center gap-2">
      <Select value={feature} onValueChange={(v) => setFeature((v as string) ?? '')}>
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="Funcionalidade" />
        </SelectTrigger>
        <SelectContent>
          {TOGGLEABLE_FEATURES.map((f) => (
            <SelectItem key={f} value={f}>
              {RESOURCE_LABELS[f as ResourceKey] ?? f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !feature}
        onClick={() => onRun(() => bulkToggleFeature(ids, feature, true), 'Funcionalidade ativada')}
      >
        Ligar
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || !feature}
        onClick={() => onRun(() => bulkToggleFeature(ids, feature, false), 'Funcionalidade desativada')}
      >
        Desligar
      </Button>
    </div>
  )
}

function CreateTenantDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: '',
    slug: '',
    brandName: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
  })

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function autoSlug(name: string) {
    set('name', name)
    if (!form.slug) {
      set(
        'slug',
        name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 32),
      )
    }
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        await createTenant({
          name: form.name,
          slug: form.slug,
          brandName: form.brandName || undefined,
          adminName: form.adminName || undefined,
          adminEmail: form.adminEmail || undefined,
          adminPassword: form.adminPassword || undefined,
        })
        toast.success('Cliente criado com sucesso')
        setForm({ name: '', slug: '', brandName: '', adminName: '', adminEmail: '', adminPassword: '' })
        setOpen(false)
        onDone()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao criar cliente')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" aria-hidden="true" />
        Novo cliente
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>
            Cria um cliente com a estrutura padrão (papéis e configurações). O admin é opcional.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="t-name">Nome do cliente</Label>
            <Input id="t-name" value={form.name} onChange={(e) => autoSlug(e.target.value)} placeholder="Loja do João" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-slug">Slug (subdomínio)</Label>
            <Input id="t-slug" value={form.slug} onChange={(e) => set('slug', e.target.value)} placeholder="loja-do-joao" />
            <p className="text-xs text-muted-foreground">3-32 caracteres: letras minúsculas, números e hífen.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-brand">Nome de marca (opcional)</Label>
            <Input id="t-brand" value={form.brandName} onChange={(e) => set('brandName', e.target.value)} placeholder="Padrão: nome do cliente" />
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="mb-3 text-sm font-medium text-foreground">Administrador inicial (opcional)</p>
            <div className="flex flex-col gap-3">
              <div className="grid gap-2">
                <Label htmlFor="a-name">Nome</Label>
                <Input id="a-name" value={form.adminName} onChange={(e) => set('adminName', e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="a-email">E-mail</Label>
                <Input id="a-email" type="email" value={form.adminEmail} onChange={(e) => set('adminEmail', e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="a-pass">Senha (mín. 8 caracteres)</Label>
                <Input id="a-pass" type="password" value={form.adminPassword} onChange={(e) => set('adminPassword', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.name || !form.slug}>
            {isPending ? 'Criando...' : 'Criar cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
