import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { generatedDocuments } from '@/lib/db/schema'
import { getAuthContext, hasPermission } from '@/lib/rbac'
import { buildOrderContext } from '@/lib/flows/context'
import { generatePdfForOrder } from '@/lib/flows/engine'
import type { DocSpec } from '@/lib/flows/types'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext()
  if (!ctx || !ctx.tenantId || !hasPermission(ctx, 'flows', 'view')) {
    return new Response('Não autorizado', { status: 401 })
  }
  const { id } = await params
  const [doc] = await db
    .select()
    .from(generatedDocuments)
    .where(and(eq(generatedDocuments.id, Number(id)), eq(generatedDocuments.tenantId, ctx.tenantId)))
  if (!doc || !doc.groupId) return new Response('Documento não encontrado', { status: 404 })

  const oc = await buildOrderContext(ctx.tenantId, doc.groupId)
  if (!oc) return new Response('Pedido não encontrado', { status: 404 })

  const { spec } = JSON.parse(doc.payload) as { spec: DocSpec }
  const pdf = await generatePdfForOrder(oc, spec)
  const filename = `${doc.title}`.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'documento'
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
