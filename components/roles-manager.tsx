"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { Plus, ShieldCheck, Pencil, Trash2, Users } from "lucide-react"
import { RESOURCES, ACTIONS, type Permission } from "@/lib/constants"
import {
  createRole,
  updateRolePermissions,
  updateRoleInfo,
  deleteRole,
  type RoleRow,
} from "@/app/actions/roles"

type Perms = { create: boolean; update: boolean; delete: boolean }

export function RolesManager({ roles, perms }: { roles: RoleRow[]; perms: Perms }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selected, setSelected] = useState<Set<Permission>>(new Set())
  const [isPending, startTransition] = useTransition()

  function togglePerm(p: Permission) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  function toggleResourceRow(resource: string) {
    const rowPerms = ACTIONS.map((a) => `${resource}:${a.key}` as Permission)
    const allOn = rowPerms.every((p) => selected.has(p))
    setSelected((prev) => {
      const next = new Set(prev)
      rowPerms.forEach((p) => (allOn ? next.delete(p) : next.add(p)))
      return next
    })
  }

  function openCreate() {
    setEditing(null)
    setName("")
    setDescription("")
    setSelected(new Set())
    setOpen(true)
  }

  function openEdit(role: RoleRow) {
    setEditing(role)
    setName(role.name)
    setDescription(role.description ?? "")
    setSelected(new Set(role.permissions))
    setOpen(true)
  }

  function submit() {
    if (!editing && !name.trim()) {
      toast.error("Informe o nome do papel")
      return
    }
    const perms = Array.from(selected)
    startTransition(async () => {
      try {
        if (editing) {
          if (!editing.isSystem && name.trim() !== editing.name) {
            await updateRoleInfo(editing.id, { name, description })
          } else if (!editing.isSystem) {
            await updateRoleInfo(editing.id, { name, description })
          }
          await updateRolePermissions(editing.id, perms)
          toast.success("Papel atualizado")
        } else {
          await createRole({ name, description, permissions: perms })
          toast.success("Papel criado")
        }
        setOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar papel")
      }
    })
  }

  function handleDelete(role: RoleRow) {
    if (!confirm(`Excluir o papel "${role.name}"?`)) return
    startTransition(async () => {
      try {
        await deleteRole(role.id)
        toast.success("Papel excluído")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao excluir")
      }
    })
  }

  return (
    <>
      {perms.create && (
        <div className="mb-4">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" aria-hidden="true" />
            Novo papel
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="flex items-center gap-1.5 text-base">
                  {role.isSuperAdmin && <ShieldCheck className="size-4 text-primary" />}
                  {role.name}
                </CardTitle>
                {role.isSystem && (
                  <Badge variant="outline" className="text-xs">
                    sistema
                  </Badge>
                )}
              </div>
              <CardDescription className="text-pretty">
                {role.description ?? "Sem descrição"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="size-3.5" />
                {role.userCount} usuário(s)
                <span className="mx-1">·</span>
                {role.isSuperAdmin ? "acesso total" : `${role.permissions.length} permissões`}
              </div>
              {(perms.update || (perms.delete && !role.isSystem)) && (
                <div className="flex gap-2">
                  {perms.update && !role.isSuperAdmin && (
                    <Button variant="outline" size="sm" onClick={() => openEdit(role)} className="gap-1.5">
                      <Pencil className="size-3.5" />
                      Editar
                    </Button>
                  )}
                  {perms.delete && !role.isSystem && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(role)}
                      className="gap-1.5 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                      Excluir
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{editing ? `Editar papel: ${editing.name}` : "Novo papel"}</DialogTitle>
            <DialogDescription>
              Defina permissões granulares por recurso e ação (visualizar, criar, editar, excluir).
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 overflow-y-auto px-6 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rname">Nome</Label>
                <Input
                  id="rname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={editing?.isSystem}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rdesc">Descrição</Label>
                <Textarea
                  id="rdesc"
                  rows={1}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={editing?.isSystem}
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Recurso</th>
                    {ACTIONS.map((a) => (
                      <th key={a.key} className="p-3 text-center font-medium">
                        {a.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RESOURCES.map((r) => (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => toggleResourceRow(r.key)}
                          className="font-medium hover:underline"
                        >
                          {r.label}
                        </button>
                      </td>
                      {ACTIONS.map((a) => {
                        const key = `${r.key}:${a.key}` as Permission
                        return (
                          <td key={a.key} className="p-3 text-center">
                            <Checkbox
                              checked={selected.has(key)}
                              onCheckedChange={() => togglePerm(key)}
                              aria-label={`${r.label} - ${a.label}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Salvando..." : editing ? "Salvar" : "Criar papel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
