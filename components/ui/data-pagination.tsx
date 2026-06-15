"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronLeft, ChevronRight } from "lucide-react"

// Opções de quantidade de registros por página. Padrão: 25.
export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

/**
 * Hook de paginação client-side. Recebe a lista completa (já filtrada) e
 * devolve apenas a fatia da página atual, além dos controles de navegação.
 *
 * - `filterKey`: string que representa os filtros/busca ativos. Quando muda,
 *   a paginação volta automaticamente para a primeira página.
 */
export function usePagination<T>(items: T[], filterKey = "", initialSize = 25) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(initialSize)

  // Sempre que os filtros ou o tamanho da página mudarem, volta à página 1.
  useEffect(() => {
    setPage(1)
  }, [filterKey, pageSize])

  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  // Garante que a página atual seja válida mesmo se a lista encolher.
  const safePage = Math.min(page, totalPages)

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  return { page: safePage, setPage, pageSize, setPageSize, pageItems, total, totalPages }
}

// Gera a lista compacta de páginas a exibir, com reticências quando necessário.
// Ex.: 1 … 4 5 6 … 20
function buildPageList(current: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const pages: (number | "ellipsis")[] = [1]
  if (current > 3) pages.push("ellipsis")
  const start = Math.max(2, current - 1)
  const end = Math.min(totalPages - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < totalPages - 2) pages.push("ellipsis")
  pages.push(totalPages)
  return pages
}

export function DataPagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  itemLabel = "registros",
}: {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  itemLabel?: string
}) {
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const pages = buildPageList(page, totalPages)

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">
        Mostrando <span className="font-medium text-foreground tabular-nums">{from}</span>
        {"–"}
        <span className="font-medium text-foreground tabular-nums">{to}</span> de{" "}
        <span className="font-medium text-foreground tabular-nums">{total}</span> {itemLabel}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Por página</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-[4.5rem]" aria-label="Registros por página">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {totalPages > 1 && (
          <nav className="flex items-center gap-1" aria-label="Paginação">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            {pages.map((p, i) =>
              p === "ellipsis" ? (
                <span key={`ellipsis-${i}`} className="px-1.5 text-muted-foreground" aria-hidden="true">
                  …
                </span>
              ) : (
                <Button
                  key={p}
                  variant={p === page ? "default" : "outline"}
                  size="icon"
                  className="size-8 tabular-nums"
                  onClick={() => onPageChange(p)}
                  aria-label={`Página ${p}`}
                  aria-current={p === page ? "page" : undefined}
                >
                  {p}
                </Button>
              ),
            )}
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="size-4" />
            </Button>
          </nav>
        )}
      </div>
    </div>
  )
}
