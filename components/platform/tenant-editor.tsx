'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  updateTenantBranding,
  updateTenantFeatures,
  setTenantStatus,
  createTenantAdmin,
  deleteTenant,
} from '@/app/actions/platform'
import { TOGGLEABLE_FEATURES } from '@/lib/tenant'
import { RESOURCE_LABELS, type ResourceKey } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Trash2, UserPlus, LogIn } from 'lucide-react'
import { impersonateTenant } from '@/app/actions/platform'

type TenantData = {
  id: string
  slug: string
  name: string
  status: string
  brandName: string | null
  logoUrl: string | null
  colorPrimary: string | null
  colorPrimaryForeground: string | null
  colorAccent: string | null
  colorAccentForeground: string | null
  colorBackground: string | null
  colorForeground: string | null
}

export function TenantEditor({
  tenant,
  features,
  userCount,
}: {
  tenant: TenantData
  features: Record<string, boolean>
  userCount: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
              {tenant.name}
            </h1>
            <Badge variant={tenant.status === 'active' ? 'default' : 'secondary'}>
              {tenant.status === 'active' ? 'Ativo' : 'Suspenso'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {tenant.slug} · {userCount} usuário(s) · ID {tenant.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await impersonateTenant(tenant.slug)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Erro ao acessar')
                }
              })
            }
          >
            <LogIn className="size-4" aria-hidden="true" />
            Acessar console
          </Button>
        </div>
      </div>

      <BrandingCard tenant={tenant} onDone={() => router.refresh()} />
      <FeaturesCard tenantId={tenant.id} features={features} onDone={() => router.refresh()} />

      <Card>
        <CardHeader>
          <CardTitle>Status e acesso</CardTitle>
          <CardDescription>Suspender bloqueia o acesso de todos os usuários do cliente.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await setTenantStatus(
                    tenant.id,
                    tenant.status === 'active' ? 'suspended' : 'active',
                  )
                  toast.success('Status atualizado')
                  router.refresh()
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Erro ao atualizar status')
                }
              })
            }
          >
            {tenant.status === 'active' ? 'Suspender cliente' : 'Reativar cliente'}
          </Button>
          <CreateAdminDialog tenantId={tenant.id} onDone={() => router.refresh()} />
        </CardContent>
      </Card>

      <DangerZone tenant={tenant} />
    </div>
  )
}

function BrandingCard({ tenant, onDone }: { tenant: TenantData; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    brandName: tenant.brandName ?? '',
    logoUrl: tenant.logoUrl ?? '',
    colorPrimary: tenant.colorPrimary ?? '',
    colorPrimaryForeground: tenant.colorPrimaryForeground ?? '',
    colorAccent: tenant.colorAccent ?? '',
    colorAccentForeground: tenant.colorAccentForeground ?? '',
    colorBackground: tenant.colorBackground ?? '',
    colorForeground: tenant.colorForeground ?? '',
  })

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const colorFields: { key: keyof typeof form; label: string }[] = [
    { key: 'colorPrimary', label: 'Primária' },
    { key: 'colorPrimaryForeground', label: 'Texto na primária' },
    { key: 'colorAccent', label: 'Destaque' },
    { key: 'colorAccentForeground', label: 'Texto no destaque' },
    { key: 'colorBackground', label: 'Fundo' },
    { key: 'colorForeground', label: 'Texto principal' },
  ]

  function handleSave() {
    startTransition(async () => {
      try {
        await updateTenantBranding(tenant.id, form)
        toast.success('Branding atualizado')
        onDone()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar branding')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identidade visual</CardTitle>
        <CardDescription>
          Nome de marca, logo e paleta de cores aplicados no console do cliente.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="brandName">Nome de marca</Label>
            <Input id="brandName" value={form.brandName} onChange={(e) => set('brandName', e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="logoUrl">URL do logo</Label>
            <Input id="logoUrl" value={form.logoUrl} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {colorFields.map((f) => (
            <div key={f.key} className="grid gap-2">
              <Label htmlFor={f.key}>{f.label}</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={f.label}
                  value={/^#([0-9a-f]{6})$/i.test(form[f.key]) ? form[f.key] : '#000000'}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent"
                />
                <Input id={f.key} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} placeholder="#RRGGBB" />
              </div>
            </div>
          ))}
        </div>
        <div>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar branding'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function FeaturesCard({
  tenantId,
  features,
  onDone,
}: {
  tenantId: string
  features: Record<string, boolean>
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    for (const f of TOGGLEABLE_FEATURES) init[f] = features[f] !== false
    return init
  })

  function handleSave() {
    startTransition(async () => {
      try {
        await updateTenantFeatures(tenantId, state)
        toast.success('Funcionalidades atualizadas')
        onDone()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar funcionalidades')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funcionalidades</CardTitle>
        <CardDescription>
          Ative ou desative módulos para este cliente. Itens desligados somem do menu e ficam inacessíveis.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {TOGGLEABLE_FEATURES.map((f) => (
            <label
              key={f}
              htmlFor={`feat-${f}`}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <span className="text-sm font-medium text-foreground">
                {RESOURCE_LABELS[f as ResourceKey] ?? f}
              </span>
              <Switch
                id={`feat-${f}`}
                checked={state[f]}
                onCheckedChange={(v) => setState((prev) => ({ ...prev, [f]: v }))}
              />
            </label>
          ))}
        </div>
        <div>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar funcionalidades'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CreateAdminDialog({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    startTransition(async () => {
      try {
        await createTenantAdmin(tenantId, form)
        toast.success('Administrador criado')
        setForm({ name: '', email: '', password: '' })
        setOpen(false)
        onDone()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao criar administrador')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UserPlus className="size-4" aria-hidden="true" />
        Adicionar administrador
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo administrador</DialogTitle>
          <DialogDescription>Cria um usuário com papel de Super Admin neste cliente.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="admin-name">Nome</Label>
            <Input id="admin-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-email">E-mail</Label>
            <Input id="admin-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="admin-password">Senha (mín. 8 caracteres)</Label>
            <Input id="admin-password" type="password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Criando...' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DangerZone({ tenant }: { tenant: TenantData }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteTenant(tenant.id, confirm)
        toast.success('Cliente excluído')
        router.push('/admin')
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao excluir cliente')
      }
    })
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Zona de perigo</CardTitle>
        <CardDescription>
          Excluir o cliente remove permanentemente todos os seus dados (produtos, vendas, usuários, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="destructive" />}>
            <Trash2 className="size-4" aria-hidden="true" />
            Excluir cliente
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Excluir {tenant.name}?</DialogTitle>
              <DialogDescription>
                Esta ação é irreversível. Para confirmar, digite o nome exato do cliente:{' '}
                <span className="font-semibold text-foreground">{tenant.name}</span>
              </DialogDescription>
            </DialogHeader>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={tenant.name} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isPending || confirm.trim() !== tenant.name}
              >
                {isPending ? 'Excluindo...' : 'Excluir permanentemente'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
