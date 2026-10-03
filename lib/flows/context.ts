import "server-only"
import { db } from "@/lib/db"
import { customers, sales, tenants } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { getOrderByGroupId, getBaseUrl, type Order } from "@/lib/orders"
import { formatMoney, formatDate, formatSaleCode } from "@/lib/format"
import type { Facts } from "./evaluate"

export type OrderContext = {
  order: Order
  facts: Facts
  vars: Record<string, string>
  tenantId: string
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

  let city = ""
  let state = ""
  if (order.customer.id) {
    const [c] = await db.select().from(customers).where(eq(customers.id, order.customer.id))
    city = c?.city ?? ""
    state = c?.state ?? ""
  }

  const [profitRow] = await db
    .select({ p: sales.profitBrl })
    .from(sales)
    .where(and(eq(sales.groupId, groupId), eq(sales.tenantId, tenantId)))
  void profitRow
  const profitRows = await db
    .select({ p: sales.profitBrl })
    .from(sales)
    .where(and(eq(sales.groupId, groupId), eq(sales.tenantId, tenantId)))
  const profit = profitRows.reduce((s, r) => s + Number(r.p), 0)

  const qty = order.items.reduce((s, i) => s + i.quantity, 0)
  const total = order.currency === "USD" ? order.totalUsd : order.totalBrl
  const code = formatSaleCode(order.kind, order.id)
  const productsText = order.items.map((i) => `${i.quantity}x ${i.productName ?? "Produto"}`).join(", ")
  const base = getBaseUrl()

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
    "produtos.nomes": order.items.map((i) => i.productName ?? ""),
    "produtos.skus": order.items.map((i) => i.sku ?? ""),
    "cliente.nome": order.customer.name ?? "",
    "cliente.email": order.customer.email ?? "",
    "cliente.telefone": order.customer.phone ?? "",
    "cliente.documento": order.customer.document ?? "",
    "cliente.cidade": city,
    "cliente.estado": state,
    "cliente.identificado": order.customer.id != null,
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
    "cliente.nome": order.customer.name ?? "Cliente",
    "cliente.email": order.customer.email ?? "",
    "cliente.telefone": order.customer.phone ?? "",
    "cliente.documento": order.customer.document ?? "",
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
