import "server-only"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { generatedDocuments } from "@/lib/db/schema"
import { buildOrderContext, getTenantBrand } from "./context"
import { renderDocumentPdf, type BrandInput } from "./pdf"
import { renderDocumentDocx } from "./docx"
import type { DocSpec } from "./types"

export type DocFormat = "pdf" | "docx"

export const MIME: Record<DocFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

export function safeFilename(title: string) {
  return title.replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "documento"
}

export type RenderedDocument = {
  id: number
  title: string
  filename: string
  format: DocFormat
  buffer: Buffer
  customerEmail: string | null
  customerPhone: string | null
  storeName: string
  storeEmail: string | null
}

/** Renderiza um documento gerado do tenant no formato pedido. Retorna null se não existir. */
export async function renderStoredDocument(tenantId: string, id: number, format: DocFormat): Promise<RenderedDocument | null> {
  const [doc] = await db
    .select()
    .from(generatedDocuments)
    .where(and(eq(generatedDocuments.id, id), eq(generatedDocuments.tenantId, tenantId)))
  if (!doc || !doc.groupId) return null
  const oc = await buildOrderContext(tenantId, doc.groupId)
  if (!oc) return null

  const { spec } = JSON.parse(doc.payload) as { spec: DocSpec }
  const tenant = await getTenantBrand(tenantId)
  const brand: BrandInput = {
    name: tenant?.brandName || tenant?.name || oc.order.store.name,
    logoUrl: tenant?.logoUrl || oc.order.store.logoUrl,
    colorPrimary: tenant?.colorPrimary ?? null,
    colorAccent: tenant?.colorAccent ?? null,
    colorForeground: tenant?.colorForeground ?? null,
  }
  const buffer =
    format === "docx"
      ? await renderDocumentDocx(spec, oc.order, oc.vars, brand)
      : await renderDocumentPdf(spec, oc.order, oc.vars, brand)

  const customer = oc.order.customer as { email?: string | null; phone?: string | null }
  return {
    id: doc.id,
    title: doc.title,
    filename: `${safeFilename(doc.title)}.${format}`,
    format,
    buffer,
    customerEmail: customer.email ?? null,
    customerPhone: customer.phone ?? null,
    storeName: oc.order.store.name,
    storeEmail: oc.order.store.email ?? null,
  }
}

/** Monta um .eml em rascunho (X-Unsent) com anexos; o Outlook instalado o abre pronto para envio. */
export function buildDraftEml(opts: { to: string; subject: string; body: string; attachments: { filename: string; mime: string; content: Buffer }[] }) {
  const boundary = `----=_Part_${Date.now().toString(36)}`
  const encodeHeader = (s: string) => `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`
  const wrap = (b64: string) => b64.replace(/(.{76})/g, "$1\r\n")
  const lines = [
    "X-Unsent: 1",
    `To: ${opts.to}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(Buffer.from(opts.body, "utf8").toString("base64")),
  ]
  for (const a of opts.attachments) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${a.mime}; name="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "",
      wrap(a.content.toString("base64")),
    )
  }
  lines.push(`--${boundary}--`, "")
  return Buffer.from(lines.join("\r\n"), "utf8")
}
