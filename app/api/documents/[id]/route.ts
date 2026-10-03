import { getAuthContext, hasPermission } from '@/lib/rbac'
import { MIME, buildDraftEml, renderStoredDocument, type DocFormat } from '@/lib/flows/documents'

export const runtime = 'nodejs'

/**
 * GET /api/documents/:id?format=pdf|docx|eml[&download=1]
 * - pdf: exibe inline (ou baixa com download=1)
 * - docx: baixa cópia em Word para edição
 * - eml: rascunho com o PDF anexado, que o Outlook instalado abre pronto para enviar
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext()
  if (!ctx || !ctx.tenantId || !hasPermission(ctx, 'flows', 'view')) {
    return new Response('Não autorizado', { status: 401 })
  }
  const { id } = await params
  const url = new URL(req.url)
  const requested = url.searchParams.get('format') ?? 'pdf'
  const format: DocFormat = requested === 'docx' ? 'docx' : 'pdf'

  const doc = await renderStoredDocument(ctx.tenantId, Number(id), format)
  if (!doc) return new Response('Documento não encontrado', { status: 404 })

  if (requested === 'eml') {
    const eml = buildDraftEml({
      to: doc.customerEmail ?? '',
      subject: `${doc.title} - ${doc.storeName}`,
      body: `Olá,\r\n\r\nSegue em anexo o documento "${doc.title}".\r\n\r\nAtenciosamente,\r\n${doc.storeName}`,
      attachments: [{ filename: doc.filename, mime: MIME.pdf, content: doc.buffer }],
    })
    return new Response(new Uint8Array(eml), {
      headers: {
        'Content-Type': 'message/rfc822',
        'Content-Disposition': `attachment; filename="${doc.filename.replace(/\.pdf$/, '')}.eml"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  const disposition = format === 'docx' || url.searchParams.get('download') === '1' ? 'attachment' : 'inline'
  return new Response(new Uint8Array(doc.buffer), {
    headers: {
      'Content-Type': MIME[format],
      'Content-Disposition': `${disposition}; filename="${doc.filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
