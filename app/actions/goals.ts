'use server'

import { db } from '@/lib/db'
import { sales, salesGoals } from '@/lib/db/schema'
import { requirePermission } from '@/lib/rbac'
import { logAudit } from '@/lib/audit'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { currentMonth } from '@/lib/format'

/** Limites [início, fim) do mês "YYYY-MM". */
function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m, 1, 0, 0, 0, 0)
  return { start, end }
}

export type GoalProgress = {
  month: string
  revenueTargetBrl: number
  profitTargetBrl: number
  revenueActualBrl: number
  profitActualBrl: number
  revenuePct: number
  profitPct: number
  hasGoal: boolean
}

/**
 * Retorna a meta de um mês com o progresso real (vendas finalizadas).
 */
export async function getGoalProgress(month = currentMonth()): Promise<GoalProgress> {
  const ctx = await requirePermission('reports', 'view')

  const [goal] = await db
    .select()
    .from(salesGoals)
    .where(and(eq(salesGoals.tenantId, ctx.tenantId), eq(salesGoals.month, month)))
  const { start, end } = monthRange(month)

  const [agg] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${sales.totalBrl}), 0)`,
      profit: sql<number>`coalesce(sum(${sales.profitBrl}), 0)`,
    })
    .from(sales)
    .where(
      and(
        eq(sales.tenantId, ctx.tenantId),
        eq(sales.kind, 'sale'),
        gte(sales.createdAt, start),
        lte(sales.createdAt, end),
      ),
    )

  const revenueTargetBrl = goal ? Number(goal.revenueTargetBrl) : 0
  const profitTargetBrl = goal ? Number(goal.profitTargetBrl) : 0
  const revenueActualBrl = Number(agg?.revenue ?? 0)
  const profitActualBrl = Number(agg?.profit ?? 0)

  return {
    month,
    revenueTargetBrl,
    profitTargetBrl,
    revenueActualBrl,
    profitActualBrl,
    revenuePct: revenueTargetBrl > 0 ? (revenueActualBrl / revenueTargetBrl) * 100 : 0,
    profitPct: profitTargetBrl > 0 ? (profitActualBrl / profitTargetBrl) * 100 : 0,
    hasGoal: !!goal,
  }
}

/**
 * Lista as metas dos últimos N meses (com progresso), mais recente primeiro.
 */
export async function getGoalsHistory(months = 6): Promise<GoalProgress[]> {
  await requirePermission('reports', 'view')

  const list: GoalProgress[] = []
  const now = new Date()
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    list.push(await getGoalProgress(month))
  }
  return list
}

/**
 * Cria ou atualiza (upsert) a meta de um mês.
 */
export async function setGoal(input: {
  month: string
  revenueTargetBrl: number
  profitTargetBrl: number
}) {
  const ctx = await requirePermission('reports', 'update')

  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error('Mês inválido (use AAAA-MM)')
  const revenue = Math.max(0, Number(input.revenueTargetBrl) || 0)
  const profit = Math.max(0, Number(input.profitTargetBrl) || 0)

  await db
    .insert(salesGoals)
    .values({
      tenantId: ctx.tenantId,
      month: input.month,
      revenueTargetBrl: String(revenue),
      profitTargetBrl: String(profit),
      createdBy: ctx.user.id,
    })
    .onConflictDoUpdate({
      // Unicidade composta (tenantId, month) garante uma meta por mês/tenant.
      target: [salesGoals.tenantId, salesGoals.month],
      set: {
        revenueTargetBrl: String(revenue),
        profitTargetBrl: String(profit),
        updatedAt: new Date(),
      },
    })

  await logAudit({
    action: 'update',
    resource: 'settings',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Meta de ${input.month} definida (receita ${revenue}, lucro ${profit})`,
  })

  revalidatePath('/dashboard')
  revalidatePath('/relatorios')
}

/**
 * Exclui a meta de um mês.
 */
export async function deleteGoal(month: string) {
  const ctx = await requirePermission('reports', 'delete')

  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Mês inválido (use AAAA-MM)')

  const [existing] = await db
    .select()
    .from(salesGoals)
    .where(and(eq(salesGoals.tenantId, ctx.tenantId), eq(salesGoals.month, month)))
  if (!existing) throw new Error('Nenhuma meta definida para este mês')

  await db
    .delete(salesGoals)
    .where(and(eq(salesGoals.tenantId, ctx.tenantId), eq(salesGoals.month, month)))

  await logAudit({
    action: 'delete',
    resource: 'settings',
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Meta de ${month} excluída`,
  })

  revalidatePath('/dashboard')
  revalidatePath('/relatorios')
}
