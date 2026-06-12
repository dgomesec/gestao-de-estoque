import 'server-only'

import { headers, cookies } from 'next/headers'
import { db } from '@/lib/db'
import { tenants } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { ResourceKey } from '@/lib/constants'

export type Tenant = typeof tenants.$inferSelect

// Tenant padrão usado em ambientes sem subdomínio (preview/local), para manter
// a aplicação single-tenant existente (TechBless) funcionando sem configuração.
export const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? 'techbless'

// Nomes de header/cookie usados na resolução do tenant (vide middleware.ts).
export const TENANT_SLUG_HEADER = 'x-tenant-slug'
export const PORTAL_HEADER = 'x-portal'
export const TENANT_COOKIE = 'tenant'
export const PORTAL_COOKIE = 'portal'

/**
 * Recursos que NÃO são funcionalidades ligáveis pelo painel master — o núcleo
 * operacional (dashboard/relatórios) permanece sempre disponível. As demais
 * (gestão de usuários, papéis, auditoria, etc.) podem ser ativadas/desativadas
 * por cliente.
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
 * Resolve o slug do tenant da requisição atual. A ordem de prioridade é:
 * 1. Header `x-tenant-slug` (definido pelo middleware a partir do subdomínio).
 * 2. Cookie `tenant` (impersonação pelo painel master / fallback de preview).
 * 3. Slug padrão (mantém o preview single-tenant funcionando).
 */
export async function resolveTenantSlug(): Promise<string> {
  const h = await headers()
  const fromHeader = h.get(TENANT_SLUG_HEADER)
  if (fromHeader) return fromHeader

  const c = await cookies()
  const fromCookie = c.get(TENANT_COOKIE)?.value
  if (fromCookie) return fromCookie

  return DEFAULT_TENANT_SLUG
}

/**
 * Indica se a requisição atual aponta para o portal master (admin.dominio).
 */
export async function isPlatformPortal(): Promise<boolean> {
  const h = await headers()
  if (h.get(PORTAL_HEADER) === 'admin') return true
  const c = await cookies()
  return c.get(PORTAL_COOKIE)?.value === 'admin'
}

/**
 * Carrega o tenant ativo (pelo slug resolvido), ou null se não existir.
 */
export async function getActiveTenant(): Promise<Tenant | null> {
  const slug = await resolveTenantSlug()
  return getTenantBySlug(slug)
}

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1)
  return t ?? null
}

export async function getTenantById(id: string): Promise<Tenant | null> {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1)
  return t ?? null
}

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
