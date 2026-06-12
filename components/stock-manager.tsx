"use client"

import { useMemo, useRef, useState, useTransition } from "react"
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
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { ArrowDownToLine, ArrowUpFromLine, Search, X, Plus } from "lucide-react"
import { registerMovements } from "@/app/actions/stock"
import { ColorTag } from "@/components/color-tag"
import { formatDateTime } from "@/lib/format"

type Movement = {
  id: number
  productId: number
  productName: string | null
  sku: string | null
  type: string
  quantity: number
  note: string | null
  createdAt: Date
}

type ProductOpt = { id: number; name: string; sku: string; quantity: number }

type CartItem = {
  productId: number
  name: string
  sku: string
  available: number
  quantity: number
}

export function StockManager({
  movements,
  products,
  canCreate,
}: {
  movements: Movement[]
  products: ProductOpt[]
  canCreate: boolean
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"in" | "out">("in")
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState("")
  const [searchFocused, setSearchFocused] = useState(false)
  const [note, setNote] = useState("")
  const [filter, setFilter] = useState<"all" | "in" | "out">("all")
  const [isPending, startTransition] = useTransition()
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const filteredMovements = useMemo(() => {
    if (filter === "all") return movements
    return movements.filter((m) => m.type === filter)
  }, [movements, filter])

  // Resultados da busca por nome ou SKU, ocultando os já adicionados.
  // Para saída, só mostra itens com estoque disponível.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    const inCart = new Set(cart.map((c) => c.productId))
    const base = (type === "out" ? products.filter((p) => p.quantity > 0) : products).filter(
      (p) => !inCart.has(p.id),
    )
    if (!q) return base.slice(0, 8)
    return base
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 8)
  }, [search, products, type, cart])

  const totalUnits = useMemo(() => cart.reduce((sum, c) => sum + c.quantity, 0), [cart])

  function openDialog(t: "in" | "out") {
    setType(t)
    setCart([])
    setSearch("")
    setNote("")
    setOpen(true)
  }

  function addProduct(p: ProductOpt) {
    setCart((prev) => {
      if (prev.some((c) => c.productId === p.id)) return prev
      return [...prev, { productId: p.id, name: p.name, sku: p.sku, available: p.quantity, quantity: 1 }]
    })
    // Limpa apenas o texto e mantém o campo focado para continuar adicionando produtos.
    setSearch("")
    setSearchFocused(true)
    searchInputRef.current?.focus()
  }

  function removeProduct(productId: number) {
    setCart((prev) => prev.filter((c) => c.productId !== productId))
  }

  function setItemQty(productId: number, value: number) {
    setCart((prev) =>
      prev.map((c) => (c.productId === productId ? { ...c, quantity: Math.max(1, value || 1) } : c)),
    )
  }

  function submit() {
    if (cart.length === 0) {
      toast.error("Adicione ao menos um produto")
      return
    }
    for (const c of cart) {
      if (c.quantity <= 0) {
        toast.error(`Quantidade inválida para ${c.name}`)
        return
      }
      if (type === "out" && c.quantity > c.available) {
        toast.error(`Estoque insuficiente para ${c.name} (disponível: ${c.available})`)
        return
      }
    }
    startTransition(async () => {
      try {
        await registerMovements({
          type,
          note,
          items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        })
        toast.success(
          type === "in"
            ? `Entrada registrada para ${cart.length} produto(s)`
            : `Saída registrada para ${cart.length} produto(s)`,
        )
        setOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao registrar")
      }
    })
  }

  return (
    <>
      {canCreate && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button onClick={() => openDialog("in")} className="gap-2">
            <ArrowDownToLine className="size-4" aria-hidden="true" />
            Registrar entrada
          </Button>
          <Button onClick={() => openDialog("out")} variant="outline" className="gap-2">
            <ArrowUpFromLine className="size-4" aria-hidden="true" />
            Registrar saída
          </Button>
        </div>
      )}

      <div className="mb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter((v as typeof filter) ?? "all")}>
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="in">Entradas</TabsTrigger>
            <TabsTrigger value="out">Saídas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                      Nenhuma movimentação registrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMovements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDateTime(m.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{m.productName ?? "—"}</span>
                          <ColorTag name={m.productName} />
                        </div>
                        <div className="text-xs text-muted-foreground">SKU {m.sku ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        {m.type === "in" ? (
                          <Badge variant="secondary" className="gap-1 text-chart-2">
                            <ArrowDownToLine className="size-3" /> Entrada
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <ArrowUpFromLine className="size-3" /> Saída
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {m.type === "in" ? "+" : "-"}
                        {m.quantity}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.note ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {type === "in" ? "Registrar entrada de estoque" : "Registrar saída de estoque"}
            </DialogTitle>
            <DialogDescription>
              {type === "in"
                ? "Reposição, compra ou ajuste positivo de inventário. Adicione um ou mais produtos."
                : "Perda, devolução ou ajuste negativo de inventário. Adicione um ou mais produtos."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {/* Busca por digitação (nome ou SKU) com resultados em dropdown, igual ao registro de vendas. */}
            <div className="space-y-1.5">
              <Label htmlFor="stock-product-search">Adicionar produto</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="stock-product-search"
                  ref={searchInputRef}
                  className="pl-9"
                  placeholder="Digite o nome ou SKU do produto..."
                  value={search}
                  autoComplete="off"
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => {
                    blurTimeout.current = setTimeout(() => setSearchFocused(false), 150)
                  }}
                />
                {searchFocused && searchResults.length > 0 && (
                  <ul
                    className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md"
                    role="listbox"
                  >
                    {searchResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={(e) => {
                            e.preventDefault()
                            if (blurTimeout.current) clearTimeout(blurTimeout.current)
                            addProduct(p)
                          }}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{p.name}</span>
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="truncate">SKU {p.sku}</span>
                              <ColorTag name={p.name} className="border-transparent px-0 py-0" showLabel={false} />
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <Badge variant="secondary">{p.quantity} em estoque</Badge>
                            <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {searchFocused && search.trim() && searchResults.length === 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-sm text-muted-foreground shadow-md">
                    Nenhum produto encontrado.
                  </div>
                )}
              </div>
            </div>

            {/* Itens selecionados com quantidade editável por produto */}
            {cart.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum produto adicionado. Use a busca acima para incluir produtos.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Produtos selecionados</Label>
                  <span className="text-xs text-muted-foreground">
                    {cart.length} item(ns) · {totalUnits} unidade(s)
                  </span>
                </div>
                <div className="max-h-64 space-y-2 overflow-auto pr-1">
                  {cart.map((item) => {
                    const insufficient = type === "out" && item.quantity > item.available
                    return (
                      <div key={item.productId} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.name}</p>
                            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                              <span className="truncate">SKU {item.sku} · {item.available} em estoque</span>
                              <ColorTag name={item.name} className="border-transparent px-0 py-0" showLabel={false} />
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Input
                              type="number"
                              min={1}
                              max={type === "out" ? item.available : undefined}
                              value={item.quantity}
                              onChange={(e) => setItemQty(item.productId, Number(e.target.value))}
                              className="w-20 text-center"
                              aria-label={`Quantidade de ${item.name}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7"
                              aria-label={`Remover ${item.name}`}
                              onClick={() => removeProduct(item.productId)}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        </div>
                        {insufficient && (
                          <p className="mt-2 text-xs text-destructive">
                            Estoque insuficiente (disponível: {item.available}).
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="mvnote">Observação</Label>
              <Textarea
                id="mvnote"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: compra do fornecedor, ajuste de inventário..."
              />
              <p className="text-xs text-muted-foreground">
                A observação será aplicada a todos os produtos desta movimentação.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isPending || cart.length === 0}>
              {isPending ? "Registrando..." : `Registrar ${type === "in" ? "entrada" : "saída"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
