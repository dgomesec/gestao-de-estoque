// Módulo client-safe: tipos e catálogos usados pelo editor de fluxos e pelo motor.

export const TRIGGERS = [
  { key: "sale_created", label: "Venda registrada", hint: "Dispara quando uma venda é finalizada." },
  { key: "quote_created", label: "Orçamento criado", hint: "Dispara quando um novo orçamento é gerado." },
  { key: "quote_approved", label: "Orçamento aprovado pelo cliente", hint: "Dispara quando o cliente aprova pelo link público." },
  { key: "quote_converted", label: "Orçamento convertido em venda", hint: "Dispara quando um orçamento vira venda." },
  { key: "invoice_updated", label: "Nota fiscal informada", hint: "Dispara quando os números das notas fiscais de um pedido são salvos." },
] as const
export type TriggerKey = (typeof TRIGGERS)[number]["key"]
export const TRIGGER_LABELS = Object.fromEntries(TRIGGERS.map((t) => [t.key, t.label])) as Record<TriggerKey, string>

export type FieldType = "number" | "text" | "boolean" | "list"

export type FieldDef = { key: string; label: string; type: FieldType; group: string; options?: { value: string; label: string }[] }

export const FIELDS: FieldDef[] = [
  { key: "pedido.tipo", label: "Tipo do pedido", type: "text", group: "Pedido", options: [{ value: "sale", label: "Venda" }, { value: "quote", label: "Orçamento" }] },
  { key: "pedido.aprovado", label: "Orçamento aprovado", type: "boolean", group: "Pedido" },
  { key: "pedido.total", label: "Valor total (R$)", type: "number", group: "Pedido" },
  { key: "pedido.totalUsd", label: "Valor total (US$)", type: "number", group: "Pedido" },
  { key: "pedido.moeda", label: "Moeda da venda", type: "text", group: "Pedido", options: [{ value: "BRL", label: "BRL" }, { value: "USD", label: "USD" }] },
  { key: "pedido.itens", label: "Quantidade de linhas (itens)", type: "number", group: "Pedido" },
  { key: "pedido.quantidade", label: "Quantidade total de unidades", type: "number", group: "Pedido" },
  { key: "pedido.lucro", label: "Lucro estimado (R$)", type: "number", group: "Pedido" },
  { key: "pedido.diaSemana", label: "Dia da semana (0=dom ... 6=sáb)", type: "number", group: "Pedido" },
  { key: "pedido.notasFiscais", label: "Números das notas fiscais", type: "list", group: "Pedido" },
  { key: "pedido.qtdNotasFiscais", label: "Quantidade de notas fiscais", type: "number", group: "Pedido" },
  { key: "pedido.temNotaFiscal", label: "Possui nota fiscal", type: "boolean", group: "Pedido" },
  { key: "produtos.nomes", label: "Nomes dos produtos", type: "list", group: "Produtos" },
  { key: "produtos.skus", label: "SKUs dos produtos", type: "list", group: "Produtos" },
  { key: "cliente.nome", label: "Nome do cliente", type: "text", group: "Cliente" },
  { key: "cliente.email", label: "E-mail do cliente", type: "text", group: "Cliente" },
  { key: "cliente.telefone", label: "Telefone do cliente", type: "text", group: "Cliente" },
  { key: "cliente.documento", label: "Documento (CPF/CNPJ)", type: "text", group: "Cliente" },
  { key: "cliente.cidade", label: "Cidade do cliente", type: "text", group: "Cliente" },
  { key: "cliente.estado", label: "Estado do cliente", type: "text", group: "Cliente" },
  { key: "cliente.identificado", label: "Cliente cadastrado", type: "boolean", group: "Cliente" },
]
export const FIELD_MAP = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<string, FieldDef>

export const OPERATORS = [
  { key: "eq", label: "é igual a (EQUAL)", types: ["number", "text", "boolean", "list"], needsValue: true },
  { key: "neq", label: "é diferente de (NOT EQUAL)", types: ["number", "text", "boolean", "list"], needsValue: true },
  { key: "gt", label: "é maior que", types: ["number"], needsValue: true },
  { key: "gte", label: "é maior ou igual a", types: ["number"], needsValue: true },
  { key: "lt", label: "é menor que", types: ["number"], needsValue: true },
  { key: "lte", label: "é menor ou igual a", types: ["number"], needsValue: true },
  { key: "between", label: "está entre (min, max)", types: ["number"], needsValue: true },
  { key: "contains", label: "contém", types: ["text", "list"], needsValue: true },
  { key: "not_contains", label: "não contém", types: ["text", "list"], needsValue: true },
  { key: "starts_with", label: "começa com", types: ["text"], needsValue: true },
  { key: "ends_with", label: "termina com", types: ["text"], needsValue: true },
  { key: "in", label: "está em (lista separada por vírgula)", types: ["text", "number", "list"], needsValue: true },
  { key: "not_in", label: "não está em (lista)", types: ["text", "number", "list"], needsValue: true },
  { key: "is_empty", label: "está vazio", types: ["text", "list", "number"], needsValue: false },
  { key: "is_not_empty", label: "não está vazio", types: ["text", "list", "number"], needsValue: false },
] as const
export type OperatorKey = (typeof OPERATORS)[number]["key"]
export const OPERATOR_MAP = Object.fromEntries(OPERATORS.map((o) => [o.key, o])) as Record<string, (typeof OPERATORS)[number]>

export type ConditionRule = { type: "rule"; id: string; field: string; operator: OperatorKey; value: string }
export type ConditionGroup = {
  type: "group"
  id: string
  op: "AND" | "OR"
  // NOT: inverte o resultado do grupo inteiro.
  negate: boolean
  children: ConditionNode[]
}
export type ConditionNode = ConditionRule | ConditionGroup

export type EmailAction = {
  type: "send_email"
  id: string
  to: "customer" | "custom"
  customTo: string
  subject: string
  body: string
  attachTemplateId: number | null
}
export type DocumentAction = { type: "generate_document"; id: string; templateId: number | null }
export type TaskAction = { type: "create_task"; id: string; title: string; description: string }
export type FlowAction = EmailAction | DocumentAction | TaskAction

export function emptyGroup(): ConditionGroup {
  return { type: "group", id: uid(), op: "AND", negate: false, children: [] }
}
export function uid() {
  return Math.random().toString(36).slice(2, 10)
}

// Variáveis disponíveis em e-mails, tarefas e documentos.
export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: "loja.nome", label: "Nome da loja" },
  { key: "loja.email", label: "E-mail da loja" },
  { key: "loja.telefone", label: "Telefone da loja" },
  { key: "loja.endereco", label: "Endereço da loja" },
  { key: "pedido.codigo", label: "Código (VND-/ORC-)" },
  { key: "pedido.data", label: "Data do pedido" },
  { key: "pedido.tipo", label: "Venda ou Orçamento" },
  { key: "pedido.total", label: "Total formatado" },
  { key: "pedido.itens", label: "Qtd. de itens" },
  { key: "pedido.produtos", label: "Lista de produtos" },
  { key: "pedido.notasFiscais", label: "Notas fiscais (separadas por vírgula)" },
  { key: "cliente.nome", label: "Nome do cliente" },
  { key: "cliente.email", label: "E-mail do cliente" },
  { key: "cliente.telefone", label: "Telefone do cliente" },
  { key: "cliente.documento", label: "Documento do cliente" },
  { key: "link.recibo", label: "Link do recibo" },
  { key: "link.aprovacao", label: "Link de aprovação" },
  { key: "hoje", label: "Data de hoje" },
]

// Especificação de documento (renderizada em PDF com a marca do cliente).
export type DocBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "kv"; rows: { label: string; value: string }[] }
  | { type: "items_table" }
  | { type: "totals" }
  | { type: "signatures"; labels: string[] }
  | { type: "spacer" }
export type DocSpec = { title: string; subtitle?: string; blocks: DocBlock[] }
