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
 * Detecta TODAS as cores presentes no nome do produto, sem repetição, na ordem
 * em que aparecem (esquerda para direita). Cores que compartilham o mesmo
 * rótulo (ex.: "maroon"/"burgundy" -> Bordô) contam como uma só.
 */
export function detectColors(name: string | null | undefined): DetectedColor[] {
  if (!name) return []
  const lower = name.toLowerCase()
  const found: { color: DetectedColor; index: number }[] = []

  for (const [key, val] of Object.entries(COLOR_MAP)) {
    const re = new RegExp(`\\b${key}\\b`, "i")
    const m = lower.match(re)
    if (m && m.index !== undefined) {
      found.push({ color: { key, label: val.label, hex: val.hex }, index: m.index })
    }
  }

  found.sort((a, b) => a.index - b.index)
  const out: DetectedColor[] = []
  const seenLabels = new Set<string>()
  for (const f of found) {
    if (seenLabels.has(f.color.label)) continue
    seenLabels.add(f.color.label)
    out.push(f.color)
  }
  return out
}

// Índice reverso: rótulo em português -> cor de exibição. Permite recuperar o
// hex a partir da cor persistida no banco (que guarda o rótulo, não o termo).
const LABEL_MAP = new Map<string, DetectedColor>()
for (const [key, val] of Object.entries(COLOR_MAP)) {
  if (!LABEL_MAP.has(val.label)) {
    LABEL_MAP.set(val.label, { key, label: val.label, hex: val.hex })
  }
}

/**
 * Resolve a cor de exibição a partir de um rótulo em português (ex.: "Azul").
 * Retorna null se o rótulo não for reconhecido.
 */
export function colorFromLabel(label: string | null | undefined): DetectedColor | null {
  if (!label) return null
  return LABEL_MAP.get(label.trim()) ?? null
}

/**
 * Todas as cores disponíveis (rótulos únicos), ordenadas alfabeticamente.
 * Usado para montar o seletor de cor no formulário de produto.
 */
export const ALL_COLORS: DetectedColor[] = Array.from(LABEL_MAP.values()).sort((a, b) =>
  a.label.localeCompare(b.label, "pt-BR"),
)

/**
 * Quebra uma cor persistida (que pode ser uma lista "Azul, Preto") em rótulos
 * individuais, resolvendo o hex de cada um. Rótulos desconhecidos recebem um
 * cinza neutro para ainda exibirem o nome.
 */
export function parseStoredColors(stored: string | null | undefined): DetectedColor[] {
  if (!stored) return []
  return stored
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(
      (label) => colorFromLabel(label) ?? { key: label.toLowerCase(), label, hex: "#9ca3af" },
    )
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
