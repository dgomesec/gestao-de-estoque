"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import { Upload, FileSpreadsheet, Sparkles, Download, FileText, Loader2, AlertTriangle } from "lucide-react"
import { importProducts, type ImportRow, type ImportSource } from "@/app/actions/products"
import { extractFromText, extractFromFile, mapProductColumns } from "@/app/actions/ai-import"
import {
  parseCsv,
  parseXlsx,
  downloadTemplate,
  fileToDataUrl,
  fileToMatrix,
  rowsFromMatrixMapping,
} from "@/lib/import-parsers"
import { formatUSD } from "@/lib/format"
import { detectColors } from "@/lib/colors"

// Estratégia de tratamento de cores para um produto com MÚLTIPLAS cores no nome.
// "variations" = uma única entrada com a lista de cores como variações.
// "split"      = uma entrada para cada cor identificada.
type ColorStrategy = "variations" | "split"

// Quantas linhas renderizar na pré-visualização. Planilhas grandes (milhares de
// itens) são importadas por completo, mas renderizar todos os inputs travaria o
// navegador — então mostramos só as primeiras e avisamos sobre o restante.
const PREVIEW_LIMIT = 100

export function ProductImport() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState("lote")
  const [rows, setRows] = useState<ImportRow[]>([])
  // Estratégia de cor escolhida para cada linha com múltiplas cores (por índice).
  const [colorStrategies, setColorStrategies] = useState<Record<number, ColorStrategy>>({})
  const [source, setSource] = useState<ImportSource>("batch")
  const [pasted, setPasted] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const aiFileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setRows([])
    setColorStrategies({})
    setPasted("")
  }

  // Monta o estado inicial de estratégias: toda linha com múltiplas cores começa
  // como "variations" (uma entrada). O usuário pode alternar para "split".
  function defaultStrategies(list: ImportRow[]): Record<number, ColorStrategy> {
    const out: Record<number, ColorStrategy> = {}
    list.forEach((r, i) => {
      if (detectColors(r.name).length > 1) out[i] = "variations"
    })
    return out
  }

  async function handleBatchFile(file: File) {
    try {
      const ext = file.name.split(".").pop()?.toLowerCase()
      let parsed: ImportRow[] = []
      if (ext === "csv") parsed = await parseCsv(file)
      else if (ext === "xlsx" || ext === "xls") parsed = await parseXlsx(file)
      else {
        toast.error("Formato não suportado. Use CSV ou XLSX.")
        return
      }
      const valid = parsed.filter((r) => r.sku || r.name)
      if (valid.length === 0) {
        toast.error("Nenhuma linha válida encontrada no arquivo.")
        return
      }
      setSource("batch")
      setRows(valid)
      setColorStrategies(defaultStrategies(valid))
      toast.success(`${valid.length} linha(s) carregada(s). Revise e confirme.`)
    } catch {
      toast.error("Falha ao ler o arquivo.")
    }
  }

  async function handleAiFile(file: File) {
    setAnalyzing(true)
    setRows([])
    try {
      const ext = file.name.split(".").pop()?.toLowerCase()
      // CSV/XLSX pela IA: lê a matriz completa (qualquer layout/segmento), pede
      // à IA apenas o MAPEAMENTO das colunas (amostra pequena = barato) e depois
      // aplica esse mapa localmente em todas as linhas — escala para milhares.
      if (ext === "csv" || ext === "xlsx" || ext === "xls") {
        const matrix = await fileToMatrix(file)
        if (matrix.rows.length === 0) {
          toast.error("A planilha está vazia ou não pôde ser lida.")
          return
        }
        const mapping = await mapProductColumns(matrix.rows.slice(0, 8))
        if (mapping.name == null) {
          toast.error("A IA não identificou uma coluna de nome/descrição de produto na planilha.")
          return
        }
        const built = rowsFromMatrixMapping(matrix, mapping)
        applyAiResult(built, mapping.currencyDetected)
        return
      }
      const dataUrl = await fileToDataUrl(file)
      const result = await extractFromFile(dataUrl, file.type || "image/jpeg")
      applyAiResult(result.products, result.currencyDetected)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na análise por IA.")
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleAiText() {
    if (!pasted.trim()) {
      toast.error("Cole o conteúdo da nota ou recibo.")
      return
    }
    setAnalyzing(true)
    setRows([])
    try {
      const result = await extractFromText(pasted)
      applyAiResult(result.products, result.currencyDetected)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na análise por IA.")
    } finally {
      setAnalyzing(false)
    }
  }

  function applyAiResult(
    products: { sku: string; name: string; description?: string | null; quantity: number; priceUsd: number }[],
    currency: string | null,
  ) {
    if (products.length === 0) {
      toast.error("A IA não encontrou produtos no documento.")
      return
    }
    setSource("ai")
    const mapped: ImportRow[] = products.map((p) => ({
      sku: p.sku,
      name: p.name,
      description: p.description ?? undefined,
      quantity: p.quantity,
      priceUsd: p.priceUsd,
      marginMin: 15,
      marginMax: 40,
      reorderLevel: 5,
    }))
    setRows(mapped)
    setColorStrategies(defaultStrategies(mapped))
    toast.success(
      `${products.length} produto(s) identificado(s)${currency ? ` (moeda: ${currency})` : ""}. Revise e confirme.`,
    )
  }

  function updateRow(i: number, patch: Partial<ImportRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
    // Se o nome mudou, reavalia se a linha passa a ter (ou deixa de ter) múltiplas cores.
    if (patch.name !== undefined) {
      const multi = detectColors(patch.name).length > 1
      setColorStrategies((prev) => {
        const next = { ...prev }
        if (multi && !next[i]) next[i] = "variations"
        if (!multi && next[i]) delete next[i]
        return next
      })
    }
  }

  function setStrategy(i: number, strategy: ColorStrategy) {
    setColorStrategies((prev) => ({ ...prev, [i]: strategy }))
  }

  // Quantas linhas têm múltiplas cores detectadas (gatilho para o aviso).
  const multiColorCount = rows.filter((r) => detectColors(r.name).length > 1).length

  /**
   * Expande as linhas conforme a estratégia de cor escolhida:
   * - 0/1 cor: registra a cor detectada (ou vazia) na própria linha.
   * - múltiplas + "variations": uma entrada com a lista de cores.
   * - múltiplas + "split": uma entrada por cor, com SKU e nome sufixados.
   */
  function expandRows(): ImportRow[] {
    const out: ImportRow[] = []
    rows.forEach((r, i) => {
      const colors = detectColors(r.name)
      if (colors.length <= 1) {
        out.push({ ...r, color: colors[0]?.label ?? null })
        return
      }
      const strategy = colorStrategies[i] ?? "variations"
      if (strategy === "variations") {
        out.push({ ...r, color: colors.map((c) => c.label).join(", ") })
      } else {
        // Divide o estoque igualmente entre as cores (o resto vai para a primeira).
        const base = Math.floor(r.quantity / colors.length)
        const rest = r.quantity - base * colors.length
        colors.forEach((c, ci) => {
          out.push({
            ...r,
            sku: `${r.sku}-${c.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6)}`,
            name: `${r.name} (${c.label})`,
            color: c.label,
            quantity: base + (ci === 0 ? rest : 0),
          })
        })
      }
    })
    return out
  }

  function confirmImport() {
    if (rows.length === 0) return
    const payload = expandRows()
    startTransition(async () => {
      try {
        const result = await importProducts(payload, source)
        if (result.imported > 0) {
          toast.success(`${result.imported} produto(s) importado(s) com sucesso.`)
        }
        if (result.merged > 0) {
          const names = result.mergedNames.slice(0, 3).join(", ")
          toast.warning(
            `${result.merged} duplicata(s) mesclada(s)${names ? `: ${names}${result.merged > 3 ? "…" : ""}` : ""}. Estoque somado e mantidos os maiores valores.`,
          )
        }
        if (result.skipped > 0) {
          toast.warning(
            `${result.skipped} linha(s) ignorada(s)${result.errors[0] ? `: ${result.errors[0].message}` : ""}.`,
          )
        }
        setOpen(false)
        reset()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao importar.")
      }
    })
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Upload className="size-4" aria-hidden="true" />
        Importar
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) reset()
        }}
      >
        <DialogContent className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Importar produtos</DialogTitle>
            <DialogDescription>
              Importe em lote por planilha ou use o assistente de IA para ler notas e recibos.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto px-6 py-4">
            <Tabs value={tab} onValueChange={(v) => { setTab(v); reset() }}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="lote" className="gap-2">
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
                  Planilha (CSV/XLSX)
                </TabsTrigger>
                <TabsTrigger value="ia" className="gap-2">
                  <Sparkles className="size-4" aria-hidden="true" />
                  Assistente de IA
                </TabsTrigger>
              </TabsList>

              <TabsContent value="lote" className="mt-4 flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => downloadTemplate("xlsx")} className="gap-2">
                    <Download className="size-4" aria-hidden="true" />
                    Template XLSX
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => downloadTemplate("csv")} className="gap-2">
                    <Download className="size-4" aria-hidden="true" />
                    Template CSV
                  </Button>
                </div>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center hover:bg-muted/50">
                  <FileSpreadsheet className="size-8 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium">Selecione um arquivo CSV ou XLSX</span>
                  <span className="text-xs text-muted-foreground">
                    Use o template para garantir o mapeamento correto das colunas
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleBatchFile(f)
                      e.target.value = ""
                    }}
                  />
                </label>
              </TabsContent>

              <TabsContent value="ia" className="mt-4 flex flex-col gap-4">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center hover:bg-muted/50">
                  <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium">Enviar nota, recibo ou planilha</span>
                  <span className="text-xs text-muted-foreground">
                    Imagem (JPG/PNG), PDF, CSV ou XLSX — a IA lê e mapeia os campos
                  </span>
                  <input
                    ref={aiFileRef}
                    type="file"
                    accept="image/*,application/pdf,.csv,.xlsx,.xls"
                    className="sr-only"
                    disabled={analyzing}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleAiFile(f)
                      e.target.value = ""
                    }}
                  />
                </label>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="ai-text">Ou cole o texto da nota/recibo</Label>
                  <Textarea
                    id="ai-text"
                    rows={4}
                    placeholder="Cole aqui o conteúdo da nota fiscal, recibo ou lista de produtos..."
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    disabled={analyzing}
                  />
                  <Button onClick={handleAiText} disabled={analyzing || !pasted.trim()} className="gap-2 self-start">
                    {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    Analisar com IA
                  </Button>
                </div>

                {analyzing && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Analisando documento com IA...
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {rows.length > 0 && (
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium">
                    Pré-visualização ({rows.length})
                    <Badge variant="secondary" className="ml-2">
                      {source === "ai" ? "IA" : "Lote"}
                    </Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {rows.length > PREVIEW_LIMIT
                      ? `Mostrando as primeiras ${PREVIEW_LIMIT} de ${rows.length} linhas`
                      : "Edite os campos antes de confirmar"}
                  </p>
                </div>
                {rows.length > PREVIEW_LIMIT && (
                  <div className="mb-3 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                    Todas as <span className="font-medium text-foreground">{rows.length}</span> linhas serão
                    importadas. A pré-visualização mostra apenas as primeiras {PREVIEW_LIMIT} para manter o
                    desempenho.
                  </div>
                )}
                {multiColorCount > 0 && (
                  <div className="mb-3 flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                    <div className="flex flex-col gap-1">
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        {multiColorCount === 1
                          ? "1 produto tem várias cores no nome"
                          : `${multiColorCount} produtos têm várias cores no nome`}
                      </p>
                      <p className="text-muted-foreground">
                        Para cada um, escolha na coluna <span className="font-medium">Cor</span> entre criar uma única
                        entrada com variações de cores ou uma entrada separada para cada cor.
                      </p>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-28">SKU</TableHead>
                        <TableHead className="min-w-40">Nome</TableHead>
                        <TableHead className="min-w-44">Cor</TableHead>
                        <TableHead className="w-20 text-right">Qtd</TableHead>
                        <TableHead className="w-28 text-right">Custo USD</TableHead>
                        <TableHead className="w-24 text-right">Mrg. mín %</TableHead>
                        <TableHead className="w-24 text-right">Mrg. máx %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Input
                              value={r.sku}
                              onChange={(e) => updateRow(i, { sku: e.target.value })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={r.name}
                              onChange={(e) => updateRow(i, { name: e.target.value })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <ColorPreviewCell
                              name={r.name}
                              strategy={colorStrategies[i] ?? "variations"}
                              onStrategyChange={(s) => setStrategy(i, s)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={r.quantity}
                              onChange={(e) => updateRow(i, { quantity: Number(e.target.value) })}
                              className="h-8 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              value={r.priceUsd}
                              onChange={(e) => updateRow(i, { priceUsd: Number(e.target.value) })}
                              className="h-8 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={r.marginMin}
                              onChange={(e) => updateRow(i, { marginMin: Number(e.target.value) })}
                              className="h-8 text-right"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={r.marginMax}
                              onChange={(e) => updateRow(i, { marginMax: Number(e.target.value) })}
                              className="h-8 text-right"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button onClick={confirmImport} disabled={isPending || rows.length === 0} className="gap-2">
              {isPending && <Loader2 className="size-4 animate-spin" />}
              Confirmar importação ({rows.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Célula de cor da pré-visualização. Mostra os pontos das cores detectadas no
 * nome. Quando há mais de uma cor, oferece a escolha entre criar uma única
 * entrada com variações ou uma entrada separada por cor.
 */
function ColorPreviewCell({
  name,
  strategy,
  onStrategyChange,
}: {
  name: string
  strategy: ColorStrategy
  onStrategyChange: (s: ColorStrategy) => void
}) {
  const colors = detectColors(name)

  if (colors.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  if (colors.length === 1) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: colors[0].hex }}
        />
        {colors[0].label}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        {colors.map((c) => (
          <span
            key={c.key}
            className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px]"
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: c.hex }}
            />
            {c.label}
          </span>
        ))}
      </div>
      <div className="inline-flex rounded-md border p-0.5">
        <button
          type="button"
          onClick={() => onStrategyChange("variations")}
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
            strategy === "variations" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          Variações
        </button>
        <button
          type="button"
          onClick={() => onStrategyChange("split")}
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
            strategy === "split" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          {colors.length} entradas
        </button>
      </div>
    </div>
  )
}
