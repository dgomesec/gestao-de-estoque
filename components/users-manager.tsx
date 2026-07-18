"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { Plus, MoreHorizontal, ShieldCheck, ShieldAlert, ShieldX, Trash2, UserCog, RotateCcw } from "lucide-react"
import {
  createUser,
  setUserRoles,
  deleteUser,
  setUserTwoFactorRequired,
  resetUserTwoFactor,
  type UserRow,
} from "@/app/actions/users"
import { formatDate } from "@/lib/format"
import { DataPagination, usePagination } from "@/components/ui/data-pagination"

type Role = { id: number; name: string; description: string | null; isSuperAdmin: boolean }

export function UsersManager({
  users,
  roles,
  currentUserId,
  perms,
}: {
  users: UserRow[]
  roles: Role[]
  currentUserId: string
  perms: { create: boolean; update: boolean; delete: boolean }
}) {
  const [createOpen, setCreateOpen] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)
  const [target, setTarget] = useState<UserRow | null>(null)
  const [selectedRoles, setSelectedRoles] = useState<number[]>([])
  const [form, setForm] = useState({ name: "", email: "", password: "" })
  const [isPending, startTransition] = useTransition()

  const { page, setPage, pageSize, setPageSize, pageItems, total, totalPages } = usePagination(users)

  function toggleRole(id: number) {
    setSelectedRoles((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    )
  }

  function openCreate() {
    setForm({ name: "", email: "", password: "" })
    setSelectedRoles([])
    setCreateOpen(true)
  }

  function openRoles(u: UserRow) {
    setTarget(u)
    setSelectedRoles(u.roleIds)
    setRolesOpen(true)
  }

  function submitCreate() {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      toast.error("Preencha nome, e-mail e senha (mín. 8 caracteres)")
      return
    }
    startTransition(async () => {
      try {
        await createUser({ ...form, roleIds: selectedRoles })
        toast.success("Usuário criado")
        setCreateOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao criar usuário")
      }
    })
  }

  function submitRoles() {
    if (!target) return
    startTransition(async () => {
      try {
        await setUserRoles(target.id, selectedRoles)
        toast.success("Papéis atualizados")
        setRolesOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar papéis")
      }
    })
  }

  function handleDelete(u: UserRow) {
    if (!confirm(`Excluir o usuário "${u.name}"?`)) return
    startTransition(async () => {
      try {
        await deleteUser(u.id)
        toast.success("Usuário excluído")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao excluir")
      }
    })
  }

  function handleToggleRequired(u: UserRow) {
    const next = !u.twoFactorRequired
    startTransition(async () => {
      try {
        await setUserTwoFactorRequired(u.id, next)
        toast.success(next ? "2FA agora é obrigatório para este usuário" : "2FA não é mais obrigatório")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar 2FA")
      }
    })
  }

  function handleResetTwoFactor(u: UserRow) {
    if (!confirm(`Redefinir (desativar) o 2FA de "${u.name}"? Ele precisará configurar novamente.`)) return
    startTransition(async () => {
      try {
        await resetUserTwoFactor(u.id)
        toast.success("2FA redefinido")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao redefinir 2FA")
      }
    })
  }

  return (
    <>
      {perms.create && (
        <div className="mb-4">
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" aria-hidden="true" />
            Novo usuário
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Papéis</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">
                        {u.name}
                        {u.id === currentUserId && (
                          <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.roleNames.length === 0 ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            Sem papel
                          </Badge>
                        ) : (
                          u.roleNames.map((name) => (
                            <Badge key={name} variant="secondary" className="gap-1">
                              {name === "super_admin" && <ShieldCheck className="size-3" />}
                              {name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.twoFactorEnabled ? (
                        <Badge className="gap-1 bg-chart-2 text-white hover:bg-chart-2">
                          <ShieldCheck className="size-3" aria-hidden="true" />
                          Ativo
                        </Badge>
                      ) : u.twoFactorRequired ? (
                        <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                          <ShieldAlert className="size-3" aria-hidden="true" />
                          Pendente
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-muted-foreground">
                          <ShieldX className="size-3" aria-hidden="true" />
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(u.createdAt)}
                    </TableCell>
                    <TableCell>
                      {(perms.update || perms.delete) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button variant="ghost" size="icon" aria-label="Ações">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            {perms.update && (
                              <DropdownMenuItem onClick={() => openRoles(u)}>
                                <UserCog className="mr-2 size-4" />
                                Gerenciar papéis
                              </DropdownMenuItem>
                            )}
                            {perms.update && (
                              <DropdownMenuItem onClick={() => handleToggleRequired(u)}>
                                {u.twoFactorRequired ? (
                                  <>
                                    <ShieldX className="mr-2 size-4" />
                                    Dispensar 2FA
                                  </>
                                ) : (
                                  <>
                                    <ShieldAlert className="mr-2 size-4" />
                                    Exigir 2FA
                                  </>
                                )}
                              </DropdownMenuItem>
                            )}
                            {perms.update && u.twoFactorEnabled && (
                              <DropdownMenuItem onClick={() => handleResetTwoFactor(u)}>
                                <RotateCcw className="mr-2 size-4" />
                                Redefinir 2FA
                              </DropdownMenuItem>
                            )}
                            {perms.delete && u.id !== currentUserId && (
                              <DropdownMenuItem
                                onClick={() => handleDelete(u)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 size-4" />
                                Excluir
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DataPagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="usuários"
          />
        </CardContent>
      </Card>

      {/* Criar usuário */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-md">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              Defina os dados de acesso e os papéis (perfis) do usuário.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 overflow-y-auto px-6 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="uname">Nome</Label>
              <Input id="uname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uemail">E-mail</Label>
              <Input
                id="uemail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="upass">Senha</Label>
              <Input
                id="upass"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Papéis</legend>
              <div className="grid gap-2">
                {roles.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40"
                  >
                    <Checkbox
                      checked={selectedRoles.includes(r.id)}
                      onCheckedChange={() => toggleRole(r.id)}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {r.isSuperAdmin && <ShieldCheck className="size-3.5" />}
                        {r.name}
                      </div>
                      {r.description && (
                        <p className="text-xs text-muted-foreground">{r.description}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={isPending}>
              {isPending ? "Criando..." : "Criar usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gerenciar papéis */}
      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Papéis de {target?.name}</DialogTitle>
            <DialogDescription>Selecione os papéis atribuídos a este usuário.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            {roles.map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/40"
              >
                <Checkbox
                  checked={selectedRoles.includes(r.id)}
                  onCheckedChange={() => toggleRole(r.id)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    {r.isSuperAdmin && <ShieldCheck className="size-3.5" />}
                    {r.name}
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                </div>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRolesOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submitRoles} disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
