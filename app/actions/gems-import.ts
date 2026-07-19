'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { parseCsv } from '@/lib/csv-parser'
import { requirePermission } from '@/lib/rbac'

/**
 * Mapeia as colunas do CSV para campos do Product no banco de dados.
 * Processa um registro de gema completo.
 */
export async function importGemsFromCsv(
  csvContent: string,
  tenantId: string,
): Promise<{ imported: number; errors: string[] }> {
  await requirePermission('products', 'create')

  const errors: string[] = []
  let imported = 0

  try {
    const rows = parseCsv(csvContent)
    console.log(`[v0] Parsing CSV: ${rows.length} registros encontrados`)

    const recordsToInsert: typeof products.$inferInsert[] = []
    for (const row of rows) {
      try {
        const record = mapCsvRowToProduct(row, tenantId)
        recordsToInsert.push(record)
      } catch (err) {
        errors.push(`Linha com Codigo="${row['Codigo'] || 'N/A'}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Inserir todos os registros de uma vez
    if (recordsToInsert.length > 0) {
      await db.insert(products).values(recordsToInsert)
      imported = recordsToInsert.length
    }
  } catch (err) {
    errors.push(`Erro ao importar registros: ${err instanceof Error ? err.message : String(err)}`)
  }

  return { imported, errors }
}

/**
 * Mapeia um registro do CSV para o formato esperado pelo banco de dados.
 */
function mapCsvRowToProduct(row: Record<string, string>, tenantId: string) {
  // Conversão de valores: string -> tipo correto
  const safeParseInt = (v: string | undefined) => (v ? parseInt(v, 10) || 0 : 0)
  const safeParseFloat = (v: string | undefined) => (v ? parseFloat(v) : 0)
  const safeParseBool = (v: string | undefined) => v && ['sim', 'true', '1', 'yes', 'S'].includes(String(v).toLowerCase())
  const trimStr = (v: string | undefined): string | undefined => (v ? String(v).trim() || undefined : undefined)

  // Gerar SKU a partir do Codigo se não estiver vazio
  const codigo = trimStr(row['Codigo']) || `GEM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const sku = codigo

  // Nome = Espécie + Variedade + dimensões quando aplicável
  const especie = trimStr(row['Especie']) || 'Gema'
  const variedade = trimStr(row['Variedade']) || ''
  const nome = variedade ? `${especie} ${variedade}` : especie

  // Peso em quilates
  const pesoCtStr = trimStr(row['Peso_ct']) || '0'
  const pesoCt = safeParseFloat(pesoCtStr)

  // Dimensões
  const dimensoes = trimStr(row['Dimensoes_mm']) || ''
  const [altura, comprimento, largura] = dimensoes.split('x').map((d) => safeParseFloat(d.trim())) || [0, 0, 0]

  // Material
  const mainMaterial = trimStr(row['Material_Principal']) || null

  // Valores em BRL (convertidos de string que pode ter separadores)
  const parseValorBrl = (v: string | undefined) => {
    if (!v) return 0
    // Remove "R$ ", "BRL", espaços e converte ponto/vírgula
    const cleaned = v
      .replace(/[R$BRL]/gi, '')
      .replace(/\s/g, '')
      .replace(',', '.')
    return safeParseFloat(cleaned)
  }

  // Certificado
  const hasCert = trimStr(row['Certificado']) || 'Não'
  const certificateNumber = trimStr(row['Numero_Certificado'])
  const certificateLab = trimStr(row['Laboratorio'])

  return {
    tenantId,
    sku,
    name: nome,
    description: trimStr(row['Observacoes']) || undefined,
    quantity: safeParseInt(trimStr(row['Quantidade'])),
    priceUsd: '0',
    marginMin: '15',
    marginMax: '30',
    reorderLevel: 0,
    importSource: 'batch',
    segment: 'joalheria',

    // Campos de gemas
    itemType: 'gema' as const,
    gemSpecies: trimStr(row['Especie']),
    gemVariety: trimStr(row['Variedade']),
    gemGroup: trimStr(row['Grupo']),
    cutFormat: trimStr(row['Formato_Lapidacao']),
    colorTone: trimStr(row['Cor_Tonalidade']),
    clarity: trimStr(row['Transparencia']),
    origin: trimStr(row['Origem_Informada']),
    treatment: trimStr(row['Tratamento_Conhecido']),

    // Peso
    weightCt: pesoCt > 0 ? pesoCt.toString() : undefined,
    weightConfirmed: safeParseBool(trimStr(row['Peso_Confirmado'])),
    weightMethod: trimStr(row['Metodo_Peso']),

    // Dimensões
    heightCm: altura > 0 ? altura.toString() : undefined,
    lengthCm: comprimento > 0 ? comprimento.toString() : undefined,
    widthCm: largura > 0 ? largura.toString() : undefined,
    mainMaterial: mainMaterial || undefined,

    // Certificação
    hasCertificate: !hasCert.toLowerCase().includes('não') && hasCert.trim().length > 0,
    certificateLab,
    certificateNumber,
    certificatePriority: trimStr(row['Prioridade_Certificacao']),
    certificateRecommendation: trimStr(row['Recomendacao_Certificacao']),
    reportTypeSuggested: trimStr(row['Tipo_Laudo_Sugerido']),
    labSuggested: trimStr(row['Laboratorio_Sugerido']),

    // Valores em BRL (convertidos para string se > 0)
    valuePaidTotalBrl: parseValorBrl(trimStr(row['Valor_Pago_Total_BRL'])) || undefined,
    valueWholesaleMinBrl: parseValorBrl(trimStr(row['Valor_Atacado_Min_BRL'])) || undefined,
    valueWholesaleMaxBrl: parseValorBrl(trimStr(row['Valor_Atacado_Max_BRL'])) || undefined,
    valueRetailMinBrl: parseValorBrl(trimStr(row['Valor_Varejo_Min_BRL'])) || undefined,
    valueRetailMaxBrl: parseValorBrl(trimStr(row['Valor_Varejo_Max_BRL'])) || undefined,
    valueCentralReferenceBrl: parseValorBrl(trimStr(row['Valor_Referencia_Central_BRL'])) || undefined,
    valuePctReferenceBrl: parseValorBrl(trimStr(row['Valor_Referencia_por_ct_BRL'])) || undefined,
    valueJewelryMinBrl: parseValorBrl(trimStr(row['Valor_Joia_Min_BRL'])) || undefined,
    valueJewelryMaxBrl: parseValorBrl(trimStr(row['Valor_Joia_Max_BRL'])) || undefined,
    valueStatus: trimStr(row['Status_Valor']),
    valueConfidence: trimStr(row['Confianca_Estimativa_Valor']),

    // Classificação e aplicação
    collection: trimStr(row['Colecao']),
    classDg: trimStr(row['Classe_DG']),
    generalRating: trimStr(row['Nota_Geral_10']) ? safeParseFloat(trimStr(row['Nota_Geral_10'])) : undefined,
    bestApplication: trimStr(row['Melhor_Aplicacao']),
    suggestedDestination: trimStr(row['Destino_Sugerido']),

    // Armazenamento
    storageBox: trimStr(row['Caixa']),
    storageEnvelope: trimStr(row['Envelope']),
    storagePosition: trimStr(row['Posicao']),
    physicalLocation: trimStr(row['Localizacao_Fisica']),
    itemStatus: trimStr(row['Status']) || 'Ativo',
    photosReference: trimStr(row['Fotos_Referencia']),
    pendencies: trimStr(row['Pendencias']),
    notes: trimStr(row['Observacoes']),

    createdBy: 'system-import',
  } as typeof products.$inferInsert
}
