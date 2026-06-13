import type { Tenant } from '@/lib/tenant'

/**
 * Injeta as cores de marca do tenant sobrescrevendo as CSS variables do tema
 * em :root. Apenas as variáveis com valor definido são sobrescritas; as demais
 * permanecem com o tema padrão. Os valores são armazenados como strings de cor
 * CSS válidas (ex.: "oklch(...)", "#0f62fe").
 */
export function TenantBrandStyle({
  tenant,
}: {
  tenant: Pick<
    Tenant,
    | 'colorPrimary'
    | 'colorPrimaryForeground'
    | 'colorAccent'
    | 'colorAccentForeground'
    | 'colorBackground'
    | 'colorForeground'
  > | null
}) {
  if (!tenant) return null

  const lines: string[] = []
  const push = (varName: string, value: string | null) => {
    if (value && value.trim()) lines.push(`${varName}: ${value.trim()};`)
  }

  push('--primary', tenant.colorPrimary)
  push('--primary-foreground', tenant.colorPrimaryForeground)
  // A cor primária também define o anel de foco e o destaque da sidebar.
  push('--ring', tenant.colorPrimary)
  push('--sidebar-primary', tenant.colorPrimary)
  push('--sidebar-primary-foreground', tenant.colorPrimaryForeground)
  push('--accent', tenant.colorAccent)
  push('--accent-foreground', tenant.colorAccentForeground)
  push('--background', tenant.colorBackground)
  push('--foreground', tenant.colorForeground)
  push('--chart-1', tenant.colorPrimary)

  if (lines.length === 0) return null

  return (
    <style
      // Sobrescreve as variáveis do tema em runtime para este tenant.
      dangerouslySetInnerHTML={{ __html: `:root{${lines.join('')}}` }}
    />
  )
}
