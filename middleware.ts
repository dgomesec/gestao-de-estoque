import { NextResponse, type NextRequest } from 'next/server'

/**
 * Resolução de tenant por subdomínio (multi-tenancy).
 *
 * - `admin.<rootDomain>`  -> portal master (super-usuário de plataforma).
 * - `<slug>.<rootDomain>` -> console do cliente cujo slug é `<slug>`.
 *
 * Em ambientes sem subdomínio (preview do v0 / localhost), onde não há
 * `NEXT_PUBLIC_ROOT_DOMAIN` aplicável, usamos fallback por query string
 * (`?tenant=` / `?portal=admin`) persistida em cookie, e o tenant padrão.
 *
 * O resultado é propagado via headers `x-tenant-slug` e `x-portal`, lidos no
 * servidor por `lib/tenant.ts`.
 */

const TENANT_SLUG_HEADER = 'x-tenant-slug'
const PORTAL_HEADER = 'x-portal'
const TENANT_COOKIE = 'tenant'
const PORTAL_COOKIE = 'portal'

function getRootDomain(): string | null {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? null
}

export function middleware(req: NextRequest) {
  const url = req.nextUrl
  const hostname = (req.headers.get('host') ?? '').split(':')[0].toLowerCase()
  const rootDomain = getRootDomain()

  let slug: string | null = null
  let portal: 'admin' | 'tenant' = 'tenant'

  // 1) Resolução por subdomínio quando há um root domain configurado.
  if (rootDomain && hostname.endsWith(`.${rootDomain}`)) {
    const sub = hostname.slice(0, hostname.length - rootDomain.length - 1)
    if (sub === 'admin') {
      portal = 'admin'
    } else if (sub && sub !== 'www') {
      slug = sub
    }
  }

  // 2) Fallback por query string (preview/local). Permite alternar tenant ou
  //    entrar no portal master sem subdomínio. A escolha é persistida em cookie.
  const queryPortal = url.searchParams.get('portal')
  const queryTenant = url.searchParams.get('tenant')

  let setPortalCookie: 'admin' | 'tenant' | null = null

  if (queryPortal === 'admin') {
    portal = 'admin'
    setPortalCookie = 'admin'
  } else if (queryPortal === 'tenant') {
    portal = 'tenant'
    setPortalCookie = 'tenant'
  } else if (req.cookies.get(PORTAL_COOKIE)?.value === 'admin' && !rootDomain) {
    // Sem root domain, respeitamos a escolha de portal salva no cookie.
    portal = 'admin'
  }

  if (queryTenant) {
    slug = queryTenant
  } else if (!slug) {
    const cookieTenant = req.cookies.get(TENANT_COOKIE)?.value
    if (cookieTenant) slug = cookieTenant
  }

  // Injeta a resolução nos headers da requisição encaminhada (lidos por headers()).
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set(PORTAL_HEADER, portal)
  if (slug) requestHeaders.set(TENANT_SLUG_HEADER, slug)

  const res = NextResponse.next({ request: { headers: requestHeaders } })

  // Persiste seleções de preview (query) em cookie para as próximas navegações.
  if (setPortalCookie) res.cookies.set(PORTAL_COOKIE, setPortalCookie, { path: '/', sameSite: 'lax' })
  if (queryTenant) res.cookies.set(TENANT_COOKIE, queryTenant, { path: '/', sameSite: 'lax' })

  return res
}

export const config = {
  // Ignora assets estáticos e a API de auth (que tem seu próprio host trust).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js)$).*)'],
}
