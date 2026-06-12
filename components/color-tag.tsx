import { detectColor, parseStoredColors, normalizeHex } from "@/lib/colors"

/**
 * Tag de cor do produto. Prioriza a cor PERSISTIDA (`color`), que pode conter
 * várias cores separadas por vírgula (variações); nesse caso renderiza uma tag
 * por cor. Se nenhuma cor persistida for informada, faz fallback para a
 * detecção a partir do `name`. Não renderiza nada quando nada é identificado.
 *
 * `hex` (opcional) sobrescreve a tonalidade exibida quando há uma única cor —
 * usado para refletir o HEX exato escolhido pelo usuário.
 */
export function ColorTag({
  name,
  color,
  hex,
  showLabel = true,
  className,
}: {
  name?: string | null | undefined
  color?: string | null | undefined
  hex?: string | null | undefined
  showLabel?: boolean
  className?: string
}) {
  const stored = parseStoredColors(color)
  const colors = stored.length > 0 ? stored : (() => {
    const c = detectColor(name)
    return c ? [c] : []
  })()

  if (colors.length === 0) return null

  // Quando há uma única cor e um HEX exato foi informado, usa-o no swatch.
  const exactHex = colors.length === 1 ? normalizeHex(hex) : null

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {colors.map((c, i) => (
        <span
          key={c.key}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${className ?? ""}`}
        >
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: (i === 0 && exactHex) || c.hex }}
          />
          {showLabel && <span>{c.label}</span>}
        </span>
      ))}
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
