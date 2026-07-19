'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  createSegment,
  updateSegment,
  deleteSegment,
  type SegmentRow,
} from '@/app/actions/platform'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import { Plus, Trash2, Edit2 } from 'lucide-react'

export function SegmentsManager({ segments }: { segments: SegmentRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
            Segmentos de negócio
          </h2>
          <p className="text-sm text-muted-foreground">
            {segments.length} segmento(s) disponível(is)
          </p>
        </div>
        <CreateSegmentDialog onDone={() => router.refresh()} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {segments.map((seg) => (
          <Card key={seg.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle>{seg.label}</CardTitle>
                  {seg.isDefault && <Badge className="mt-1">Padrão</Badge>}
                </div>
                <div className="flex gap-1">
                  {!seg.isDefault && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          try {
                            await deleteSegment(seg.id)
                            toast.success('Segmento deletado')
                            router.refresh()
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Erro ao deletar')
                          }
                        })
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                  <EditSegmentDialog segment={seg} onDone={() => router.refresh()} />
                </div>
              </div>
              {seg.description && <CardDescription>{seg.description}</CardDescription>}
            </CardHeader>
            <CardContent>
              {seg.fields.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {seg.fields.map((f) => (
                    <Badge key={f} variant="secondary" className="text-xs">
                      {f}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function CreateSegmentDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    id: '',
    label: '',
    description: '',
    fields: '',
  })

  function handleSubmit() {
    const id = form.id.trim().toLowerCase()
    const label = form.label.trim()
    if (!id || !label) {
      toast.error('ID e rótulo são obrigatórios')
      return
    }

    startTransition(async () => {
      try {
        await createSegment({
          id,
          label,
          description: form.description || undefined,
          fields: form.fields
            ? form.fields.split(',').map((f) => f.trim())
            : undefined,
        })
        toast.success('Segmento criado com sucesso')
        setForm({ id: '', label: '', description: '', fields: '' })
        setOpen(false)
        onDone()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao criar segmento')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" aria-hidden="true" />
        Novo segmento
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo segmento de negócio</DialogTitle>
          <DialogDescription>
            Cria um novo tipo de produto com seus campos específicos.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="seg-id">ID (único, minúsculas)</Label>
            <Input
              id="seg-id"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
              placeholder="ex: ceramica"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="seg-label">Rótulo</Label>
            <Input
              id="seg-label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="ex: Cerâmica"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="seg-desc">Descrição (opcional)</Label>
            <Textarea
              id="seg-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Descrição do segmento"
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="seg-fields">Campos (separados por vírgula, opcional)</Label>
            <Textarea
              id="seg-fields"
              value={form.fields}
              onChange={(e) => setForm({ ...form, fields: e.target.value })}
              placeholder="ex: sku, name, quantity, priceUsd, materialType"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.id || !form.label}>
            {isPending ? 'Criando...' : 'Criar segmento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditSegmentDialog({ segment, onDone }: { segment: SegmentRow; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    label: segment.label,
    description: segment.description || '',
    fields: segment.fields.join(', '),
  })

  function handleSubmit() {
    startTransition(async () => {
      try {
        await updateSegment(segment.id, {
          label: form.label || undefined,
          description: form.description || undefined,
          fields: form.fields ? form.fields.split(',').map((f) => f.trim()) : undefined,
        })
        toast.success('Segmento atualizado')
        setOpen(false)
        onDone()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao atualizar')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>
        <Edit2 className="size-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar segmento</DialogTitle>
          <DialogDescription>{segment.id}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="esg-label">Rótulo</Label>
            <Input
              id="esg-label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="esg-desc">Descrição</Label>
            <Textarea
              id="esg-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="esg-fields">Campos (separados por vírgula)</Label>
            <Textarea
              id="esg-fields"
              value={form.fields}
              onChange={(e) => setForm({ ...form, fields: e.target.value })}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
