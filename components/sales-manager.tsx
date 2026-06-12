"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { Plus, FileText, MoreHorizontal, CheckCircle2, XCircle, Trash2, Search, X, UserPen, Printer, Mail, MessageCircle, BadgeCheck } from "lucide-react"
import { registerSaleItems, convertQuote, cancelQuote, deleteSale, updateSaleCustomer, type SaleKind } from "@/app/actions/sales"
import { sendOrderEmail } from "@/app/actions/email"
import { ColorTag } from "@/components/color-tag"
import { distinctColors, detectColor, colorFromLabel } from "@/lib/colors"
import { formatBRL, formatUSD, formatDateTime, formatPct, formatSaleCode } from "@/lib/format"

type Sale = {
  id: number
  productName: string | null
  sku: string | null
  kind: string
  quantity: number
  unitPriceUsd: string
  exchangeRate: string
  marginPct: string
  totalUsd: string
  totalBrl: string
  profitBrl: string
  customer: string | null
  customerId: number | null
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  groupId: string | null
  approvalToken: string | null
  approvedAt: Date | null
  convertedAt: Date | null
  createdAt: Date
}

type ProductOpt = {
  id: number
  name: string
  sku: string
  color: string | null
  colorHex: string | null
  quantity: number
  priceUsd: string
  marginMin: string
  marginMax: string
}

type CustomerOpt = { id: number; name: string; phone: string | null }

type Perms = { create: boolean; update: boolean; delete: boolean }

// Item do carrinho da venda/orçamento em construção.
type CartItem = {
  productId: number
  name: string
  sku: string
  color: string | null
  colorHex: string | null
  available: number
  costUsd: number
  marginMin: number
  marginMax: number
  quantity: number
  unitPriceUsd: number
  marginPct: number
}

const NO_CUSTOMER = "none"

export function SalesManager({
  sales,
  products,
  customers,
  rate,
  protectionPct,
  perms,
}: {
  sales: Sale[]
  products: ProductOpt[]
  customers: CustomerOpt[]
  rate: number
  protectionPct: number
  perms: Perms
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<SaleKind>("sale")
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState("")
  // Filtro por cor aplicado à busca de produtos do carrinho.
  const [productColor, setProductColor] = useState<string>("all")
  const [searchFocused, setSearchFocused] = useState(false)
  const [useManualRate, setUseManualRate] = useState(false)
  const [manualRate, setManualRate] = useState(rate)
  const [customerId, setCustomerId] = useState<string>(NO_CUSTOMER)
  const [customerText, setCustomerText] = useState("")
  const [filter, setFilter] = useState<"all" | "sale" | "quote">("all")
  // Busca livre na lista de vendas (código, produto, SKU, cliente).
  const [listQuery, setListQuery] = useState("")
  // Filtro por cor na lista de vendas.
  const [listColor, setListColor] = useState<string>("all")
  // Edição de cliente de um registro já existente.
  const [editCustomerFor, setEditCustomerFor] = useState<Sale | null>(null)
  const [editCustomerId, setEditCustomerId] = useState<string>(NO_CUSTOMER)
  const [editCustomerText, setEditCustomerText] = useState("")
  // Seleção (individual ou múltipla) de registros para ações em lote.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isPending, startTransition] = useTransition()
  const blurTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const effectiveRate = useManualRate && manualRate > 0 ? manualRate : rate
  const factor = effectiveRate * (1 + protectionPct / 100)

  // Cores distintas presentes nos produtos vendidos (para o filtro por cor).
  const colorOptions = useMemo(() => distinctColors(sales.map((s) => s.productName)), [sales])

  const filteredSales = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    return sales.filter((s) => {
      if (filter !== "all" && s.kind !== filter) return false
      if (listColor !== "all" && detectColor(s.productName)?.label !== listColor) return false
      if (!q) return true
      const code = formatSaleCode(s.kind, s.id).toLowerCase()
      const haystack = [
        code,
        String(s.id),
        s.productName ?? "",
        s.sku ?? "",
        s.customerName ?? "",
        s.customer ?? "",
      ]
        .join(" ")
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [sales, filter, listQuery, listColor])

  // Cor "efetiva" de um produto: usa a cor persistida (primeiro rótulo, caso
  // haja variações) e, na ausência dela, detecta a partir do nome.
  function productColorLabel(p: ProductOpt): string | null {
    const stored = p.color?.split(",")[0]?.trim()
    if (stored) return stored
    return detectColor(p.name)?.label ?? null
  }

  // Cores distintas dos produtos disponíveis (para o filtro da busca no carrinho).
  const productColorOptions = useMemo(() => {
    const map = new Map<string, { label: string; hex: string }>()
    for (const p of products) {
      const label = productColorLabel(p)
      if (label && !map.has(label)) {
        const hex = colorFromLabel(label)?.hex ?? detectColor(p.name)?.hex ?? "#9ca3af"
        map.set(label, { label, hex })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
  }, [products])

  // Resultados da busca por nome ou SKU (somente produtos com estoque e ainda não no carrinho).
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    const inCart = new Set(cart.map((c) => c.productId))
    const base = products.filter((p) => {
      if (p.quantity <= 0 || inCart.has(p.id)) return false
      if (productColor !== "all" && productColorLabel(p) !== productColor) return false
      return true
    })
    if (!q) return base.slice(0, 8)
    return base
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 8)
  }, [search, products, cart, productColor])

  function openDialog() {
    setKind("sale")
    setCart([])
    setSearch("")
    setProductColor("all")
    setUseManualRate(false)
    setManualRate(rate)
    setCustomerId(NO_CUSTOMER)
    setCustomerText("")
    setOpen(true)
  }

  // Adiciona um produto ao carrinho, sugerindo preço pela margem mínima.
  function addProduct(p: ProductOpt) {
    const cost = Number(p.priceUsd)
    const min = Number(p.marginMin)
    const suggested = Math.round(cost * (1 + min / 100) * 100) / 100
    setCart((prev) => [
      ...prev,
      {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        color: p.color,
        colorHex: p.colorHex,
        available: p.quantity,
        costUsd: cost,
        marginMin: min,
        marginMax: Number(p.marginMax),
        quantity: 1,
        unitPriceUsd: suggested,
        marginPct: min,
      },
    ])
    setSearch("")
  }

  function removeItem(productId: number) {
    setCart((prev) => prev.filter((c) => c.productId !== productId))
  }

  function updateItem(productId: number, patch: Partial<CartItem>) {
    setCart((prev) => prev.map((c) => (c.productId === productId ? { ...c, ...patch } : c)))
  }

  // Edita o preço -> recalcula a margem do item.
  function onItemPriceChange(item: CartItem, value: number) {
    const price = Math.max(0, value)
    const margin = item.costUsd > 0 ? Math.round(((price - item.costUsd) / item.costUsd) * 10000) / 100 : 0
    updateItem(item.productId, { unitPriceUsd: price, marginPct: margin })
  }

  // Edita a margem -> recalcula o preço do item.
  function onItemMarginChange(item: CartItem, value: number) {
    const price = Math.round(item.costUsd * (1 + value / 100) * 100) / 100
    updateItem(item.productId, { marginPct: value, unitPriceUsd: price })
  }

  function onItemQtyChange(item: CartItem, value: number) {
    updateItem(item.productId, { quantity: Math.max(1, Math.trunc(value || 1)) })
  }

  // Totais agregados do carrinho.
  const totals = useMemo(() => {
    let totalUsd = 0
    let profitBrl = 0
    for (const c of cart) {
      const tUsd = c.unitPriceUsd * c.quantity
      totalUsd += tUsd
      profitBrl += (c.unitPriceUsd - c.costUsd) * c.quantity * factor
    }
    return { totalUsd, totalBrl: totalUsd * factor, profitBrl }
  }, [cart, factor])

  function submit() {
    if (cart.length === 0) {
      toast.error("Adicione ao menos um produto")
      return
    }
    for (const c of cart) {
      if (c.quantity <= 0 || c.unitPriceUsd <= 0) {
        toast.error(`Quantidade e preço de "${c.name}" devem ser maiores que zero`)
        return
      }
      if (c.quantity > c.available) {
        toast.error(`Estoque insuficiente para "${c.name}" (disponível: ${c.available})`)
        return
      }
    }
    startTransition(async () => {
      try {
        const res = await registerSaleItems({
          items: cart.map((c) => ({
            productId: c.productId,
            quantity: c.quantity,
            unitPriceUsd: c.unitPriceUsd,
            marginPct: c.marginPct,
          })),
          kind,
          manualRate: useManualRate ? manualRate : null,
          customerId: customerId !== NO_CUSTOMER ? Number(customerId) : null,
          customer: customerId === NO_CUSTOMER ? customerText : undefined,
        })
        toast.success(
          kind === "quote"
            ? `Orçamento com ${res.count} item(ns) registrado`
            : `Venda com ${res.count} item(ns) registrada`,
        )
        setOpen(false)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao registrar")
      }
    })
  }

  function handleConvert(s: Sale) {
    startTransition(async () => {
      try {
        await convertQuote(s.id)
        toast.success("Orçamento convertido em venda")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao converter")
      }
    })
  }

  function handleCancel(s: Sale) {
    if (!confirm(`Cancelar o orçamento #${s.id}? O estoque reservado será devolvido.`)) return
    startTransition(async () => {
      try {
        await cancelQuote(s.id)
        toast.success("Orçamento cancelado")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao cancelar")
      }
    })
  }

  function handleDelete(s: Sale) {
    if (!confirm(`Excluir a venda #${s.id}? O estoque será devolvido ao produto.`)) return
    startTransition(async () => {
      try {
        await deleteSale(s.id)
        toast.success("Venda excluída")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao excluir")
      }
    })
  }

  // Abre o diálogo de edição de cliente já preenchido com o vínculo atual.
  function openEditCustomer(s: Sale) {
    setEditCustomerFor(s)
    setEditCustomerId(s.customerId ? String(s.customerId) : NO_CUSTOMER)
    setEditCustomerText(s.customerId ? "" : s.customer ?? "")
  }

  function saveEditCustomer() {
    const s = editCustomerFor
    if (!s) return
    startTransition(async () => {
      try {
        await updateSaleCustomer(s.id, {
          customerId: editCustomerId !== NO_CUSTOMER ? Number(editCustomerId) : null,
          customer: editCustomerId === NO_CUSTOMER ? editCustomerText : null,
        })
        toast.success("Cliente atualizado")
        setEditCustomerFor(null)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar cliente")
      }
    })
  }

  // Abre o recibo/pedido em uma nova aba (página imprimível por groupId).
  function openReceipt(s: Sale) {
    if (!s.groupId) {
      toast.error("Recibo indisponível para este registro.")
      return
    }
    window.open(`/recibo/${s.groupId}`, "_blank", "noopener,noreferrer")
  }

  // Envia o recibo/orçamento por e-mail ao cliente via Resend.
  function handleSendEmail(s: Sale) {
    if (!s.groupId) {
      toast.error("Pedido sem identificador de grupo.")
      return
    }
    if (!s.customerEmail) {
      toast.error("O cliente não possui e-mail cadastrado. Edite o cliente para incluir um e-mail.")
      return
    }
    startTransition(async () => {
      const res = await sendOrderEmail(s.groupId!)
      if (res.ok) toast.success(`E-mail enviado para ${res.email}`)
      else toast.error(res.error)
    })
  }

  // Inicia uma conversa no WhatsApp com o cliente, já com a mensagem do pedido.
  function openWhatsApp(s: Sale) {
    const phone = (s.customerPhone ?? "").replace(/\D/g, "")
    if (!phone) {
      toast.error("O cliente não possui telefone cadastrado.")
      return
    }
    // Adiciona o DDI do Brasil (55) quando o número não o inclui.
    const fullPhone = phone.length <= 11 ? `55${phone}` : phone
    const code = formatSaleCode(s.kind, s.id)
    const name = s.customerName ?? s.customer ?? "cliente"
    const message =
      `Olá, ${name}! Tudo bem? ` +
      `Aqui é da ${"Gestão de Estoque"}. ` +
      `Recebemos a aprovação do seu orçamento ${code} e vamos dar sequência ao seu atendimento. ` +
      `Podemos confirmar os detalhes do pedido?`
    const url = `https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`
    window.open(url, "_blank", "noopener,noreferrer")
  }

  // ----- Seleção (individual e múltipla) e ações em lote -----

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Marca/desmarca todos os registros atualmente filtrados.
  function toggleAll() {
    setSelectedIds((prev) => {
      const allSelected = filteredSales.length > 0 && filteredSales.every((s) => prev.has(s.id))
      if (allSelected) return new Set()
      return new Set(filteredSales.map((s) => s.id))
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  // Registros atualmente selecionados (dentro do filtro vigente).
  const selectedSales = useMemo(
    () => filteredSales.filter((s) => selectedIds.has(s.id)),
    [filteredSales, selectedIds],
  )

  const allFilteredSelected =
    filteredSales.length > 0 && filteredSales.every((s) => selectedIds.has(s.id))
  const someFilteredSelected = filteredSales.some((s) => selectedIds.has(s.id))

  // Abre o(s) recibo(s) dos registros selecionados (um por pedido/groupId).
  function bulkReceipts() {
    const groups = Array.from(new Set(selectedSales.map((s) => s.groupId).filter(Boolean) as string[]))
    if (groups.length === 0) {
      toast.error("Nenhum recibo disponível para a seleção.")
      return
    }
    for (const g of groups) {
      window.open(`/recibo/${g}`, "_blank", "noopener,noreferrer")
    }
    toast.success(`${groups.length} recibo(s) aberto(s) em nova(s) aba(s).`)
  }

  // Envia para aprovação por e-mail os pedidos selecionados (um e-mail por pedido).
  function bulkSendEmail() {
    const seen = new Set<string>()
    const targets: Sale[] = []
    for (const s of selectedSales) {
      if (!s.groupId || seen.has(s.groupId)) continue
      seen.add(s.groupId)
      targets.push(s)
    }
    if (targets.length === 0) {
      toast.error("Nenhum pedido válido na seleção.")
      return
    }
    const withoutEmail = targets.filter((s) => !s.customerEmail).length
    startTransition(async () => {
      let sent = 0
      const errors: string[] = []
      for (const s of targets) {
        if (!s.customerEmail) continue
        const res = await sendOrderEmail(s.groupId!)
        if (res.ok) sent++
        else errors.push(`${formatSaleCode(s.kind, s.id)}: ${res.error}`)
      }
      if (sent > 0) toast.success(`${sent} e-mail(s) enviado(s) para aprovação.`)
      if (withoutEmail > 0) toast.error(`${withoutEmail} pedido(s) sem e-mail do cliente foram ignorados.`)
      if (errors.length > 0) toast.error(errors[0])
      clearSelection()
    })
  }

  // Ações de um registro (botão WhatsApp quando aprovado + menu suspenso).
  // Reutilizado na tabela (desktop) e nos cards (mobile).
  function renderActions(s: Sale) {
    const isQuote = s.kind === "quote"
    return (
      <div className="flex items-center justify-end gap-1">
        {isQuote && s.approvedAt && (
          <Button
            variant="ghost"
            size="icon"
            className="text-chart-2 hover:text-chart-2"
            aria-label="Contato por WhatsApp"
            title="Falar com o cliente no WhatsApp"
            onClick={() => openWhatsApp(s)}
          >
            <MessageCircle className="size-4" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label="Ações">
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openReceipt(s)}>
              <Printer className="mr-2 size-4" />
              Ver / imprimir recibo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSendEmail(s)} disabled={isPending}>
              <Mail className="mr-2 size-4" />
              {isQuote ? "Enviar para aprovação" : "Enviar por e-mail"}
            </DropdownMenuItem>
            {isQuote && s.approvedAt && (
              <DropdownMenuItem onClick={() => openWhatsApp(s)}>
                <MessageCircle className="mr-2 size-4" />
                Falar no WhatsApp
              </DropdownMenuItem>
            )}

            {(perms.update || perms.delete) && <DropdownMenuSeparator />}

            {perms.update && (
              <DropdownMenuItem onClick={() => openEditCustomer(s)}>
                <UserPen className="mr-2 size-4" />
                Editar cliente
              </DropdownMenuItem>
            )}
            {isQuote && perms.update && (
              <DropdownMenuItem onClick={() => handleConvert(s)}>
                <CheckCircle2 className="mr-2 size-4" />
                Converter em venda
              </DropdownMenuItem>
            )}
            {isQuote && perms.delete && (
              <DropdownMenuItem
                onClick={() => handleCancel(s)}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="mr-2 size-4" />
                Cancelar orçamento
              </DropdownMenuItem>
            )}
            {!isQuote && perms.delete && (
              <DropdownMenuItem
                onClick={() => handleDelete(s)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                Excluir venda
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  // Selo de tipo (Orçamento/Venda) + selo "Aprovado". Reutilizado na tabela e cards.
  function renderTypeBadges(s: Sale) {
    const isQuote = s.kind === "quote"
    return (
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant={isQuote ? "outline" : "secondary"} className="gap-1">
          {isQuote ? <FileText className="size-3" /> : <CheckCircle2 className="size-3" />}
          {isQuote ? "Orçamento" : "Venda"}
        </Badge>
        {isQuote && s.approvedAt && (
          <Badge className="gap-1 bg-chart-2 text-white hover:bg-chart-2">
            <BadgeCheck className="size-3" />
            Aprovado
          </Badge>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter((v as typeof filter) ?? "all")}>
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="sale">Vendas</TabsTrigger>
            <TabsTrigger value="quote">Orçamentos</TabsTrigger>
          </TabsList>
        </Tabs>
        {perms.create && (
          <Button onClick={openDialog} className="gap-2">
            <Plus className="size-4" aria-hidden="true" />
            Nova venda / orçamento
          </Button>
        )}
      </div>

      {/* Busca por identificador, produto, SKU ou cliente + filtro por cor. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Buscar por identificador, produto, SKU ou cliente"
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {colorOptions.length > 0 && (
          <Select value={listColor} onValueChange={(v) => setListColor(v ?? "all")}>
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

      <Card>
        <CardContent className="p-0">
          {selectedIds.size > 0 && (
            <div className="flex flex-col gap-3 border-b bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{selectedIds.size} selecionado(s)</Badge>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground" onClick={clearSelection}>
                  Limpar seleção
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={bulkReceipts} disabled={isPending}>
                  <Printer className="size-4" aria-hidden="true" />
                  Gerar recibo
                </Button>
                <Button size="sm" className="gap-2" onClick={bulkSendEmail} disabled={isPending}>
                  <Mail className="size-4" aria-hidden="true" />
                  {isPending ? "Enviando..." : "Enviar para aprovação"}
                </Button>
              </div>
            </div>
          )}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary align-middle"
                      aria-label="Selecionar todos"
                      checked={allFilteredSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected
                      }}
                      onChange={toggleAll}
                      disabled={filteredSales.length === 0}
                    />
                  </TableHead>
                  <TableHead>Identificador</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Qtd.</TableHead>
                  <TableHead className="text-right">Margem</TableHead>
                  <TableHead className="text-right">Total (BRL)</TableHead>
                  <TableHead className="text-right">Lucro (BRL)</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                      Nenhum registro encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSales.map((s) => {
                    const isQuote = s.kind === "quote"
                    const isSelected = selectedIds.has(s.id)
                    return (
                      <TableRow key={s.id} data-state={isSelected ? "selected" : undefined}>
                        <TableCell className="w-10">
                          <input
                            type="checkbox"
                            className="size-4 accent-primary align-middle"
                            aria-label={`Selecionar ${formatSaleCode(s.kind, s.id)}`}
                            checked={isSelected}
                            onChange={() => toggleOne(s.id)}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs font-medium">
                          {formatSaleCode(s.kind, s.id)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateTime(s.createdAt)}
                        </TableCell>
                        <TableCell>
                          {renderTypeBadges(s)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{s.productName ?? "—"}</span>
                            <ColorTag name={s.productName} />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            SKU {s.sku ?? "—"} · {formatUSD(Number(s.unitPriceUsd))}/un
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.customerName ?? s.customer ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{s.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatPct(Number(s.marginPct))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatBRL(Number(s.totalBrl))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-chart-2">
                          {formatBRL(Number(s.profitBrl))}
                        </TableCell>
                        <TableCell>
                          {renderActions(s)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Visão em cards para mobile: tudo acessível sem rolagem horizontal. */}
          <div className="flex flex-col gap-3 p-3 md:hidden">
            {filteredSales.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Nenhum registro encontrado.
              </div>
            ) : (
              filteredSales.map((s) => {
                const isSelected = selectedIds.has(s.id)
                return (
                  <div
                    key={s.id}
                    data-state={isSelected ? "selected" : undefined}
                    className="rounded-lg border bg-card p-3 data-[state=selected]:border-primary data-[state=selected]:bg-muted/40"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 shrink-0 accent-primary"
                        aria-label={`Selecionar ${formatSaleCode(s.kind, s.id)}`}
                        checked={isSelected}
                        onChange={() => toggleOne(s.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-medium text-muted-foreground">
                            {formatSaleCode(s.kind, s.id)}
                          </span>
                          {renderActions(s)}
                        </div>
                        <div className="mt-1">{renderTypeBadges(s)}</div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="font-medium">{s.productName ?? "—"}</span>
                          <ColorTag name={s.productName} />
                        </div>
                        <div className="text-xs text-muted-foreground">
                          SKU {s.sku ?? "—"} · {formatUSD(Number(s.unitPriceUsd))}/un
                        </div>
                        <div className="mt-1 text-sm">
                          {s.customerName ?? s.customer ?? (
                            <span className="text-muted-foreground">Sem cliente</span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className="text-muted-foreground">
                            Qtd.: <span className="tabular-nums text-foreground">{s.quantity}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Margem:{" "}
                            <span className="tabular-nums text-foreground">{formatPct(Number(s.marginPct))}</span>
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                          <span className="text-muted-foreground">
                            Total:{" "}
                            <span className="font-medium tabular-nums text-foreground">
                              {formatBRL(Number(s.totalBrl))}
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            Lucro:{" "}
                            <span className="tabular-nums text-chart-2">{formatBRL(Number(s.profitBrl))}</span>
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Nova venda ou orçamento</DialogTitle>
            <DialogDescription>
              Busque produtos por nome ou SKU e adicione quantos quiser. Orçamentos reservam o estoque e podem ser convertidos em venda depois.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 overflow-y-auto px-6 py-4">
            <Tabs value={kind} onValueChange={(v) => setKind((v as SaleKind) ?? "sale")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="sale">Venda</TabsTrigger>
                <TabsTrigger value="quote">Orçamento</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Busca por digitação (nome ou SKU) com resultados em dropdown. */}
            <div className="space-y-1.5">
              <Label htmlFor="product-search">Adicionar produto</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="product-search"
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
                              <span className="truncate">SKU {p.sku} · {formatUSD(Number(p.priceUsd))}/un</span>
                              <ColorTag name={p.name} color={p.color} hex={p.colorHex} className="border-transparent px-0 py-0" showLabel={false} />
                            </span>
                          </span>
                          <Badge variant="secondary" className="shrink-0">
                            {p.quantity} disp.
                          </Badge>
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
                {productColorOptions.length > 0 && (
                  <Select value={productColor} onValueChange={(v) => setProductColor(v ?? "all")}>
                    <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar produtos por cor">
                      <SelectValue placeholder="Cor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as cores</SelectItem>
                      {productColorOptions.map((c) => (
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
            </div>

            {/* Itens selecionados */}
            {cart.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nenhum produto adicionado. Use a busca acima para incluir produtos.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Produtos selecionados</Label>
                  <span className="text-xs text-muted-foreground">{cart.length} item(ns)</span>
                </div>
                {cart.map((item) => {
                  const belowMin = item.unitPriceUsd < item.costUsd * (1 + item.marginMin / 100) - 0.001
                  const aboveMax = item.unitPriceUsd > item.costUsd * (1 + item.marginMax / 100) + 0.001
                  const lineBrl = item.unitPriceUsd * item.quantity * factor
                  return (
                    <div key={item.productId} className="rounded-lg border p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 truncate font-medium">
                            <span className="truncate">{item.name}</span>
                            <ColorTag name={item.name} color={item.color} hex={item.colorHex} className="border-transparent px-0 py-0" showLabel={false} />
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            SKU {item.sku} · custo {formatUSD(item.costUsd)} · {item.available} disp.
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          aria-label={`Remover ${item.name}`}
                          onClick={() => removeItem(item.productId)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Qtd.</Label>
                          <Input
                            type="number"
                            min={1}
                            max={item.available}
                            value={item.quantity}
                            onChange={(e) => onItemQtyChange(item, Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Margem (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.marginPct}
                            onChange={(e) => onItemMarginChange(item, Number(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Preço un. (USD)</Label>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unitPriceUsd}
                            onChange={(e) => onItemPriceChange(item, Number(e.target.value))}
                          />
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        {(belowMin || aboveMax) ? (
                          <span className={belowMin ? "text-destructive" : "text-chart-3"}>
                            {belowMin ? "Abaixo da margem mínima" : "Acima da margem máxima"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Dentro da faixa de margem</span>
                        )}
                        <span className="font-medium tabular-nums">{formatBRL(lineBrl)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={customerId} onValueChange={(v) => setCustomerId(v ?? NO_CUSTOMER)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CUSTOMER}>Sem cliente / avulso</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {customerId === NO_CUSTOMER && (
                <Input
                  className="mt-2"
                  placeholder="Nome do cliente avulso (opcional)"
                  value={customerText}
                  onChange={(e) => setCustomerText(e.target.value)}
                />
              )}
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="mrate" className="text-sm">
                  Cotação manual (USD/BRL)
                </Label>
                <input
                  id="mrate-toggle"
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={useManualRate}
                  onChange={(e) => setUseManualRate(e.target.checked)}
                  aria-label="Usar cotação manual"
                />
              </div>
              <Input
                id="mrate"
                type="number"
                step="0.0001"
                className="mt-2"
                value={manualRate}
                disabled={!useManualRate}
                onChange={(e) => setManualRate(Math.max(0, Number(e.target.value)))}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {useManualRate
                  ? "Esta operação usará a cotação informada acima."
                  : `Usando a cotação do dia: ${rate.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}`}
              </p>
            </div>

            {cart.length > 0 && (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{cart.length} produto(s)</span>
                  <span>Cotação {effectiveRate.toLocaleString("pt-BR", { minimumFractionDigits: 4 })}</span>
                </div>
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total (USD)</dt>
                    <dd className="tabular-nums">{formatUSD(totals.totalUsd)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total (BRL)</dt>
                    <dd className="font-medium tabular-nums">{formatBRL(totals.totalBrl)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Lucro estimado (BRL)</dt>
                    <dd className="tabular-nums text-chart-2">{formatBRL(totals.profitBrl)}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={isPending || cart.length === 0}>
              {isPending
                ? "Registrando..."
                : kind === "quote"
                  ? "Registrar orçamento"
                  : "Registrar venda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edição do cliente de uma venda/orçamento já registrado. */}
      <Dialog open={editCustomerFor !== null} onOpenChange={(o) => !o && setEditCustomerFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Editar cliente
              {editCustomerFor ? ` · ${formatSaleCode(editCustomerFor.kind, editCustomerFor.id)}` : ""}
            </DialogTitle>
            <DialogDescription>
              Vincule um cliente cadastrado ou informe um nome avulso para este registro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Select value={editCustomerId} onValueChange={(v) => setEditCustomerId(v ?? NO_CUSTOMER)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CUSTOMER}>Sem cliente / avulso</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editCustomerId === NO_CUSTOMER && (
              <Input
                className="mt-2"
                placeholder="Nome do cliente avulso (opcional)"
                value={editCustomerText}
                onChange={(e) => setEditCustomerText(e.target.value)}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCustomerFor(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={saveEditCustomer} disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
