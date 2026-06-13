import { betterAuth } from "better-auth"
import { pool, db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { logAudit } from "@/lib/audit"

export const auth = betterAuth({
  database: pool,
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  trustedOrigins: [
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
    // Domínio(s) personalizado(s) de produção. O cliente acessa pelo domínio
    // próprio (não pelo *.vercel.app), então ele PRECISA constar aqui ou o
    // Better Auth recusa o login com "invalid origin".
    "https://rareon.com.br",
    "https://www.rareon.com.br",
    // Curinga para subdomínios por cliente (ex.: ecsfish.rareon.com.br) caso
    // sejam ativados no futuro.
    "https://*.rareon.com.br",
    // Domínio raiz configurável via env, para portar a app para outro domínio
    // sem alterar código. Aceita lista separada por vírgula em ROOT_DOMAINS
    // e/ou um domínio único em NEXT_PUBLIC_ROOT_DOMAIN.
    ...(process.env.NEXT_PUBLIC_ROOT_DOMAIN
      ? [
          `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`,
          `https://www.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`,
          `https://*.${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`,
        ]
      : []),
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS
      ? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
      : []),
    ...(process.env.NODE_ENV === "development"
      ? ["http://localhost:3000", "http://127.0.0.1:3000"]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  databaseHooks: {
    session: {
      create: {
        // Registra cada login (criação de sessão) na auditoria.
        after: async (session) => {
          const [u] = await db
            .select({ tenantId: userTable.tenantId })
            .from(userTable)
            .where(eq(userTable.id, session.userId))
          await logAudit({
            action: "login",
            resource: "auth",
            tenantId: u?.tenantId ?? null,
            userId: session.userId,
            summary: "Login realizado",
          })
        },
      },
    },
  },
  ...(process.env.NODE_ENV === "development"
    ? {
        advanced: {
          // In dev (v0 preview iframe), force cross-site cookies so the
          // session cookie is stored by the browser.
          defaultCookieAttributes: {
            sameSite: "none" as const,
            secure: true,
          },
        },
      }
    : {}),
})
