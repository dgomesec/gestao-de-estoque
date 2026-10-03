import "server-only"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"
import type { Order } from "@/lib/orders"
import { formatMoney } from "@/lib/format"
import { renderVars } from "./context"
import type { DocSpec } from "./types"

type Brand = {
  name: string
  logoUrl: string | null
  primary: string
  accent: string
  foreground: string
}

function hexToRgb(hex: string | null | undefined, fallback: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? "").trim())
  if (!m) {
    const s = /^#?([0-9a-f]{3})$/i.exec((hex ?? "").trim())
    if (s) {
      const [r, g, b] = s[1].split("").map((c) => parseInt(c + c, 16))
      return [r, g, b]
    }
    return fallback
  }
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]: [number, number, number]) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

async function loadLogo(url: string | null): Promise<{ data: string; fmt: "PNG" | "JPEG"; w: number; h: number } | null> {
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const type = res.headers.get("content-type") ?? ""
    const fmt = type.includes("png") ? "PNG" : type.includes("jpeg") || type.includes("jpg") ? "JPEG" : null
    if (!fmt) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const data = `data:${type};base64,${buf.toString("base64")}`
    const props = new jsPDF().getImageProperties(data)
    return { data, fmt, w: props.width, h: props.height }
  } catch {
    return null
  }
}

export type BrandInput = {
  name: string
  logoUrl: string | null
  colorPrimary: string | null
  colorAccent: string | null
  colorForeground: string | null
}

/**
 * Renderiza um DocSpec em PDF aplicando a identidade visual do cliente
 * (logo, cor primária, cor de destaque, nome da marca e dados da loja).
 * As variáveis {{...}} são substituídas pelos dados reais do pedido.
 */
export async function renderDocumentPdf(
  spec: DocSpec,
  order: Order,
  vars: Record<string, string>,
  brandInput: BrandInput,
): Promise<Buffer> {
  const brand: Brand = {
    name: brandInput.name,
    logoUrl: brandInput.logoUrl,
    primary: brandInput.colorPrimary ?? "",
    accent: brandInput.colorAccent ?? "",
    foreground: brandInput.colorForeground ?? "",
  }
  const primary = hexToRgb(brand.primary, [17, 24, 39])
  const accent = hexToRgb(brand.accent, primary)
  const text = hexToRgb(brand.foreground, [31, 41, 55])
  const onPrimary: [number, number, number] = luminance(primary) > 0.6 ? [17, 24, 39] : [255, 255, 255]

  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 44
  const logo = await loadLogo(brand.logoUrl)
  const t = (s: string) => renderVars(s, vars)

  const drawHeader = () => {
    doc.setFillColor(...primary)
    doc.rect(0, 0, W, 78, "F")
    doc.setFillColor(...accent)
    doc.rect(0, 78, W, 4, "F")
    let x = M
    if (logo) {
      const h = 40
      const w = Math.min(120, (logo.w / logo.h) * h)
      doc.addImage(logo.data, logo.fmt, x, 19, w, h)
      x += w + 14
    }
    doc.setTextColor(...onPrimary)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(15)
    doc.text(brand.name, x, 44)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text(vars["pedido.codigo"] ?? "", W - M, 38, { align: "right" })
    doc.text(vars["hoje"] ?? "", W - M, 52, { align: "right" })
  }

  const drawFooter = (page: number, total: number) => {
    doc.setDrawColor(...accent)
    doc.setLineWidth(1)
    doc.line(M, H - 44, W - M, H - 44)
    doc.setTextColor(110, 110, 110)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    const contact = [vars["loja.endereco"], vars["loja.telefone"], vars["loja.email"]].filter(Boolean).join("  |  ")
    doc.text(contact || brand.name, M, H - 30, { maxWidth: W - M * 2 - 60 })
    doc.text(`Página ${page} de ${total}`, W - M, H - 30, { align: "right" })
  }

  drawHeader()
  let y = 112

  const ensure = (needed: number) => {
    if (y + needed > H - 64) {
      doc.addPage()
      drawHeader()
      y = 112
    }
  }

  // Título
  doc.setTextColor(...primary)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  const titleLines = doc.splitTextToSize(t(spec.title), W - M * 2) as string[]
  doc.text(titleLines, M, y)
  y += titleLines.length * 24
  if (spec.subtitle) {
    doc.setTextColor(110, 110, 110)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(11)
    const sub = doc.splitTextToSize(t(spec.subtitle), W - M * 2) as string[]
    doc.text(sub, M, y)
    y += sub.length * 14
  }
  y += 10

  for (const block of spec.blocks) {
    switch (block.type) {
      case "heading": {
        ensure(34)
        y += 6
        doc.setFont("helvetica", "bold")
        doc.setFontSize(12.5)
        doc.setTextColor(...primary)
        doc.text(t(block.text), M, y)
        doc.setDrawColor(...accent)
        doc.setLineWidth(1.5)
        doc.line(M, y + 5, M + 36, y + 5)
        y += 22
        break
      }
      case "paragraph": {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(10.5)
        doc.setTextColor(...text)
        const lines = doc.splitTextToSize(t(block.text), W - M * 2) as string[]
        for (const line of lines) {
          ensure(16)
          doc.text(line, M, y)
          y += 15
        }
        y += 6
        break
      }
      case "bullets": {
        doc.setFont("helvetica", "normal")
        doc.setFontSize(10.5)
        doc.setTextColor(...text)
        for (const item of block.items) {
          const lines = doc.splitTextToSize(t(item), W - M * 2 - 16) as string[]
          ensure(lines.length * 15 + 2)
          doc.setFillColor(...accent)
          doc.circle(M + 3, y - 3.5, 2, "F")
          doc.text(lines, M + 14, y)
          y += lines.length * 15 + 2
        }
        y += 6
        break
      }
      case "kv": {
        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M },
          body: block.rows.map((r) => [t(r.label), t(r.value)]),
          theme: "plain",
          styles: { fontSize: 10, cellPadding: { top: 4, bottom: 4, left: 6, right: 6 }, textColor: text },
          columnStyles: { 0: { fontStyle: "bold", cellWidth: 140, textColor: primary } },
          didDrawPage: () => {},
        })
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
        break
      }
      case "items_table": {
        const cur = order.currency
        const useUsd = cur === "USD"
        autoTable(doc, {
          startY: y,
          margin: { left: M, right: M, top: 100 },
          head: [["Produto", "SKU", "Qtd.", "Unitário", "Total"]],
          body: order.items.map((i) => {
            const total = Number(useUsd ? i.totalUsd : i.totalBrl)
            return [
              i.productName ?? "Produto",
              i.sku ?? "-",
              String(i.quantity),
              formatMoney(total / Math.max(1, i.quantity), cur),
              formatMoney(total, cur),
            ]
          }),
          headStyles: { fillColor: primary, textColor: onPrimary, fontSize: 9.5 },
          alternateRowStyles: { fillColor: [247, 247, 248] },
          styles: { fontSize: 9.5, textColor: text, cellPadding: 6 },
          columnStyles: { 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
          didDrawPage: (d) => {
            if (d.pageNumber > 1) drawHeader()
          },
        })
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
        break
      }
      case "totals": {
        ensure(40)
        const total = formatMoney(order.currency === "USD" ? order.totalUsd : order.totalBrl, order.currency)
        doc.setFillColor(...primary)
        doc.roundedRect(W - M - 210, y, 210, 32, 4, 4, "F")
        doc.setTextColor(...onPrimary)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(11)
        doc.text("TOTAL", W - M - 198, y + 20)
        doc.setFontSize(13)
        doc.text(total, W - M - 12, y + 21, { align: "right" })
        y += 52
        break
      }
      case "signatures": {
        ensure(80)
        y += 36
        const n = Math.max(1, block.labels.length)
        const colW = (W - M * 2 - (n - 1) * 24) / n
        block.labels.forEach((label, idx) => {
          const x = M + idx * (colW + 24)
          doc.setDrawColor(120, 120, 120)
          doc.setLineWidth(0.6)
          doc.line(x, y, x + colW, y)
          doc.setFont("helvetica", "normal")
          doc.setFontSize(9)
          doc.setTextColor(110, 110, 110)
          doc.text(t(label), x + colW / 2, y + 13, { align: "center" })
        })
        y += 30
        break
      }
      case "spacer":
        y += 16
        break
    }
  }

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    drawFooter(p, pages)
  }
  return Buffer.from(doc.output("arraybuffer"))
}
