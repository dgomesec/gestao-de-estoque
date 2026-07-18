import 'server-only'

import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getAuthContext } from '@/lib/rbac'
import { toDisplayCurrency, type DisplayCurrency } from '@/lib/format'

/**
 * Resolve o tenant efetivo para operações de configuração/câmbio. Aceita um
 * tenantId explícito (ex.: recibo público) ou cai no contexto autenticado.
 */
async function resolveTenantId(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit
  const ctx = await getAuthContext()
  return ctx?.tenantId ?? null
}

export type StoreInfo = {
  storeName: string | null
  storeLogoUrl: string | null
  storeAddress: string | null
  storePhone: string | null
  storeEmail: string | null
}

export type Settings = {
  displayCurrency: DisplayCurrency
  exchangeRate: number
  manualRate: boolean
  currencyProtectionPct: number
  // Quando false, o custo é tratado já na moeda escolhida (sem conversão de USD)
  // e a interface oculta os valores em dólar.
  showCostUsd: boolean
  rateUpdatedAt: Date
  rateSource: string | null
  rateCheckedAt: Date | null
} & StoreInfo

// Minimum interval between live API checks (6 hours) to avoid rate limits (429).
const RATE_TTL_MS = 6 * 60 * 60 * 1000

/**
 * Busca a cotação USD->moeda na AwesomeAPI (gratuita, sem chave).
 * Retorna null em caso de falha. Suporta BRL e EUR.
 */
export async function fetchUsdRateAwesome(target: 'BRL' | 'EUR'): Promise<number | null> {
  try {
    const res = await fetch(`https://economia.awesomeapi.com.br/json/last/USD-${target}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const bid = Number(data?.[`USD${target}`]?.bid)
    return Number.isFinite(bid) && bid > 0 ? bid : null
  } catch {
    return null
  }
}

/**
 * Fonte alternativa gratuita caso a AwesomeAPI falhe (ex.: 429).
 */
export async function fetchUsdRateFallback(target: 'BRL' | 'EUR'): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const rate = Number(data?.rates?.[target])
    return Number.isFinite(rate) && rate > 0 ? rate : null
  } catch {
    return null
  }
}

/**
 * Tenta obter a cotação USD->moeda ao vivo: AwesomeAPI primeiro, com fallback
 * para open.er-api.com. Retorna o valor e a fonte usada, ou null se falhar.
 * Para USD a taxa é sempre 1 (sem chamada externa).
 */
async function fetchLiveRate(
  currency: DisplayCurrency,
): Promise<{ rate: number; source: string } | null> {
  if (currency === 'USD') return { rate: 1, source: 'fixed' }
  const primary = await fetchUsdRateAwesome(currency)
  if (primary) return { rate: primary, source: 'awesomeapi' }
  const fallback = await fetchUsdRateFallback(currency)
  if (fallback) return { rate: fallback, source: 'er-api' }
  return null
}

/**
 * Lê as configurações do tenant. Aceita um tenantId explícito (para contextos
 * sem sessão, como o recibo público) ou resolve pelo usuário autenticado.
 */
export async function getSettings(tenantId?: string | null): Promise<Settings> {
  const tid = await resolveTenantId(tenantId)
  const rows = tid
    ? await db.select().from(settings).where(eq(settings.tenantId, tid))
    : []
  const row = rows[0]
  if (!row) {
    return {
      displayCurrency: 'BRL',
      exchangeRate: 5,
      manualRate: false,
      currencyProtectionPct: 0,
      showCostUsd: true,
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
    displayCurrency: toDisplayCurrency(row.displayCurrency),
    exchangeRate: Number(row.exchangeRate),
    manualRate: row.manualRate,
    currencyProtectionPct: Number(row.currencyProtectionPct),
    showCostUsd: row.showCostUsd,
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
export async function getEffectiveRate(force = false, tenantId?: string | null): Promise<Settings> {
  const tid = await resolveTenantId(tenantId)
  const current = await getSettings(tid)
  // USD oculto: o custo já está na moeda escolhida, então não há conversão
  // (taxa efetiva 1) e não faz sentido consultar a cotação externa.
  if (!current.showCostUsd) {
    return { ...current, exchangeRate: 1 }
  }
  // Dólar como moeda de exibição: a taxa é sempre 1, sem consulta externa.
  if (current.displayCurrency === 'USD') {
    return { ...current, exchangeRate: 1 }
  }
  if (current.manualRate) return current
  // Sem tenant resolvido não há linha de settings para atualizar.
  if (!tid) return current

  const lastChecked = current.rateCheckedAt?.getTime() ?? 0
  const isFresh = Date.now() - lastChecked < RATE_TTL_MS
  if (isFresh && !force) return current

  const live = await fetchLiveRate(current.displayCurrency)
  const now = new Date()

  if (!live) {
    // API indisponível: apenas marca a tentativa, preserva o valor atual.
    await db.update(settings).set({ rateCheckedAt: now }).where(eq(settings.tenantId, tid))
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
    .where(eq(settings.tenantId, tid))

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
