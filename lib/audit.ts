import 'server-only'

import { headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { auditLogs, user } from '@/lib/db/schema'

export type AuditAction =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'create'
  | 'update'
  | 'delete'

export type AuditResource =
  | 'auth'
  | 'products'
  | 'users'
  | 'roles'
  | 'sales'
  | 'stock'
  | 'customers'
  | 'settings'

type LogInput = {
  action: AuditAction
  resource: AuditResource
  userId?: string | null
  userName?: string | null
  userEmail?: string | null
  resourceId?: string | number | null
  summary?: string
  metadata?: Record<string, unknown>
}

/** Extrai o primeiro IP real da request (considera proxies). */
function getClientIp(h: Headers): string | null {
  const fwd = h.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0]!.trim()
  return h.get('x-real-ip') ?? null
}

/** Parser leve de user-agent: navegador + sistema operacional. */
function parseUserAgent(ua: string | null): { browser: string | null; os: string | null } {
  if (!ua) return { browser: null, os: null }

  let browser: string | null = null
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  else if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let os: string | null = null
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Linux/.test(ua)) os = 'Linux'

  return { browser, os }
}

/** Resolve país/cidade a partir do IP usando serviço gratuito (ipapi.co). */
async function geolocate(ip: string | null): Promise<{ country: string | null; city: string | null }> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: null, city: null }
  }
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return { country: null, city: null }
    const data = await res.json()
    return {
      country: typeof data?.country_name === 'string' ? data.country_name : null,
      city: typeof data?.city === 'string' ? data.city : null,
    }
  } catch {
    return { country: null, city: null }
  }
}

/**
 * Registra uma ação de auditoria. Nunca lança erro (falha de log não deve
 * quebrar a operação principal).
 */
export async function logAudit(input: LogInput): Promise<void> {
  try {
    const h = await headers()
    const ip = getClientIp(h)
    const ua = h.get('user-agent')
    const { browser, os } = parseUserAgent(ua)
    const { country, city } = await geolocate(ip)

    // Enriquece com nome/email se só recebemos o userId (ex.: hook de login).
    let userName = input.userName ?? null
    let userEmail = input.userEmail ?? null
    if (input.userId && (!userName || !userEmail)) {
      const [u] = await db
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, input.userId))
      if (u) {
        userName = userName ?? u.name
        userEmail = userEmail ?? u.email
      }
    }

    await db.insert(auditLogs).values({
      action: input.action,
      resource: input.resource,
      userId: input.userId ?? null,
      userName,
      userEmail,
      resourceId: input.resourceId != null ? String(input.resourceId) : null,
      summary: input.summary ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      ipAddress: ip,
      userAgent: ua,
      browser,
      os,
      country,
      city,
    })
  } catch (err) {
    console.log('[v0] logAudit failed:', err instanceof Error ? err.message : String(err))
  }
}
