"use server"

import { db } from "@/lib/db"
import { auditLogs } from "@/lib/db/schema"
import { requirePermission } from "@/lib/rbac"
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm"

export type AuditLogRow = {
  id: number
  userId: string | null
  userName: string | null
  userEmail: string | null
  action: string
  resource: string
  resourceId: string | null
  summary: string | null
  metadata: string | null
  ipAddress: string | null
  browser: string | null
  os: string | null
  country: string | null
  city: string | null
  createdAt: Date
}

export type AuditFilters = {
  action?: string
  resource?: string
  search?: string
  limit?: number
}

export async function getAuditLogs(filters: AuditFilters = {}): Promise<AuditLogRow[]> {
  await requirePermission("audit", "view")

  const conditions = []
  if (filters.action && filters.action !== "all") {
    conditions.push(eq(auditLogs.action, filters.action))
  }
  if (filters.resource && filters.resource !== "all") {
    conditions.push(eq(auditLogs.resource, filters.resource))
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`
    conditions.push(
      or(
        ilike(auditLogs.userName, q),
        ilike(auditLogs.userEmail, q),
        ilike(auditLogs.summary, q),
        ilike(auditLogs.ipAddress, q),
      ),
    )
  }

  return db
    .select()
    .from(auditLogs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(filters.limit ?? 200, 500))
}

export type AuditStats = {
  total: number
  last24h: number
  logins7d: number
  activeUsers7d: number
}

export async function getAuditStats(): Promise<AuditStats> {
  await requirePermission("audit", "view")

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [[{ total }], [{ last24h }], [{ logins7d }], [{ activeUsers7d }]] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(auditLogs),
    db
      .select({ last24h: sql<number>`count(*)` })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, dayAgo)),
    db
      .select({ logins7d: sql<number>`count(*)` })
      .from(auditLogs)
      .where(and(eq(auditLogs.action, "login"), gte(auditLogs.createdAt, weekAgo))),
    db
      .select({ activeUsers7d: sql<number>`count(distinct ${auditLogs.userId})` })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, weekAgo)),
  ])

  return {
    total: Number(total),
    last24h: Number(last24h),
    logins7d: Number(logins7d),
    activeUsers7d: Number(activeUsers7d),
  }
}
