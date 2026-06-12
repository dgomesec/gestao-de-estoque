"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ALL_COLORS, colorFromLabel, normalizeHex, nearestNamedColor } from "@/lib/colors"

export type ColorValue = {
  // Rótulo em português (ex.: "Azul") ou vazio para "sem cor".
  label: string
  // HEX exato escolhido (ex.: "#3b82f6") ou vazio.
  hex: string
}

/**
 * Seletor de cor reutilizável. Permite ao usuário:
 *  - escolher uma cor da paleta nomeada (swatches);
 *  - digitar/colar um código HEX livre;
 *  - usar o seletor de cor nativo do navegador.
 * Ao informar um HEX que não bate exatamente com a paleta, o rótulo é definido
 * automaticamente para a cor nomeada mais próxima.
 */
export function ColorPicker({
  value,
  onChange,
  detectedHint,
  allowNone = true,
}: {
  value: ColorValue
  onChange: (next: ColorValue) => void
  // Texto opcional exibido quando nenhuma cor foi escolhida (ex.: cor detectada
  // pelo nome do produto).
  detectedHint?: string | null
  allowNone?: boolean
}) {
  // Campo de texto do HEX, mantido localmente para permitir digitação parcial.
  const [hexInput, setHexInput] = useState(value.hex || "")

  useEffect(() => {
    setHexInput(value.hex || "")
  }, [value.hex])

  // HEX efetivo para o seletor nativo (precisa de um valor #rrggbb válido).
  const nativeHex = normalizeHex(value.hex) ?? colorFromLabel(value.label)?.hex ?? "#000000"
  const hasSelection = Boolean(value.label || value.hex)

  function selectFromPalette(label: string) {
    const hex = colorFromLabel(label)?.hex ?? ""
    onChange({ label, hex })
  }

  function clear() {
    onChange({ label: "", hex: "" })
  }

  // Confirma um HEX digitado: normaliza e define o rótulo pela cor mais próxima.
  function commitHex(raw: string) {
    const hex = normalizeHex(raw)
    if (!hex) {
      // Mantém o texto para o usuário corrigir, sem alterar a seleção.
      return
    }
    const label = nearestNamedColor(hex)?.label ?? value.label
    onChange({ label, hex })
    setHexInput(hex)
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {/* Paleta de cores */}
      <div className="flex flex-wrap gap-1.5">
        {allowNone && (
          <button
            type="button"
            onClick={clear}
            aria-label="Sem cor"
            aria-pressed={!hasSelection}
            className={`flex size-7 items-center justify-center rounded-full border text-[10px] text-muted-foreground ${
              !hasSelection ? "ring-2 ring-ring ring-offset-1" : ""
            }`}
            title="Sem cor"
          >
            ✕
          </button>
        )}
        {ALL_COLORS.map((c) => {
          const active = value.label === c.label && !value.hex
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => selectFromPalette(c.label)}
              aria-label={c.label}
              aria-pressed={active}
              title={c.label}
              className={`flex size-7 items-center justify-center rounded-full border border-black/10 ${
                active ? "ring-2 ring-ring ring-offset-1" : ""
              }`}
              style={{ backgroundColor: c.hex }}
            >
              {active && <Check className="size-3.5 text-white drop-shadow" aria-hidden="true" />}
            </button>
          )
        })}
      </div>

      {/* HEX livre + seletor nativo */}
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Selecionar cor na paleta"
          value={nativeHex}
          onChange={(e) => commitHex(e.target.value)}
          className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
        <Input
          aria-label="Código HEX da cor"
          placeholder="#RRGGBB"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onBlur={() => commitHex(hexInput)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commitHex(hexInput)
            }
          }}
          className="h-9 font-mono"
        />
      </div>

      {/* Resumo da seleção */}
      {hasSelection ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-3 rounded-full border border-black/10"
            style={{ backgroundColor: normalizeHex(value.hex) ?? colorFromLabel(value.label)?.hex ?? "#9ca3af" }}
          />
          <span>
            {value.label || "Personalizada"}
            {value.hex ? ` · ${value.hex}` : ""}
          </span>
        </p>
      ) : detectedHint ? (
        <p className="text-xs text-muted-foreground">
          Sem cor definida. Detectado pelo nome: {detectedHint} (será salvo automaticamente).
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Sem cor definida.</p>
      )}
    </div>
  )
}
