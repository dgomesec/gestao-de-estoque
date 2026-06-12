"use server"

import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { requirePermission } from "@/lib/rbac"
import { logAudit } from "@/lib/audit"
import { getEffectiveRate } from "@/lib/exchange"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

export async function updateSettings(input: {
  exchangeRate: number
  manualRate: boolean
  currencyProtectionPct: number
}) {
  const ctx = await requirePermission("settings", "update")

  if (!Number.isFinite(input.exchangeRate) || input.exchangeRate <= 0) {
    throw new Error("Cotação inválida")
  }
  if (!Number.isFinite(input.currencyProtectionPct) || input.currencyProtectionPct < 0) {
    throw new Error("Proteção cambial inválida")
  }

  await db
    .update(settings)
    .set({
      exchangeRate: String(input.exchangeRate),
      manualRate: input.manualRate,
      currencyProtectionPct: String(input.currencyProtectionPct),
      rateUpdatedAt: new Date(),
    })
    .where(eq(settings.id, 1))

  await logAudit({
    action: "update",
    resource: "settings",
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Configurações atualizadas (câmbio ${input.manualRate ? "manual" : "automático"}: R$ ${input.exchangeRate}, proteção ${input.currencyProtectionPct}%)`,
    metadata: { ...input },
  })

  revalidatePath("/configuracoes")
  revalidatePath("/produtos")
  revalidatePath("/vendas")
  revalidatePath("/dashboard")
  return { ok: true }
}

/**
 * Força a atualização da cotação a partir das APIs públicas (com fallback)
 * e persiste. Lança erro apenas se todas as fontes falharem.
 */
export async function refreshLiveRate() {
  await requirePermission("settings", "update")

  // Garante que a busca não fique presa em modo manual ao forçar.
  await db.update(settings).set({ manualRate: false }).where(eq(settings.id, 1))

  const result = await getEffectiveRate(true)
  if (!result.rateSource && result.rateCheckedAt) {
    throw new Error("Não foi possível obter a cotação agora. O último valor foi mantido.")
  }

  revalidatePath("/configuracoes")
  revalidatePath("/produtos")
  revalidatePath("/vendas")
  revalidatePath("/dashboard")
  return { ok: true, rate: result.exchangeRate, source: result.rateSource }
}
