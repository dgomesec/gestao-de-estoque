"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
import { Plus, MoreHorizontal, Pencil, Trash2, Search, Phone, Mail } from "lucide-react"
import {
  createCustomer,
  updateCustomer,
  deleteCustomer,
  type CustomerInput,
  type CustomerWithStats,
} from "@/app/actions/customers"
import { formatMoney, formatDate, type DisplayCurrency } from "@/lib/format"
import { isAquariumIndustry, PARTY_TYPES, partyTypeLabel } from "@/lib/industries"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DataPagination, usePagination } from "@/components/ui/data-pagination"

type Perms = { create: boolean; update: boolean; delete: boolean }

const EMPTY: CustomerInput = {
  name: "",
  phone: "",
  email: "",
  document: "",
  addressLine: "",
  city: "",
  state: "",
  zipCode: "",
  neighborhood: "",
  country: "Brasil",
  rgp: "",
  notes: "",
  partyType: "",
}

export function CustomersManager({
  customers,
  perms,
  currency = "BRL",
  industry = null,
}: {
  customers: CustomerWithStats[]
  perms: Perms
  currency?: DisplayCurrency
  industry?: string | null
}) {
  const showPartyType = isAquariumIndustry(industry)
  const [partyFilter, setPartyFilter] = useState("all")
  const [query, setQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CustomerWithStats | null>(null)
  const [form, setForm] = useState<CustomerInput>(EMPTY)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return customers.filter((c) => {
      if (showPartyType && partyFilter !== "all" && (c.partyType ?? "cliente") !== partyFilter) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.document ?? "").toLowerCase().includes(q)
      )
    })
  }, [customers, query, partyFilter, showPartyType])

  const { page, setPage, pageSize, setPageSize, pageItems, total, totalPages } = usePagination(
    filtered,
    `${query}|${partyFilter}`,
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setDialogOpen(true)
  }

  const [cepLoading, setCepLoading] = useState(false)

  async function lookupCep(raw: string) {
    const digits = raw.replace(/\D/g, "")
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const data = await res.json()
      if (data.erro) {
        toast.error("CEP não encontrado")
        return
      }
      setForm((f) => ({
        ...f,
        zipCode: `${digits.slice(0, 5)}-${digits.slice(5)}`,
        addressLine: data.logradouro || f.addressLine,
        neighborhood: data.bairro || f.neighborhood,
        city: data.localidade || f.city,
        state: (data.uf || f.state || "").toUpperCase(),
        country: "Brasil",
      }))
    } catch {
      toast.error("Não foi possível consultar o CEP")
    } finally {
      setCepLoading(false)
    }
  }

  function openEdit(c: CustomerWithStats) {
    setEditing(c)
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      document: c.document ?? "",
      addressLine: c.addressLine ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      zipCode: c.zipCode ?? "",
      neighborhood: c.neighborhood ?? "",
      country: c.country ?? "",
      rgp: c.rgp ?? "",
      notes: c.notes ?? "",
      partyType: c.partyType ?? "",
    })
    setDialogOpen(true)
  }

  function submit() {
    if (!form.name.trim()) {
      toast.error("O nome do cliente é obrigatório")
      return
    }
    startTransition(async () => {
      try {
        if (editing) {
          await updateCustomer(editing.id, form)
          toast.success("Cliente atualizado")
        } else {
          await createCustomer(form)
          toast.success("Cliente cadastrado")
        }
        setDialogOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar")
      }
    })
  }

  function handleDelete(c: CustomerWithStats) {
    if (!confirm(`Excluir o cliente "${c.name}"? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      try {
        await deleteCustomer(c.id)
        toast.success("Cliente excluído")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao excluir")
      }
    })
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Buscar por nome, telefone, e-mail ou documento"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {showPartyType && (
          <Select value={partyFilter} onValueChange={(v) => setPartyFilter(v ?? "all")}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por tipo">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              {PARTY_TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {perms.create && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" aria-hidden="true" />
            Novo cliente
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  {showPartyType && <TableHead>Tipo</TableHead>}
                  <TableHead>Contato</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                  <TableHead className="text-right">Total gasto</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showPartyType ? 7 : 6} className="h-32 text-center text-muted-foreground">
                      Nenhum cliente encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.document ? `Doc. ${c.document}` : `Desde ${formatDate(c.createdAt)}`}
                        </div>
                      </TableCell>
                      {showPartyType && (
                        <TableCell>
                          <Badge variant="outline">{partyTypeLabel(c.partyType)}</Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-sm">
                          {c.phone && (
                            <span className="flex items-center gap-1.5">
                              <Phone className="size-3 text-muted-foreground" aria-hidden="true" />
                              {c.phone}
                            </span>
                          )}
                          {c.email && (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="size-3" aria-hidden="true" />
                              {c.email}
                            </span>
                          )}
                          {!c.phone && !c.email && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.city || c.state ? `${c.city ?? ""}${c.city && c.state ? " / " : ""}${c.state ?? ""}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={c.salesCount > 0 ? "secondary" : "outline"}>{c.salesCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMoney(c.totalSpentBrl, currency)}
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
                                <DropdownMenuItem onClick={() => openEdit(c)}>
                                  <Pencil className="mr-2 size-4" />
                                  Editar
                                </DropdownMenuItem>
                              )}
                              {perms.delete && (
                                <DropdownMenuItem
                                  onClick={() => handleDelete(c)}
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
                  ))
                )}
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
            itemLabel="clientes"
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>
              Cadastre os dados de contato e endereço. Apenas o nome é obrigatório.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 overflow-y-auto px-6 py-4">
            {showPartyType && (
              <div className="space-y-1.5">
                <Label htmlFor="cparty">Tipo de cadastro</Label>
                <Select
                  value={form.partyType || "cliente"}
                  onValueChange={(v) => setForm({ ...form, partyType: v ?? "cliente" })}
                >
                  <SelectTrigger id="cparty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PARTY_TYPES.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cname">Nome</Label>
              <Input id="cname" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cphone">Telefone</Label>
                <Input id="cphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cdoc">CPF/CNPJ</Label>
                <Input id="cdoc" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
              </div>
            </div>

            {showPartyType && form.partyType === "pescador" && (
              <div className="space-y-1.5">
                <Label htmlFor="crgp">RGP (Registro Geral da Atividade Pesqueira)</Label>
                <Input id="crgp" value={form.rgp} onChange={(e) => setForm({ ...form, rgp: e.target.value })} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="cemail">E-mail</Label>
              <Input
                id="cemail"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="czip">CEP</Label>
                <Input
                  id="czip"
                  inputMode="numeric"
                  placeholder="00000-000"
                  value={form.zipCode}
                  onChange={(e) => {
                    setForm({ ...form, zipCode: e.target.value })
                    if (e.target.value.replace(/\D/g, "").length === 8) lookupCep(e.target.value)
                  }}
                />
                {cepLoading && <p className="text-xs text-muted-foreground">Buscando endereço...</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ccountry">País</Label>
                <Input id="ccountry" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="caddr">Endereço</Label>
              <Input
                id="caddr"
                value={form.addressLine}
                onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
                placeholder="Rua, número, complemento"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cneigh">Bairro</Label>
                <Input id="cneigh" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ccity">Cidade</Label>
                <Input id="ccity" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cstate">UF</Label>
                <Input
                  id="cstate"
                  maxLength={2}
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cnotes">Observações</Label>
              <Textarea
                id="cnotes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isPending}>
              {isPending ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
