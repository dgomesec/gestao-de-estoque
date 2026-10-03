import "server-only"
import { db } from "@/lib/db"
import { customers, sales, tenants } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getOrderByGroupId, getBaseUrl, type Order } from "@/lib/orders"
import { formatMoney, formatDate, formatSaleCode } from "@/lib/format"
import { partyTypeLabel } from "@/lib/industries"
import type { Facts } from "./evaluate"

export type OrderContext = {
  order: Order
  facts: Facts
  vars: Record<string, string>
  tenantId: string
}

type CustomerRow = typeof customers.$inferSelect

/** Expande um cadastro em `<prefixo>.<campo>`; sem cadastro, todos os campos ficam vazios. */
function partyFieldValues(
  prefix: string,
  row: CustomerRow | null,
  fallback?: { name?: string | null; email?: string | null; phone?: string | null; document?: string | null },
): Record<string, string> {
  return {
    [`${prefix}.nome`]: row?.name ?? fallback?.name ?? "",
    [`${prefix}.email`]: row?.email ?? fallback?.email ?? "",
    [`${prefix}.telefone`]: row?.phone ?? fallback?.phone ?? "",
    [`${prefix}.documento`]: row?.document ?? fallback?.document ?? "",
    [`${prefix}.rgp`]: row?.rgp ?? "",
    [`${prefix}.endereco`]: row?.addressLine ?? "",
    [`${prefix}.bairro`]: row?.neighborhood ?? "",
    [`${prefix}.cidade`]: row?.city ?? "",
    [`${prefix}.estado`]: row?.state ?? "",
    [`${prefix}.cep`]: row?.zipCode ?? "",
    [`${prefix}.pais`]: row?.country ?? "",
    [`${prefix}.observacoes`]: row?.notes ?? "",
  }
}

/** Monta fatos (para condições) e variáveis (para textos/documentos) de um pedido. */
export async function buildOrderContext(tenantId: string, groupId: string): Promise<OrderContext | null> {
  const order = await getOrderByGroupId(groupId)
  if (!order) return null

  // Garante isolamento de tenant (getOrderByGroupId é público por groupId).
  const [owner] = await db
    .select({ id: sales.id })
    .from(sales)
    .where(and(eq(sales.groupId, groupId), eq(sales.tenantId, tenantId)))
    .limit(1)
  if (!owner) return null

  let customerRow: CustomerRow | null = null
  let partyType = "cliente"
  if (order.customer.id) {
    const [c] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, order.customer.id), eq(customers.tenantId, tenantId)))
    customerRow = c ?? null
    partyType = c?.partyType ?? "cliente"
  }

  const profitRows = await db
    .select({ p: sales.profitBrl, fishermanId: sales.fishermanId })
    .from(sales)
    .where(and(eq(sales.groupId, groupId), eq(sales.tenantId, tenantId)))
  const profit = profitRows.reduce((s, r) => s + Number(r.p), 0)

  const fishermanId = profitRows.find((r) => r.fishermanId != null)?.fishermanId ?? null
  let fishermanRow: CustomerRow | null = null
  if (fishermanId != null) {
    const [f] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, fishermanId), eq(customers.tenantId, tenantId)))
    fishermanRow = f ?? null
  }
  // pescador.*: pescador associado ao pedido; sem associação, o próprio cadastro se for do tipo pescador.
  const pescadorRow = fishermanRow ?? (partyType === "pescador" ? customerRow : null)
  const fornecedorRow = partyType === "fornecedor" ? customerRow : null
  const partyVars: Record<string, string> = {
    ...partyFieldValues("cliente", customerRow, order.customer),
    ...partyFieldValues("pescador", pescadorRow),
    ...partyFieldValues("fornecedor", fornecedorRow),
  }

  const qty = order.items.reduce((s, i) => s + i.quantity, 0)
  const total = order.currency === "USD" ? order.totalUsd : order.totalBrl
  const code = formatSaleCode(order.kind, order.id)
  const productsText = order.items.map((i) => `${i.quantity}x ${i.productName ?? "Produto"}`).join(", ")
  const base = getBaseUrl()
  const invoiceList = (order.invoiceNumbers ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  const facts: Facts = {
    "pedido.tipo": order.kind,
    "pedido.aprovado": order.approvedAt != null,
    "pedido.total": order.totalBrl,
    "pedido.totalUsd": order.totalUsd,
    "pedido.moeda": order.currency,
    "pedido.itens": order.items.length,
    "pedido.quantidade": qty,
    "pedido.lucro": profit,
    "pedido.diaSemana": new Date(order.createdAt).getDay(),
    "pedido.notasFiscais": invoiceList,
    "pedido.qtdNotasFiscais": invoiceList.length,
    "pedido.temNotaFiscal": invoiceList.length > 0,
    "produtos.nomes": order.items.map((i) => i.productName ?? ""),
    "produtos.skus": order.items.map((i) => i.sku ?? ""),
    ...partyVars,
    "cliente.identificado": order.customer.id != null,
    "cliente.tipo": partyType,
    "pedido.temPescador": fishermanId != null,
  }

  const vars: Record<string, string> = {
    "loja.nome": order.store.name,
    "loja.email": order.store.email ?? "",
    "loja.telefone": order.store.phone ?? "",
    "loja.endereco": order.store.address ?? "",
    "pedido.codigo": code,
    "pedido.data": formatDate(order.createdAt),
    "pedido.tipo": order.kind === "quote" ? "Orçamento" : "Venda",
    "pedido.total": formatMoney(total, order.currency),
    "pedido.itens": String(order.items.length),
    "pedido.produtos": productsText,
    "pedido.notasFiscais": invoiceList.join(", "),
    ...partyVars,
    "cliente.nome": partyVars["cliente.nome"] || "Cliente",
    "cliente.tipo": partyTypeLabel(partyType),
    "link.recibo": `${base}/recibo/${order.groupId}`,
    "link.aprovacao": order.approvalToken ? `${base}/orcamento/${order.approvalToken}` : "",
    hoje: formatDate(new Date()),
  }
  return { order, facts, vars, tenantId }
}

export function renderVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => vars[k] ?? "")
}

export async function getTenantBrand(tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
  return t ?? null
}
