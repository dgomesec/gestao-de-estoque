"use server"

import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { requirePermission } from "@/lib/rbac"
import { logAudit } from "@/lib/audit"
import { getEffectiveRate } from "@/lib/exchange"
import { toDisplayCurrency, currencySymbol } from "@/lib/format"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { put, del } from "@vercel/blob"

export async function updateSettings(input: {
  displayCurrency: string
  exchangeRate: number
  manualRate: boolean
  currencyProtectionPct: number
}) {
  const ctx = await requirePermission("settings", "update")

  const currency = toDisplayCurrency(input.displayCurrency)
  // Dólar: a taxa é sempre 1. Nas demais moedas exige valor válido.
  const exchangeRate = currency === "USD" ? 1 : input.exchangeRate
  const manualRate = currency === "USD" ? true : input.manualRate

  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new Error("Cotação inválida")
  }
  if (!Number.isFinite(input.currencyProtectionPct) || input.currencyProtectionPct < 0) {
    throw new Error("Proteção cambial inválida")
  }

  await db
    .update(settings)
    .set({
      displayCurrency: currency,
      exchangeRate: String(exchangeRate),
      manualRate,
      currencyProtectionPct: String(input.currencyProtectionPct),
      rateUpdatedAt: new Date(),
      // Zera a checagem para forçar nova busca ao vivo na moeda escolhida.
      rateCheckedAt: null,
    })
    .where(eq(settings.tenantId, ctx.tenantId))

  // Em modo automático (BRL/EUR), busca a cotação correta da nova moeda.
  let effectiveRate = exchangeRate
  if (!manualRate && currency !== "USD") {
    const refreshed = await getEffectiveRate(true, ctx.tenantId)
    effectiveRate = refreshed.exchangeRate
  }

  await logAudit({
    action: "update",
    resource: "settings",
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Configurações atualizadas (moeda ${currency}, câmbio ${manualRate ? "manual" : "automático"}: ${currencySymbol(currency)} ${effectiveRate}, proteção ${input.currencyProtectionPct}%)`,
    metadata: { ...input, currency, effectiveRate },
  })

  revalidatePath("/configuracoes")
  revalidatePath("/produtos")
  revalidatePath("/vendas")
  revalidatePath("/dashboard")
  return { ok: true, displayCurrency: currency, rate: effectiveRate }
}

/**
 * Força a atualização da cotação a partir das APIs públicas (com fallback)
 * e persiste. Lança erro apenas se todas as fontes falharem.
 */
export async function refreshLiveRate() {
  const ctx = await requirePermission("settings", "update")

  // Garante que a busca não fique presa em modo manual ao forçar.
  await db.update(settings).set({ manualRate: false }).where(eq(settings.tenantId, ctx.tenantId))

  const result = await getEffectiveRate(true, ctx.tenantId)
  if (!result.rateSource && result.rateCheckedAt) {
    throw new Error("Não foi possível obter a cotação agora. O último valor foi mantido.")
  }

  revalidatePath("/configuracoes")
  revalidatePath("/produtos")
  revalidatePath("/vendas")
  revalidatePath("/dashboard")
  return { ok: true, rate: result.exchangeRate, source: result.rateSource }
}

/**
 * Atualiza os dados da loja (nome, endereço, telefone, e-mail) usados nos
 * recibos e orçamentos. O logo é tratado separadamente via uploadStoreLogo.
 */
export async function updateStoreInfo(input: {
  storeName: string
  storeAddress: string
  storePhone: string
  storeEmail: string
}) {
  const ctx = await requirePermission("settings", "update")

  const email = input.storeEmail.trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("E-mail da loja inválido")
  }

  await db
    .update(settings)
    .set({
      storeName: input.storeName.trim() || null,
      storeAddress: input.storeAddress.trim() || null,
      storePhone: input.storePhone.trim() || null,
      storeEmail: email || null,
    })
    .where(eq(settings.tenantId, ctx.tenantId))

  await logAudit({
    action: "update",
    resource: "settings",
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: `Dados da loja atualizados (${input.storeName || "sem nome"})`,
    metadata: { ...input },
  })

  revalidatePath("/configuracoes")
  revalidatePath("/vendas")
  return { ok: true as const }
}

/**
 * Faz upload do logo da loja para o Vercel Blob (público) e salva a URL.
 * Remove o logo anterior, se houver. Recebe o arquivo via FormData.
 */
export async function uploadStoreLogo(formData: FormData) {
  const ctx = await requirePermission("settings", "update")

  const file = formData.get("logo")
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Nenhuma imagem enviada")
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("O arquivo deve ser uma imagem")
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("A imagem deve ter no máximo 2 MB")
  }

  // Remove o logo anterior para não acumular arquivos órfãos.
  const rows = await db
    .select({ url: settings.storeLogoUrl })
    .from(settings)
    .where(eq(settings.tenantId, ctx.tenantId))
  const previous = rows[0]?.url
  if (previous) {
    try {
      await del(previous)
    } catch {
      // Ignora falha ao remover o antigo; não deve bloquear o novo upload.
    }
  }

  const ext = file.name.split(".").pop() || "png"
  const blob = await put(`store-logo/${ctx.tenantId}/logo-${Date.now()}.${ext}`, file, {
    access: "public",
    contentType: file.type,
  })

  await db.update(settings).set({ storeLogoUrl: blob.url }).where(eq(settings.tenantId, ctx.tenantId))

  await logAudit({
    action: "update",
    resource: "settings",
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: "Logo da loja atualizado",
  })

  revalidatePath("/configuracoes")
  revalidatePath("/vendas")
  return { ok: true as const, url: blob.url }
}

/**
 * Remove o logo da loja.
 */
export async function removeStoreLogo() {
  const ctx = await requirePermission("settings", "update")

  const rows = await db
    .select({ url: settings.storeLogoUrl })
    .from(settings)
    .where(eq(settings.tenantId, ctx.tenantId))
  const previous = rows[0]?.url
  if (previous) {
    try {
      await del(previous)
    } catch {
      // Ignora falha ao remover do blob.
    }
  }

  await db.update(settings).set({ storeLogoUrl: null }).where(eq(settings.tenantId, ctx.tenantId))

  await logAudit({
    action: "update",
    resource: "settings",
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    userName: ctx.user.name,
    userEmail: ctx.user.email,
    summary: "Logo da loja removido",
  })

  revalidatePath("/configuracoes")
  revalidatePath("/vendas")
  return { ok: true as const }
}
