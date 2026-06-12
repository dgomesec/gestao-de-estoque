export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0)
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(value) ? value : 0)
}

export function formatPct(value: number): string {
  return `${Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`
}

export function formatDateTime(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Identificador único e legível de uma venda/orçamento, derivado do id e do
 * tipo. Ex.: VND-000123 (venda) ou ORC-000123 (orçamento).
 */
export function formatSaleCode(kind: string, id: number): string {
  const prefix = kind === 'quote' ? 'ORC' : 'VND'
  return `${prefix}-${String(id).padStart(6, '0')}`
}

/** Mês atual no formato "YYYY-MM". */
export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
