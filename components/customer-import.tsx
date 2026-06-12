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
import { Upload, FileSpreadsheet, Sparkles, Download, FileText, Loader2 } from "lucide-react"
import { importCustomers, type CustomerInput } from "@/app/actions/customers"
import { extractCustomersFromText, extractCustomersFromFile, type AiExtractedCustomer } from "@/app/actions/ai-import"
import {
  parseCustomersCsv,
  parseCustomersXlsx,
  downloadCustomerTemplate,
  fileToDataUrl,
} from "@/lib/import-parsers"

type Source = "batch" | "ai"

export function CustomerImport() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState("lote")
  const [rows, setRows] = useState<CustomerInput[]>([])
  const [source, setSource] = useState<Source>("batch")
  const [pasted, setPasted] = useState("")
  const [analyzing, setAnalyzing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const aiFileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setRows([])
    setPasted("")
  }

  async function handleBatchFile(file: File) {
    try {
      const ext = file.name.split(".").pop()?.toLowerCase()
      let parsed: CustomerInput[] = []
      if (ext === "csv") parsed = await parseCustomersCsv(file)
      else if (ext === "xlsx" || ext === "xls") parsed = await parseCustomersXlsx(file)
      else {
        toast.error("Formato não suportado. Use CSV ou XLSX.")
        return
      }
      const valid = parsed.filter((r) => r.name?.trim())
      if (valid.length === 0) {
        toast.error("Nenhuma linha válida encontrada no arquivo.")
        return
      }
      setSource("batch")
      setRows(valid)
      toast.success(`${valid.length} cliente(s) carregado(s). Revise e confirme.`)
    } catch {
      toast.error("Falha ao ler o arquivo.")
    }
  }

  async function handleAiFile(file: File) {
    setAnalyzing(true)
    setRows([])
    try {
      const ext = file.name.split(".").pop()?.toLowerCase()
      if (ext === "csv" || ext === "xlsx" || ext === "xls") {
        const parsed = ext === "csv" ? await parseCustomersCsv(file) : await parseCustomersXlsx(file)
        const asText = JSON.stringify(parsed)
        applyAiResult(await extractCustomersFromText(asText))
        return
      }
      const dataUrl = await fileToDataUrl(file)
      applyAiResult(await extractCustomersFromFile(dataUrl, file.type || "image/jpeg"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na análise por IA.")
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleAiText() {
    if (!pasted.trim()) {
      toast.error("Cole a lista de clientes.")
      return
    }
    setAnalyzing(true)
    setRows([])
    try {
      applyAiResult(await extractCustomersFromText(pasted))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na análise por IA.")
    } finally {
      setAnalyzing(false)
    }
  }

  function applyAiResult(customers: AiExtractedCustomer[]) {
    if (customers.length === 0) {
      toast.error("A IA não encontrou clientes no documento.")
      return
    }
    setSource("ai")
    setRows(
      customers.map((c) => ({
        name: c.name ?? "",
        phone: c.phone ?? "",
        email: c.email ?? "",
        document: c.document ?? "",
        addressLine: c.addressLine ?? "",
        city: c.city ?? "",
        state: c.state ?? "",
        zipCode: c.zipCode ?? "",
        notes: c.notes ?? "",
      })),
    )
    toast.success(`${customers.length} cliente(s) identificado(s). Revise e confirme.`)
  }

  function updateRow(i: number, patch: Partial<CustomerInput>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  function confirmImport() {
    if (rows.length === 0) return
    startTransition(async () => {
      try {
        const result = await importCustomers(rows)
        if (result.imported > 0) {
          toast.success(`${result.imported} cliente(s) importado(s) com sucesso.`)
        }
        if (result.skipped > 0) {
          toast.warning(
            `${result.skipped} linha(s) ignorada(s)${result.errors[0] ? `: ${result.errors[0].message}` : " (duplicadas ou inválidas)"}.`,
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
            <DialogTitle>Importar clientes</DialogTitle>
            <DialogDescription>
              Importe em lote por planilha ou use o assistente de IA para ler listas, cadastros e documentos.
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
                  <Button variant="secondary" size="sm" onClick={() => downloadCustomerTemplate("xlsx")} className="gap-2">
                    <Download className="size-4" aria-hidden="true" />
                    Template XLSX
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => downloadCustomerTemplate("csv")} className="gap-2">
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
                  <span className="text-sm font-medium">Enviar lista, cadastro ou documento</span>
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
                  <Label htmlFor="ai-cust-text">Ou cole a lista de clientes</Label>
                  <Textarea
                    id="ai-cust-text"
                    rows={4}
                    placeholder="Cole aqui nomes, telefones, e-mails e endereços dos clientes..."
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
                  <p className="text-xs text-muted-foreground">Edite os campos antes de confirmar</p>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-40">Nome</TableHead>
                        <TableHead className="min-w-32">Telefone</TableHead>
                        <TableHead className="min-w-40">E-mail</TableHead>
                        <TableHead className="min-w-32">CPF/CNPJ</TableHead>
                        <TableHead className="min-w-32">Cidade</TableHead>
                        <TableHead className="w-16">UF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <Input
                              value={r.name}
                              onChange={(e) => updateRow(i, { name: e.target.value })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={r.phone}
                              onChange={(e) => updateRow(i, { phone: e.target.value })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={r.email}
                              onChange={(e) => updateRow(i, { email: e.target.value })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={r.document}
                              onChange={(e) => updateRow(i, { document: e.target.value })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={r.city}
                              onChange={(e) => updateRow(i, { city: e.target.value })}
                              className="h-8"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={r.state}
                              maxLength={2}
                              onChange={(e) => updateRow(i, { state: e.target.value.toUpperCase() })}
                              className="h-8"
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
