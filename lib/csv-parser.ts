/**
 * Parser CSV simples que respeita aspas e semicolons como delimitadores.
 * Retorna array de objetos com chaves = cabeçalhos.
 */
export function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
  if (lines.length < 2) return []

  // Parse header (linha 1)
  const headers = parseCsvLine(lines[0])

  // Parse data rows
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    if (values.length > 0) {
      const row: Record<string, string> = {}
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] || ''
      }
      rows.push(row)
    }
  }

  return rows
}

/**
 * Parse uma linha CSV respeitando aspas duplas.
 * Suporta delimitadores: semicolon, vírgula, tab.
 */
function parseCsvLine(line: string): string[] {
  // Detectar delimitador (semicolon é mais comum em PT-BR)
  const delim = line.includes(';') ? ';' : line.includes('\t') ? '\t' : ','
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === delim && !inQuotes) {
      // Field delimiter
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  // Add last field
  fields.push(current.trim())
  return fields
}
