import { db } from "@/lib/db"
import { sales, products, customers } from "@/lib/db/schema"
import { eq, asc } from "drizzle-orm"
import { getSettings } from "@/lib/exchange"

/**
 * Representa um "pedido" completo: todas as linhas de `sales` que compartilham o
 * mesmo `groupId`, com os dados do cliente e os totais já somados. É a base do
 * recibo e da página pública de aprovação.
 */
export type OrderItem = {
  id: number
  productName: string | null
  sku: string | null
  quantity: number
  unitPriceUsd: string
  totalUsd: string
  totalBrl: string
}

export type Order = {
  // Número representativo do pedido (menor id do grupo), usado no código
  // legível do recibo (ex.: VND-000015 / ORC-000015).
  id: number
  groupId: string
  kind: "sale" | "quote"
  createdAt: Date
  approvedAt: Date | null
  approvalToken: string | null
  exchangeRate: string
  customer: {
    id: number | null
    name: string | null
    phone: string | null
    email: string | null
    document: string | null
  }
  items: OrderItem[]
  totalUsd: number
  totalBrl: number
  // Dados da loja exibidos no recibo/orçamento (vindos das configurações).
  store: {
    name: string
    logoUrl: string | null
    address: string | null
    phone: string | null
    email: string | null
  }
}

function mapRows(
  rows: {
    sale: typeof sales.$inferSelect
    productName: string | null
    sku: string | null
    customerName: string | null
    customerPhone: string | null
    customerEmail: string | null
    customerDocument: string | null
  }[],
  store: Order["store"],
): Order | null {
  if (rows.length === 0) return null
  const first = rows[0].sale
  let totalUsd = 0
  let totalBrl = 0
  const items: OrderItem[] = rows.map((r) => {
    totalUsd += Number(r.sale.totalUsd)
    totalBrl += Number(r.sale.totalBrl)
    return {
      id: r.sale.id,
      productName: r.productName,
      sku: r.sku,
      quantity: r.sale.quantity,
      unitPriceUsd: r.sale.unitPriceUsd,
      totalUsd: r.sale.totalUsd,
      totalBrl: r.sale.totalBrl,
    }
  })

  return {
    id: first.id,
    groupId: first.groupId ?? "",
    kind: (first.kind as "sale" | "quote") ?? "sale",
    createdAt: first.createdAt,
    approvedAt: first.approvedAt,
    approvalToken: first.approvalToken,
    exchangeRate: first.exchangeRate,
    customer: {
      id: first.customerId,
      name: rows[0].customerName ?? first.customer ?? null,
      phone: rows[0].customerPhone,
      email: rows[0].customerEmail,
      document: rows[0].customerDocument,
    },
    items,
    totalUsd,
    totalBrl,
    store,
  }
}

async function queryByColumn(column: "groupId" | "approvalToken", value: string): Promise<Order | null> {
  const rows = await db
    .select({
      sale: sales,
      productName: products.name,
      sku: products.sku,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerEmail: customers.email,
      customerDocument: customers.document,
    })
    .from(sales)
    .leftJoin(products, eq(sales.productId, products.id))
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(eq(sales[column], value))
    .orderBy(asc(sales.id))

  const settings = await getSettings()
  const store: Order["store"] = {
    name: settings.storeName?.trim() || "Sua Loja",
    logoUrl: settings.storeLogoUrl,
    address: settings.storeAddress,
    phone: settings.storePhone,
    email: settings.storeEmail,
  }

  return mapRows(rows, store)
}

/** Busca um pedido completo pelo identificador de grupo. */
export function getOrderByGroupId(groupId: string) {
  return queryByColumn("groupId", groupId)
}

/** Busca um pedido completo pelo token público de aprovação. */
export function getOrderByToken(token: string) {
  return queryByColumn("approvalToken", token)
}

/** Retorna a URL base da aplicação para montar links absolutos. */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}
