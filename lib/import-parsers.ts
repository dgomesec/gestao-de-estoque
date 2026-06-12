"use client"

import * as XLSX from "xlsx"
import Papa from "papaparse"
import type { ImportRow } from "@/app/actions/products"

// Cabeçalhos esperados no template (em português) mapeados para os campos.
export const TEMPLATE_HEADERS = [
  "sku",
  "nome",
  "descricao",
  "quantidade",
  "preco_usd",
  "margem_min",
  "margem_max",
  "estoque_minimo",
] as const

// Aceita variações comuns de nomes de coluna.
const FIELD_ALIASES: Record<string, keyof ImportRow> = {
  sku: "sku",
  codigo: "sku",
  "código": "sku",
  nome: "name",
  produto: "name",
  name: "name",
  descricao: "description",
  "descrição": "description",
  description: "description",
  cor: "color",
  color: "color",
  quantidade: "quantity",
  qtd: "quantity",
  quantity: "quantity",
  preco_usd: "priceUsd",
  "preço_usd": "priceUsd",
  preco: "priceUsd",
  "preço": "priceUsd",
  custo: "priceUsd",
  custo_usd: "priceUsd",
  price: "priceUsd",
  priceusd: "priceUsd",
  margem_min: "marginMin",
  margem_minima: "marginMin",
  marginmin: "marginMin",
  margem_max: "marginMax",
  margem_maxima: "marginMax",
  marginmax: "marginMax",
  estoque_minimo: "reorderLevel",
  estoque_mínimo: "reorderLevel",
  reorder: "reorderLevel",
  reorderlevel: "reorderLevel",
}

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function rowsFromRecords(records: Record<string, unknown>[]): ImportRow[] {
  return records.map((rec) => {
    const out: Partial<ImportRow> = {}
    for (const [rawKey, value] of Object.entries(rec)) {
      const field = FIELD_ALIASES[normalizeKey(rawKey)]
      if (!field) continue
      if (field === "sku" || field === "name" || field === "description" || field === "color" || field === "colorHex") {
        out[field] = value == null ? "" : String(value).trim()
      } else {
        out[field] = toNumber(value)
      }
    }
    return {
      sku: out.sku ?? "",
      name: out.name ?? "",
      description: out.description,
      color: out.color,
      quantity: out.quantity ?? 0,
      priceUsd: out.priceUsd ?? 0,
      marginMin: out.marginMin ?? 0,
      marginMax: out.marginMax ?? 0,
      reorderLevel: out.reorderLevel ?? 5,
    }
  })
}

/** Faz o parse de um arquivo CSV em linhas de importação. */
export function parseCsv(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(rowsFromRecords(res.data)),
      error: (err) => reject(err),
    })
  })
}

/** Faz o parse de um arquivo XLSX em linhas de importação. */
export async function parseXlsx(file: File): Promise<ImportRow[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
  return rowsFromRecords(records)
}

/** Gera e baixa um arquivo de template (CSV ou XLSX) com cabeçalhos e exemplo. */
export function downloadTemplate(format: "csv" | "xlsx") {
  const example = {
    sku: "IPH15-128",
    nome: "iPhone 15 128GB",
    descricao: "Smartphone Apple",
    quantidade: 10,
    preco_usd: 650,
    margem_min: 15,
    margem_max: 40,
    estoque_minimo: 5,
  }
  if (format === "csv") {
    const csv = Papa.unparse({ fields: [...TEMPLATE_HEADERS], data: [Object.values(example)] })
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), "template-produtos.csv")
  } else {
    const ws = XLSX.utils.json_to_sheet([example], { header: [...TEMPLATE_HEADERS] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Produtos")
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" })
    triggerDownload(
      new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "template-produtos.xlsx",
    )
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Lê um arquivo como data URL (para enviar imagens/PDF à IA). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// --- Clientes ---------------------------------------------------------------

import type { CustomerInput } from "@/app/actions/customers"

export const CUSTOMER_TEMPLATE_HEADERS = [
  "nome",
  "telefone",
  "email",
  "documento",
  "endereco",
  "cidade",
  "uf",
  "cep",
  "observacoes",
] as const

const CUSTOMER_FIELD_ALIASES: Record<string, keyof CustomerInput> = {
  nome: "name",
  cliente: "name",
  name: "name",
  telefone: "phone",
  celular: "phone",
  fone: "phone",
  phone: "phone",
  email: "email",
  "e-mail": "email",
  documento: "document",
  doc: "document",
  cpf: "document",
  cnpj: "document",
  "cpf/cnpj": "document",
  document: "document",
  endereco: "addressLine",
  "endereço": "addressLine",
  address: "addressLine",
  logradouro: "addressLine",
  cidade: "city",
  municipio: "city",
  "município": "city",
  city: "city",
  uf: "state",
  estado: "state",
  state: "state",
  cep: "zipCode",
  zip: "zipCode",
  zipcode: "zipCode",
  observacoes: "notes",
  "observações": "notes",
  obs: "notes",
  notes: "notes",
}

function customerRowsFromRecords(records: Record<string, unknown>[]): CustomerInput[] {
  return records.map((rec) => {
    const out: Partial<CustomerInput> = {}
    for (const [rawKey, value] of Object.entries(rec)) {
      const field = CUSTOMER_FIELD_ALIASES[normalizeKey(rawKey)]
      if (!field) continue
      let str = value == null ? "" : String(value).trim()
      if (field === "state") str = str.toUpperCase().slice(0, 2)
      out[field] = str
    }
    return {
      name: out.name ?? "",
      phone: out.phone ?? "",
      email: out.email ?? "",
      document: out.document ?? "",
      addressLine: out.addressLine ?? "",
      city: out.city ?? "",
      state: out.state ?? "",
      zipCode: out.zipCode ?? "",
      notes: out.notes ?? "",
    }
  })
}

/** Faz o parse de um CSV em linhas de clientes. */
export function parseCustomersCsv(file: File): Promise<CustomerInput[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(customerRowsFromRecords(res.data)),
      error: (err) => reject(err),
    })
  })
}

/** Faz o parse de um XLSX em linhas de clientes. */
export async function parseCustomersXlsx(file: File): Promise<CustomerInput[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: "array" })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
  return customerRowsFromRecords(records)
}

/** Gera e baixa um template de clientes (CSV ou XLSX). */
export function downloadCustomerTemplate(format: "csv" | "xlsx") {
  const example = {
    nome: "Maria Souza",
    telefone: "(11) 98888-7777",
    email: "maria@exemplo.com",
    documento: "123.456.789-00",
    endereco: "Rua das Flores, 100",
    cidade: "São Paulo",
    uf: "SP",
    cep: "01000-000",
    observacoes: "Cliente recorrente",
  }
  if (format === "csv") {
    const csv = Papa.unparse({ fields: [...CUSTOMER_TEMPLATE_HEADERS], data: [Object.values(example)] })
    triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8;" }), "template-clientes.csv")
  } else {
    const ws = XLSX.utils.json_to_sheet([example], { header: [...CUSTOMER_TEMPLATE_HEADERS] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Clientes")
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" })
    triggerDownload(
      new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "template-clientes.xlsx",
    )
  }
}
