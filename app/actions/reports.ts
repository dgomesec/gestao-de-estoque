"use server"

import { db } from "@/lib/db"
import { products, sales, customers } from "@/lib/db/schema"
import { requirePermission } from "@/lib/rbac"
import { getEffectiveRate, computeBrl } from "@/lib/exchange"
import { and, desc, eq, gte, lte, sql } from "drizzle-orm"

export type DashboardData = {
  rate: number
  manualRate: boolean
  protectionPct: number
  rateUpdatedAt: Date
  totalProducts: number
  totalUnits: number
  stockValueUsd: number
  stockValueBrl: number
  lowStock: { id: number; name: string; sku: string; quantity: number; reorderLevel: number }[]
  salesCount30d: number
  revenueBrl30d: number
  profitBrl30d: number
  salesByDay: { date: string; revenue: number; profit: number }[]
  topProducts: { name: string; units: number; revenue: number }[]
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function getDashboardData(): Promise<DashboardData> {
  const ctx = await requirePermission("reports", "view")

  const settings = await getEffectiveRate()
  const rate = settings.exchangeRate
  const protectionPct = settings.currencyProtectionPct

  const allProducts = await db.select().from(products).where(eq(products.tenantId, ctx.tenantId))
  const totalProducts = allProducts.length
  const totalUnits = allProducts.reduce((s, p) => s + p.quantity, 0)
  const stockValueUsd = allProducts.reduce((s, p) => s + Number(p.priceUsd) * p.quantity, 0)
  const stockValueBrl = computeBrl(stockValueUsd, rate, protectionPct)

  const lowStock = allProducts
    .filter((p) => p.quantity <= p.reorderLevel)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      quantity: p.quantity,
      reorderLevel: p.reorderLevel,
    }))

  const since = daysAgo(30)
  const recentSales = await db
    .select()
    .from(sales)
    .where(and(eq(sales.tenantId, ctx.tenantId), gte(sales.createdAt, since), eq(sales.kind, "sale")))

  const salesCount30d = recentSales.length
  const revenueBrl30d = recentSales.reduce((s, r) => s + Number(r.totalBrl), 0)
  const profitBrl30d = recentSales.reduce((s, r) => s + Number(r.profitBrl), 0)

  // Série diária dos últimos 30 dias.
  const dayMap = new Map<string, { revenue: number; profit: number }>()
  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i)
    const key = d.toISOString().slice(0, 10)
    dayMap.set(key, { revenue: 0, profit: 0 })
  }
  for (const r of recentSales) {
    const key = new Date(r.createdAt).toISOString().slice(0, 10)
    const entry = dayMap.get(key)
    if (entry) {
      entry.revenue += Number(r.totalBrl)
      entry.profit += Number(r.profitBrl)
    }
  }
  const salesByDay = Array.from(dayMap.entries()).map(([date, v]) => ({
    date,
    revenue: Math.round(v.revenue * 100) / 100,
    profit: Math.round(v.profit * 100) / 100,
  }))

  // Top produtos por receita (30 dias).
  const prodMap = new Map<number, { name: string; units: number; revenue: number }>()
  const productNameById = new Map(allProducts.map((p) => [p.id, p.name]))
  for (const r of recentSales) {
    const cur = prodMap.get(r.productId) ?? {
      name: productNameById.get(r.productId) ?? "—",
      units: 0,
      revenue: 0,
    }
    cur.units += r.quantity
    cur.revenue += Number(r.totalBrl)
    prodMap.set(r.productId, cur)
  }
  const topProducts = Array.from(prodMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({ name: p.name, units: p.units, revenue: Math.round(p.revenue * 100) / 100 }))

  return {
    rate,
    manualRate: settings.manualRate,
    protectionPct,
    rateUpdatedAt: settings.rateUpdatedAt,
    totalProducts,
    totalUnits,
    stockValueUsd,
    stockValueBrl,
    lowStock,
    salesCount30d,
    revenueBrl30d,
    profitBrl30d,
    salesByDay,
    topProducts,
  }
}

export type SalesReport = {
  rows: {
    id: number
    productName: string
    sku: string
    quantity: number
    totalUsd: number
    totalBrl: number
    profitBrl: number
    customer: string | null
    createdAt: Date
  }[]
  totalUnits: number
  totalRevenueBrl: number
  totalProfitBrl: number
}

export async function getSalesReport(days: number): Promise<SalesReport> {
  const ctx = await requirePermission("reports", "view")

  const since = daysAgo(days)
  return buildSalesReport(ctx.tenantId, since, null)
}

/**
 * Relatório de vendas em um intervalo de datas específico [from, to].
 * `from` e `to` no formato "YYYY-MM-DD". `to` é inclusivo (até o fim do dia).
 */
export async function getSalesReportByRange(from: string, to: string): Promise<SalesReport> {
  const ctx = await requirePermission("reports", "view")

  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T23:59:59.999`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Intervalo de datas inválido")
  }
  if (start > end) throw new Error("A data inicial não pode ser maior que a final")

  return buildSalesReport(ctx.tenantId, start, end)
}

async function buildSalesReport(tenantId: string, start: Date, end: Date | null): Promise<SalesReport> {
  const condition = end
    ? and(eq(sales.tenantId, tenantId), eq(sales.kind, "sale"), gte(sales.createdAt, start), lte(sales.createdAt, end))
    : and(eq(sales.tenantId, tenantId), eq(sales.kind, "sale"), gte(sales.createdAt, start))

  const rows = await db
    .select({
      id: sales.id,
      productName: products.name,
      sku: products.sku,
      quantity: sales.quantity,
      totalUsd: sales.totalUsd,
      totalBrl: sales.totalBrl,
      profitBrl: sales.profitBrl,
      customer: sales.customer,
      customerName: customers.name,
      createdAt: sales.createdAt,
    })
    .from(sales)
    .leftJoin(products, sql`${sales.productId} = ${products.id}`)
    .leftJoin(customers, eq(sales.customerId, customers.id))
    .where(condition)
    .orderBy(desc(sales.createdAt))

  const mapped = rows.map((r) => ({
    id: r.id,
    productName: r.productName ?? "—",
    sku: r.sku ?? "—",
    quantity: r.quantity,
    totalUsd: Number(r.totalUsd),
    totalBrl: Number(r.totalBrl),
    profitBrl: Number(r.profitBrl),
    customer: r.customerName ?? r.customer,
    createdAt: r.createdAt,
  }))

  return {
    rows: mapped,
    totalUnits: mapped.reduce((s, r) => s + r.quantity, 0),
    totalRevenueBrl: mapped.reduce((s, r) => s + r.totalBrl, 0),
    totalProfitBrl: mapped.reduce((s, r) => s + r.profitBrl, 0),
  }
}
