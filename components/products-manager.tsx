"use client"

import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
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
  DialogTrigger,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { Plus, MoreHorizontal, Pencil, Trash2, Search } from "lucide-react"
import { createProduct, updateProduct, deleteProduct, deleteProducts, type ProductInput } from "@/app/actions/products"
import { ProductImport } from "@/components/product-import"
import { FileUpload } from "@/components/file-upload"
import { ColorTag } from "@/components/color-tag"
import { ColorPicker } from "@/components/color-picker"
import { detectColor, colorFromLabel } from "@/lib/colors"
import { formatMoney, formatUSD, formatPct, type DisplayCurrency } from "@/lib/format"
import { DataPagination, usePagination } from "@/components/ui/data-pagination"

type Product = {
  id: number
  sku: string
  name: string
  description: string | null
  color: string | null
  colorHex: string | null
  quantity: number
  priceUsd: string
  marginMin: string
  marginMax: string
  reorderLevel: number
  importSource?: string
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  batch: "Lote",
  ai: "IA",
}

type Perms = { create: boolean; update: boolean; delete: boolean }

const EMPTY: ProductInput = {
  sku: "",
  name: "",
  description: "",
  color: "",
  colorHex: "",
  quantity: 0,
  priceUsd: 0,
  marginMin: 0,
  marginMax: 0,
  reorderLevel: 5,
}

export function ProductsManager({
  products,
  rate,
  currency = "BRL",
  showCostUsd = true,
  protectionPct,
  perms,
}: {
  products: Product[]
  rate: number
  currency?: DisplayCurrency
  showCostUsd?: boolean
  protectionPct: number
  perms: Perms
}) {
  const fmt = (v: number) => formatMoney(v, currency)
  // Quando o USD está oculto, o custo é informado direto na moeda escolhida;
  // o campo de custo e as colunas passam a exibir/rotular nessa moeda.
  const costLabel = showCostUsd ? "USD" : currency
  const fmtCost = (v: number) => (showCostUsd ? formatUSD(v) : fmt(v))
  const [query, setQuery] = useState("")
  const [colorFilter, setColorFilter] = useState<string>("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<ProductInput>(EMPTY)
  const [detailsFile, setDetailsFile] = useState<File | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Cor "efetiva" de um produto: usa a cor persistida (primeiro rótulo, caso
  // haja variações) e, na ausência dela, detecta a partir do nome.
  function effectiveColorLabel(p: Product): string | null {
    const stored = p.color?.split(",")[0]?.trim()
    if (stored) return stored
    return detectColor(p.name)?.label ?? null
  }

  // Cores distintas dos produtos (para o filtro por cor).
  const colorOptions = useMemo(() => {
    const map = new Map<string, { label: string; hex: string }>()
    for (const p of products) {
      const label = effectiveColorLabel(p)
      if (label && !map.has(label)) {
        const c = colorFromLabel(label) ?? detectColor(p.name)
        map.set(label, { label, hex: c?.hex ?? "#9ca3af" })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
  }, [products])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      const matchesText =
        !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      const matchesColor =
        colorFilter === "all" || (p.color ?? "").split(",").map((s) => s.trim()).includes(colorFilter) || effectiveColorLabel(p) === colorFilter
      return matchesText && matchesColor
    })
  }, [products, query, colorFilter])

  const { page, setPage, pageSize, setPageSize, pageItems, total, totalPages } = usePagination(
    filtered,
    `${query}|${colorFilter}`,
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setDetailsFile(null)
    setDialogOpen(true)
  }

  function openEdit(p: Product) {
    setEditing(p)
    setForm({
      sku: p.sku,
      name: p.name,
      description: p.description ?? "",
      color: p.color ?? "",
      colorHex: p.colorHex ?? "",
      quantity: p.quantity,
      priceUsd: Number(p.priceUsd),
      marginMin: Number(p.marginMin),
      marginMax: Number(p.marginMax),
      reorderLevel: p.reorderLevel,
    })
    setDetailsFile(null)
    setDialogOpen(true)
  }

  // Pré-visualização de custo e faixa de venda em BRL.
  const preview = useMemo(() => {
    const cost = form.priceUsd || 0
    const factor = rate * (1 + protectionPct / 100)
    return {
      costBrl: cost * factor,
      minBrl: cost * (1 + form.marginMin / 100) * factor,
      maxBrl: cost * (1 + form.marginMax / 100) * factor,
      minUsd: cost * (1 + form.marginMin / 100),
      maxUsd: cost * (1 + form.marginMax / 100),
    }
  }, [form, rate, protectionPct])

  function submit() {
    if ((!form.sku || !form.sku.trim()) || !form.name.trim()) {
      toast.error("SKU e nome são obrigatórios")
      return
    }
    if (form.priceUsd <= 0) {
      toast.error(`O preço de custo em ${costLabel} deve ser maior que zero`)
      return
    }
    if (form.marginMin > form.marginMax) {
      toast.error("A margem mínima não pode ser maior que a máxima")
      return
    }

    startTransition(async () => {
      try {
        if (editing) {
          await updateProduct(editing.id, form)
          toast.success("Produto atualizado")
        } else {
          const res = await createProduct(form)
          if (res.merged) {
            toast.warning(
              `Produto duplicado: mesclado com "${res.mergedWith?.name}". Estoque somado e mantidos os maiores valores.`,
            )
          } else {
            toast.success("Produto cadastrado")
          }
        }
        setDialogOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar")
      }
    })
  }

  function handleDelete(p: Product) {
    if (!confirm(`Excluir o produto "${p.name}"? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      try {
        await deleteProduct(p.id)
        toast.success("Produto excluído")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao excluir")
      }
    })
  }

  function toggleOne(id: number, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((p) => p.id)) : new Set())
  }

  function handleBulkDelete() {
    const ids = Array.from(selected)
    startTransition(async () => {
      try {
        const res = await deleteProducts(ids)
        if (res.deleted > 0) {
          toast.success(`${res.deleted} produto(s) excluído(s)`)
        }
        if (res.blocked.length > 0) {
          toast.warning(
            `${res.blocked.length} produto(s) não puderam ser excluídos (possuem vendas registradas)`,
          )
        }
        if (res.deleted === 0 && res.blocked.length === 0) {
          toast.info("Nenhum produto excluído")
        }
        setSelected(new Set())
        setBulkOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao excluir")
      }
    })
  }

  const allSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id))
  const someSelected = filtered.some((p) => selected.has(p.id))

  const factor = rate * (1 + protectionPct / 100)

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Buscar por nome ou SKU"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {colorOptions.length > 0 && (
            <Select value={colorFilter} onValueChange={(v) => setColorFilter(v ?? "all")}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Cor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as cores</SelectItem>
                {colorOptions.map((c) => (
                  <SelectItem key={c.label} value={c.label}>
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full border border-black/10"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {perms.create && (
          <div className="flex gap-2">
            <ProductImport />
            <Button onClick={openCreate} className="gap-2">
              <Plus className="size-4" aria-hidden="true" />
              Novo produto
            </Button>
          </div>
        )}
      </div>

      {perms.delete && selected.size > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">
            {selected.size} produto{selected.size > 1 ? "s" : ""} selecionado{selected.size > 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())} disabled={isPending}>
              Limpar seleção
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => setBulkOpen(true)}
              disabled={isPending}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {perms.delete && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={!allSelected && someSelected}
                        onCheckedChange={(checked) => toggleAll(checked === true)}
                        aria-label="Selecionar todos os produtos"
                      />
                    </TableHead>
                  )}
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  {showCostUsd && <TableHead className="text-right">Custo USD</TableHead>}
                  <TableHead className="text-right">Custo {currency}</TableHead>
                  <TableHead className="text-right">Faixa de venda ({currency})</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={(perms.delete ? 6 : 5) + (showCostUsd ? 1 : 0)} className="h-32 text-center text-muted-foreground">
                      Nenhum produto encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((p) => {
                    const cost = Number(p.priceUsd)
                    const costBrl = cost * factor
                    const minBrl = cost * (1 + Number(p.marginMin) / 100) * factor
                    const maxBrl = cost * (1 + Number(p.marginMax) / 100) * factor
                    const low = p.quantity <= p.reorderLevel
                    return (
                      <TableRow key={p.id} data-selected={selected.has(p.id) || undefined} className="data-[selected]:bg-muted/50">
                        {perms.delete && (
                          <TableCell>
                            <Checkbox
                              checked={selected.has(p.id)}
                              onCheckedChange={(checked) => toggleOne(p.id, checked === true)}
                              aria-label={`Selecionar ${p.name}`}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.name}</span>
                            <ColorTag name={p.name} color={p.color} hex={p.colorHex} />
                            {p.importSource && p.importSource !== "manual" && (
                              <Badge variant="outline" className="text-[10px] uppercase">
                                {SOURCE_LABELS[p.importSource] ?? p.importSource}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            SKU {p.sku} · margem {formatPct(Number(p.marginMin))}–{formatPct(Number(p.marginMax))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={low ? (p.quantity === 0 ? "destructive" : "secondary") : "outline"}>
                            {p.quantity}
                          </Badge>
                        </TableCell>
                        {showCostUsd && (
                          <TableCell className="text-right tabular-nums">{formatUSD(cost)}</TableCell>
                        )}
                        <TableCell className="text-right tabular-nums font-medium">{fmt(costBrl)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {fmt(minBrl)} – {fmt(maxBrl)}
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
                                  <DropdownMenuItem onClick={() => openEdit(p)}>
                                    <Pencil className="mr-2 size-4" />
                                    Editar
                                  </DropdownMenuItem>
                                )}
                                {perms.delete && (
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(p)}
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
                    )
                  })
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
            itemLabel="produtos"
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
            <DialogDescription>
              {showCostUsd
                ? `Valores monetários em dólar (USD). O custo em ${currency} é calculado com a cotação do dia e a proteção cambial.`
                : `Valores monetários em ${currency}. A proteção cambial é aplicada sobre o custo informado.`}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 overflow-y-auto px-6 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qty">Quantidade {editing ? "(via estoque)" : "inicial"}</Label>
                <Input
                  id="qty"
                  type="number"
                  min={0}
                  value={form.quantity}
                  disabled={!!editing}
                  onChange={(e) => setForm({ ...form, quantity: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="color">Cor</Label>
              <ColorPicker
                value={{ label: form.color ?? "", hex: form.colorHex ?? "" }}
                onChange={(v) => setForm({ ...form, color: v.label, colorHex: v.hex })}
                detectedHint={!form.color && !form.colorHex ? detectColor(form.name)?.label ?? null : null}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">Descrição</Label>
              <Textarea
                id="desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="price">Preço de custo ({costLabel})</Label>
                <Input
                  id="price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceUsd}
                  onChange={(e) => setForm({ ...form, priceUsd: Math.max(0, Number(e.target.value)) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reorder">Nível de reposição</Label>
                <Input
                  id="reorder"
                  type="number"
                  min={0}
                  value={form.reorderLevel}
                  onChange={(e) => setForm({ ...form, reorderLevel: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="mmin">Margem mínima (%)</Label>
                <Input
                  id="mmin"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.marginMin}
                  onChange={(e) => setForm({ ...form, marginMin: Math.max(0, Number(e.target.value)) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mmax">Margem máxima (%)</Label>
                <Input
                  id="mmax"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.marginMax}
                  onChange={(e) => setForm({ ...form, marginMax: Math.max(0, Number(e.target.value)) })}
                />
              </div>
            </div>

            {/* Upload de arquivo de detalhes (para joalheria/gemas) */}
            <FileUpload
              label="Arquivo de detalhes (opcional)"
              description="PDF, Excel ou imagens com certificado, documentação ou fotos (máx. 10MB)"
              accept=".pdf,.xlsx,.docx,.jpg,.jpeg,.png"
              maxSize={10 * 1024 * 1024}
              onFileSelect={setDetailsFile}
              currentFile={detailsFile ? { name: detailsFile.name, mimeType: detailsFile.type } : undefined}
              onRemove={() => setDetailsFile(null)}
            />

            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {!showCostUsd
                    ? `Custo em ${currency}`
                    : currency === "USD"
                      ? "Venda em dólar (US$)"
                      : `Cotação USD/${currency} ${rate.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}`}
                </span>
                <span>Proteção cambial {formatPct(protectionPct)}</span>
              </div>
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Custo final ({currency})</dt>
                  <dd className="font-medium tabular-nums">{fmt(preview.costBrl)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Venda mínima ({currency})</dt>
                  <dd className="tabular-nums">{fmt(preview.minBrl)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Venda máxima ({currency})</dt>
                  <dd className="tabular-nums">{fmt(preview.maxBrl)}</dd>
                </div>
              </dl>
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

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir {selected.size} produto{selected.size > 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Produtos com vendas registradas serão mantidos
              para preservar o histórico.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isPending}>
              {isPending ? "Excluindo..." : "Excluir selecionados"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
