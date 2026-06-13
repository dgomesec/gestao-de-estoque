import 'server-only'

import { headers, cookies } from 'next/headers'
import { db } from '@/lib/db'
import { tenants } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import type { Tenant } from '@/lib/features'
import {
  DEFAULT_TENANT_SLUG,
  TENANT_SLUG_HEADER,
  PORTAL_HEADER,
  TENANT_COOKIE,
  PORTAL_COOKIE,
} from '@/lib/features'

// Reexporta os helpers/constantes client-safe de features para que os callers
// server-side existentes possam continuar importando de '@/lib/tenant'.
export type { Tenant }
export {
  DEFAULT_TENANT_SLUG,
  TENANT_SLUG_HEADER,
  PORTAL_HEADER,
  TENANT_COOKIE,
  PORTAL_COOKIE,
  ALWAYS_ON_FEATURES,
  TOGGLEABLE_FEATURES,
  parseFeatures,
  isFeatureEnabled,
  enabledFeatureSet,
} from '@/lib/features'

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
