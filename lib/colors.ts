// Detecção de cor a partir do nome do produto.
// Os produtos têm a cor escrita em inglês no nome (ex.: "iPhone 15 Midnight Blue").
// Aqui mapeamos os termos em inglês para um rótulo em português e uma cor de
// exibição (hex) usada nas tags/variações de cor.

export type DetectedColor = { key: string; label: string; hex: string }

// Ordem importa apenas para empate de posição (mantém termos compostos antes
// dos simples quando começam na mesma posição). O match real prioriza a
// ocorrência mais à esquerda no nome.
const COLOR_MAP: Record<string, { label: string; hex: string }> = {
  midnight: { label: "Meia-noite", hex: "#191970" },
  graphite: { label: "Grafite", hex: "#383838" },
  charcoal: { label: "Carvão", hex: "#36454f" },
  champagne: { label: "Champanhe", hex: "#f7e7ce" },
  turquoise: { label: "Turquesa", hex: "#40e0d0" },
  lavender: { label: "Lavanda", hex: "#b57edc" },
  burgundy: { label: "Bordô", hex: "#800020" },
  maroon: { label: "Bordô", hex: "#7f1d1d" },
  magenta: { label: "Magenta", hex: "#d946ef" },
  violet: { label: "Violeta", hex: "#8b5cf6" },
  indigo: { label: "Índigo", hex: "#4f46e5" },
  bronze: { label: "Bronze", hex: "#cd7f32" },
  silver: { label: "Prata", hex: "#c0c0c0" },
  golden: { label: "Dourado", hex: "#d4af37" },
  yellow: { label: "Amarelo", hex: "#eab308" },
  orange: { label: "Laranja", hex: "#f97316" },
  purple: { label: "Roxo", hex: "#a855f7" },
  coral: { label: "Coral", hex: "#ff7f50" },
  beige: { label: "Bege", hex: "#d8c3a5" },
  khaki: { label: "Cáqui", hex: "#c3b091" },
  ivory: { label: "Marfim", hex: "#eae0c8" },
  cream: { label: "Creme", hex: "#e8e0c5" },
  brown: { label: "Marrom", hex: "#92400e" },
  black: { label: "Preto", hex: "#111111" },
  white: { label: "Branco", hex: "#f4f4f5" },
  green: { label: "Verde", hex: "#22c55e" },
  navy: { label: "Azul-marinho", hex: "#1e3a5f" },
  blue: { label: "Azul", hex: "#3b82f6" },
  teal: { label: "Azul-petróleo", hex: "#14b8a6" },
  cyan: { label: "Ciano", hex: "#06b6d4" },
  aqua: { label: "Água", hex: "#22d3ee" },
  mint: { label: "Menta", hex: "#86efac" },
  lime: { label: "Lima", hex: "#84cc16" },
  gold: { label: "Dourado", hex: "#d4af37" },
  gray: { label: "Cinza", hex: "#6b7280" },
  grey: { label: "Cinza", hex: "#6b7280" },
  sand: { label: "Areia", hex: "#c2b280" },
  pink: { label: "Rosa", hex: "#ec4899" },
  rose: { label: "Rosé", hex: "#e11d68" },
  red: { label: "Vermelho", hex: "#ef4444" },
}

/**
 * Detecta a cor presente no nome do produto. Retorna a ocorrência mais à
 * esquerda (ex.: "Space Gray" -> Cinza). Retorna null se nenhuma for encontrada.
 */
export function detectColor(name: string | null | undefined): DetectedColor | null {
  if (!name) return null
  const lower = name.toLowerCase()
  let best: { color: DetectedColor; index: number } | null = null

  for (const [key, val] of Object.entries(COLOR_MAP)) {
    const re = new RegExp(`\\b${key}\\b`, "i")
    const m = lower.match(re)
    if (m && m.index !== undefined) {
      if (!best || m.index < best.index) {
        best = { color: { key, label: val.label, hex: val.hex }, index: m.index }
      }
    }
  }
  return best?.color ?? null
}

/**
 * Lista as cores distintas detectadas em uma coleção de nomes, ordenadas
 * alfabeticamente pelo rótulo. Útil para montar filtros de cor.
 */
export function distinctColors(names: (string | null | undefined)[]): DetectedColor[] {
  const map = new Map<string, DetectedColor>()
  for (const n of names) {
    const c = detectColor(n)
    if (c && !map.has(c.label)) map.set(c.label, c)
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}
