import "server-only"
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import type { Order } from "@/lib/orders"
import { formatMoney } from "@/lib/format"
import { renderVars } from "./context"
import type { DocSpec } from "./types"
import type { BrandInput } from "./pdf"

function hex(value: string | null | undefined, fallback: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec((value ?? "").trim())
  return m ? m[1].toUpperCase() : fallback
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
const CELL_BORDERS = { top: NO_BORDER, bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" }, left: NO_BORDER, right: NO_BORDER }

/** Renderiza um DocSpec em .docx editável, aplicando as variáveis do pedido e as cores da marca. */
export async function renderDocumentDocx(
  spec: DocSpec,
  order: Order,
  vars: Record<string, string>,
  brand: BrandInput,
): Promise<Buffer> {
  const primary = hex(brand.colorPrimary, "111827")
  const accent = hex(brand.colorAccent, primary)
  const t = (s: string) => renderVars(s, vars)
  const useUsd = order.currency === "USD"

  const cell = (text: string, opts: { bold?: boolean; color?: string; fill?: string; width: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] }) =>
    new TableCell({
      width: { size: opts.width, type: WidthType.PERCENTAGE },
      borders: CELL_BORDERS,
      shading: opts.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [
        new Paragraph({
          alignment: opts.align,
          children: [new TextRun({ text, bold: opts.bold, color: opts.color, size: 20 })],
        }),
      ],
    })

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: t(spec.title), bold: true, size: 40, color: primary })],
    }),
  ]
  if (spec.subtitle) {
    children.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: t(spec.subtitle), size: 22, color: "6B7280" })] }))
  }

  for (const block of spec.blocks) {
    switch (block.type) {
      case "heading":
        children.push(
          new Paragraph({
            spacing: { before: 240, after: 100 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: accent, space: 2 } },
            children: [new TextRun({ text: t(block.text), bold: true, size: 26, color: primary })],
          }),
        )
        break
      case "paragraph":
        children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: t(block.text), size: 22 })] }))
        break
      case "bullets":
        for (const item of block.items) {
          children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun({ text: t(item), size: 22 })] }))
        }
        break
      case "kv":
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: block.rows.map(
              (r) =>
                new TableRow({
                  children: [cell(t(r.label), { bold: true, color: primary, width: 30 }), cell(t(r.value), { width: 70 })],
                }),
            ),
          }),
          new Paragraph({ children: [] }),
        )
        break
      case "items_table": {
        const head = ["Produto", "SKU", "Qtd.", "Unitário", "Total"]
        const widths = [38, 17, 9, 18, 18]
        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: head.map((h, i) => cell(h, { bold: true, color: "FFFFFF", fill: primary, width: widths[i], align: i >= 2 ? AlignmentType.RIGHT : undefined })),
              }),
              ...order.items.map((i) => {
                const total = Number(useUsd ? i.totalUsd : i.totalBrl)
                const values = [i.productName ?? "Produto", i.sku ?? "-", String(i.quantity), formatMoney(total / Math.max(1, i.quantity), order.currency), formatMoney(total, order.currency)]
                return new TableRow({
                  children: values.map((v, idx) => cell(v, { width: widths[idx], bold: idx === 4, align: idx >= 2 ? AlignmentType.RIGHT : undefined })),
                })
              }),
            ],
          }),
          new Paragraph({ children: [] }),
        )
        break
      }
      case "totals":
        children.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 120, after: 200 },
            children: [
              new TextRun({ text: "TOTAL  ", bold: true, size: 24, color: primary }),
              new TextRun({ text: formatMoney(useUsd ? order.totalUsd : order.totalBrl, order.currency), bold: true, size: 28, color: primary }),
            ],
          }),
        )
        break
      case "signatures":
        children.push(
          new Paragraph({ spacing: { before: 600 }, children: [] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: block.labels.map(
                  (label) =>
                    new TableCell({
                      width: { size: Math.floor(100 / Math.max(1, block.labels.length)), type: WidthType.PERCENTAGE },
                      borders: { top: { style: BorderStyle.SINGLE, size: 6, color: "6B7280" }, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
                      margins: { top: 60, left: 100, right: 100 },
                      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t(label), size: 18, color: "6B7280" })] })],
                    }),
                ),
              }),
            ],
          }),
        )
        break
      case "spacer":
        children.push(new Paragraph({ children: [] }))
        break
    }
  }

  const contact = [vars["loja.endereco"], vars["loja.telefone"], vars["loja.email"]].filter(Boolean).join("  |  ")
  const doc = new Document({
    creator: brand.name,
    title: t(spec.title),
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                shading: { type: ShadingType.CLEAR, color: "auto", fill: primary },
                spacing: { after: 200 },
                children: [
                  new TextRun({ text: ` ${brand.name}`, bold: true, size: 28, color: "FFFFFF" }),
                  new TextRun({ text: `    ${vars["pedido.codigo"] ?? ""}  ${vars["hoje"] ?? ""}`, size: 18, color: "FFFFFF" }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ children: [new TextRun({ text: contact || brand.name, size: 16, color: "6B7280" })] })],
          }),
        },
        children,
      },
    ],
  })
  return Packer.toBuffer(doc)
}
