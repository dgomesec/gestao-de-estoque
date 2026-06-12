import { detectColor } from "@/lib/colors"

/**
 * Tag de cor detectada a partir do nome do produto. Mostra um indicador
 * circular com a cor real e o rótulo em português. Não renderiza nada quando
 * nenhuma cor é identificada no nome.
 */
export function ColorTag({
  name,
  showLabel = true,
  className,
}: {
  name: string | null | undefined
  showLabel?: boolean
  className?: string
}) {
  const color = detectColor(name)
  if (!color) return null

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${className ?? ""}`}
    >
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full border border-black/10"
        style={{ backgroundColor: color.hex }}
      />
      {showLabel && <span>{color.label}</span>}
    </span>
  )
}

/**
 * Apenas o "ponto" de cor, sem rótulo. Útil em espaços apertados como dropdowns.
 */
export function ColorDot({ name, className }: { name: string | null | undefined; className?: string }) {
  const color = detectColor(name)
  if (!color) return null
  return (
    <span
      aria-label={`Cor: ${color.label}`}
      title={color.label}
      className={`inline-block size-2.5 shrink-0 rounded-full border border-black/10 ${className ?? ""}`}
      style={{ backgroundColor: color.hex }}
    />
  )
}
