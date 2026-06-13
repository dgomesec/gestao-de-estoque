import type { ResourceKey } from '@/lib/constants'
import type { tenants } from '@/lib/db/schema'

// Módulo client-safe: NÃO importa `lib/db` nem `server-only`, podendo ser usado
// tanto em Server quanto em Client Components (ex.: painel master, navegação).

export type Tenant = typeof tenants.$inferSelect

// Tenant padrão usado em ambientes sem subdomínio (preview/local), para manter
// a aplicação single-tenant existente (TechBless) funcionando sem configuração.
export const DEFAULT_TENANT_SLUG = process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ?? 'techbless'

// Nomes de header/cookie usados na resolução do tenant (vide middleware.ts).
export const TENANT_SLUG_HEADER = 'x-tenant-slug'
export const PORTAL_HEADER = 'x-portal'
export const TENANT_COOKIE = 'tenant'
export const PORTAL_COOKIE = 'portal'

/**
 * Recursos que NÃO são funcionalidades ligáveis pelo painel master — o núcleo
 * operacional (dashboard/relatórios) permanece sempre disponível.
 */
export const ALWAYS_ON_FEATURES: ResourceKey[] = ['reports']

/**
 * Recursos que podem ser ativados/desativados por cliente no painel master.
 */
export const TOGGLEABLE_FEATURES: ResourceKey[] = [
  'products',
  'stock',
  'sales',
  'customers',
  'users',
  'roles',
  'settings',
  'audit',
]

/**
 * Converte o JSON de funcionalidades do tenant em um mapa. Entradas ausentes
 * significam "habilitado" (opt-out): só desativamos o que estiver explicitamente
 * marcado como `false`.
 */
export function parseFeatures(raw: string | null | undefined): Record<string, boolean> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/**
 * Indica se uma funcionalidade (recurso) está habilitada para o tenant.
 * Recursos sempre ativos e qualquer recurso não explicitamente desativado
 * retornam true.
 */
export function isFeatureEnabled(
  tenant: Pick<Tenant, 'features'> | null | undefined,
  resource: ResourceKey,
): boolean {
  if (ALWAYS_ON_FEATURES.includes(resource)) return true
  if (!tenant) return true
  const map = parseFeatures(tenant.features)
  return map[resource] !== false
}

/**
 * Conjunto de funcionalidades habilitadas do tenant (para uso no cliente/nav).
 */
export function enabledFeatureSet(
  tenant: Pick<Tenant, 'features'> | null | undefined,
): Set<ResourceKey> {
  const set = new Set<ResourceKey>(ALWAYS_ON_FEATURES)
  for (const r of TOGGLEABLE_FEATURES) {
    if (isFeatureEnabled(tenant, r)) set.add(r)
  }
  return set
}
