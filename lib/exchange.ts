import 'server-only'

import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export type StoreInfo = {
  storeName: string | null
  storeLogoUrl: string | null
  storeAddress: string | null
  storePhone: string | null
  storeEmail: string | null
}

export type Settings = {
  exchangeRate: number
  manualRate: boolean
  currencyProtectionPct: number
  rateUpdatedAt: Date
  rateSource: string | null
  rateCheckedAt: Date | null
} & StoreInfo

// Minimum interval between live API checks (6 hours) to avoid rate limits (429).
const RATE_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Busca a cotação USD->BRL na AwesomeAPI (gratuita, sem chave).
 * Retorna null em caso de falha.
 */
export async function fetchUsdBrlRate(): Promise<number | null> {
  try {
    const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const bid = Number(data?.USDBRL?.bid)
    return Number.isFinite(bid) && bid > 0 ? bid : null
  } catch {
    return null
  }
}

/**
 * Fonte alternativa gratuita caso a AwesomeAPI falhe (ex.: 429).
 */
export async function fetchUsdBrlRateFallback(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const brl = Number(data?.rates?.BRL)
    return Number.isFinite(brl) && brl > 0 ? brl : null
  } catch {
    return null
  }
}

/**
 * Tenta obter a cotação ao vivo: AwesomeAPI primeiro, com fallback para
 * open.er-api.com. Retorna o valor e a fonte usada, ou null se ambas falharem.
 */
async function fetchLiveRate(): Promise<{ rate: number; source: string } | null> {
  const primary = await fetchUsdBrlRate()
  if (primary) return { rate: primary, source: 'awesomeapi' }
  const fallback = await fetchUsdBrlRateFallback()
  if (fallback) return { rate: fallback, source: 'er-api' }
  return null
}

/**
 * Lê as configurações (linha única id=1).
 */
export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(settings).where(eq(settings.id, 1))
  const row = rows[0]
  if (!row) {
    return {
      exchangeRate: 5,
      manualRate: false,
      currencyProtectionPct: 0,
      rateUpdatedAt: new Date(),
      rateSource: null,
      rateCheckedAt: null,
      storeName: null,
      storeLogoUrl: null,
      storeAddress: null,
      storePhone: null,
      storeEmail: null,
    }
  }
  return {
    exchangeRate: Number(row.exchangeRate),
    manualRate: row.manualRate,
    currencyProtectionPct: Number(row.currencyProtectionPct),
    rateUpdatedAt: row.rateUpdatedAt,
    rateSource: row.rateSource ?? null,
    rateCheckedAt: row.rateCheckedAt ?? null,
    storeName: row.storeName ?? null,
    storeLogoUrl: row.storeLogoUrl ?? null,
    storeAddress: row.storeAddress ?? null,
    storePhone: row.storePhone ?? null,
    storeEmail: row.storeEmail ?? null,
  }
}

/**
 * Retorna a cotação efetiva a ser usada.
 *
 * - Se a cotação é manual, retorna o valor fixo.
 * - Caso contrário, usa o valor em cache e só consulta a API externa se já
 *   passou o TTL (6h) desde a última checagem. Isso evita o erro 429.
 * - Se a API falhar, MANTÉM o último valor conhecido (não zera/quebra).
 *
 * Passe `force = true` para forçar a atualização (ex.: botão "Atualizar agora").
 */
export async function getEffectiveRate(force = false): Promise<Settings> {
  const current = await getSettings()
  if (current.manualRate) return current

  const lastChecked = current.rateCheckedAt?.getTime() ?? 0
  const isFresh = Date.now() - lastChecked < RATE_TTL_MS
  if (isFresh && !force) return current

  const live = await fetchLiveRate()
  const now = new Date()

  if (!live) {
    // API indisponível: apenas marca a tentativa, preserva o valor atual.
    await db.update(settings).set({ rateCheckedAt: now }).where(eq(settings.id, 1))
    return { ...current, rateCheckedAt: now }
  }

  await db
    .update(settings)
    .set({
      exchangeRate: String(live.rate),
      rateUpdatedAt: now,
      rateCheckedAt: now,
      rateSource: live.source,
    })
    .where(eq(settings.id, 1))

  return {
    ...current,
    exchangeRate: live.rate,
    rateUpdatedAt: now,
    rateCheckedAt: now,
    rateSource: live.source,
  }
}

/**
 * Calcula o preço final em BRL a partir de um valor em USD.
 *
 * finalBrl = usd * rate * (1 + protecaoCambial/100)
 */
export function computeBrl(
  usd: number,
  rate: number,
  protectionPct: number,
): number {
  return usd * rate * (1 + protectionPct / 100)
}

/**
 * Calcula faixa de preço de venda sugerida (margem mín/máx) em USD e BRL.
 */
export function computePriceRange(
  costUsd: number,
  marginMinPct: number,
  marginMaxPct: number,
  rate: number,
  protectionPct: number,
) {
  const minUsd = costUsd * (1 + marginMinPct / 100)
  const maxUsd = costUsd * (1 + marginMaxPct / 100)
  return {
    minUsd,
    maxUsd,
    minBrl: computeBrl(minUsd, rate, protectionPct),
    maxBrl: computeBrl(maxUsd, rate, protectionPct),
  }
}
