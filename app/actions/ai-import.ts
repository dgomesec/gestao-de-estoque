'use server'

import { generateText, Output } from 'ai'
import { z } from 'zod'
import { requirePermission } from '@/lib/rbac'

// Schema de cada produto extraído de uma nota/recibo.
const extractedSchema = z.object({
  products: z.array(
    z.object({
      sku: z.string().nullable().describe('Código/SKU do produto, se houver. Caso não exista, gere um a partir do nome.'),
      name: z.string().describe('Nome/descrição do produto'),
      description: z.string().nullable().describe('Detalhes adicionais do produto em texto livre, se houver.'),
      quantity: z.number().nullable().describe('Quantidade comprada'),
      priceUsd: z.number().nullable().describe('Preço unitário de custo em dólar (USD). Se o valor estiver em real, converta aproximando ou deixe nulo.'),
      extraAttributes: z
        .array(
          z.object({
            label: z.string().describe('Nome do atributo/campo (ex: "Altura", "Material principal", "Estado de conservação", "Garantia", "Lote", "Categoria").'),
            value: z.string().describe('Valor do atributo exatamente como aparece no documento.'),
          }),
        )
        .nullable()
        .describe('TODA informação adicional do produto que NÃO caiba nos campos estruturados (sku, name, quantity, priceUsd). Ex: dimensões (altura/comprimento/largura), materiais, estado de conservação, confiança da identificação, categoria, garantia, número de lote, observações, preços sugeridos, etc. Cada dado vira um item {label, value}. Não repita aqui o que já foi colocado em sku, name, quantity ou priceUsd.'),
    }),
  ),
  currencyDetected: z.string().nullable().describe('Moeda detectada no documento (ex: USD, BRL)'),
  documentType: z.string().nullable().describe('Tipo do documento: nota fiscal, recibo, planilha, etc.'),
})

export type AiExtractedProduct = {
  sku: string
  name: string
  description: string | null
  quantity: number
  priceUsd: number
}

export type AiExtractionResult = {
  products: AiExtractedProduct[]
  currencyDetected: string | null
  documentType: string | null
}

// Modelo multimodal (texto + imagem + PDF) disponível no tier padrão do
// AI Gateway. Evitamos modelos premium (ex.: gemini-3.5-flash), que exigem
// créditos pagos e retornam "Free tier users do not have access to this model".
const MODEL = 'google/gemini-2.5-flash'

const SYSTEM_PROMPT = `Você é um assistente especializado em extrair produtos de notas fiscais, recibos de compra e planilhas de QUALQUER segmento comercial — especialmente joalheria, gemas e coleções de pedras naturais.

Produtos de joalheria/gemas geralmente incluem informações como:
- Peso em quilates (ct) ou gramas (g)
- Dimensões em milímetros (altura, comprimento, largura)
- Tipo de lapidação ou formato
- Cor e tonalidade
- Transparência/claridade
- Origem informada
- Tratamentos conhecidos
- Certificações de laboratório (ex: GIA, CIBJO)
- Número do certificado
- Tipos de valor (atacado mínimo/máximo, varejo, joias)
- Nota/qualidade geral

IMPORTANTE PARA JOALHERIA: Capture TODOS esses detalhes em extraAttributes, pois são essenciais para catalogar uma coleção corretamente.

Regras Gerais:
- Extraia o nome, quantidade e preço unitário de custo de cada produto, seja ele qual for.
- Os preços devem ser o CUSTO unitário em dólar (USD). Se o documento estiver em reais (BRL) ou outra moeda, retorne o valor mesmo assim e indique a moeda em currencyDetected.
- Se não houver um SKU/código explícito, gere um SKU curto e legível derivado do nome. Exemplos: "Esmeralda Colombiana 5ct" -> "ESM-COL-5CT"; "Diamante VS1 1.5ct" -> "DIA-VS1-1.5CT"; "Rubi Burmês" -> "RUB-BUR".
- Ignore linhas que não sejam produtos (impostos, frete, totais, descontos).
- CRITICAL: NÃO descarte NENHUMA informação do produto. Todo dado que não couber nos campos estruturados (sku, name, quantity, priceUsd) deve ser preservado em extraAttributes. Use o rótulo original da coluna quando existir.
- Para documentos de joalheria/gemas: seja especialmente cuidadoso em capturar peso, dimensões, certificações, tratamentos, origem e qualidades.
- Se um campo não existir, retorne null.`

function slugifySku(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'PROD'
  )
}

/**
 * Converte erros do AI Gateway em mensagens claras em português.
 * O caso mais comum em contas novas é a ausência de cartão de crédito
 * no Gateway, que retorna "requires a valid credit card on file".
 */
function toFriendlyError(err: unknown): Error {
  const raw =
    err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err)
  const msg = (raw || '').toLowerCase()

  if (msg.includes('credit card') || msg.includes('valid credit card')) {
    return new Error(
      'O serviço de importação por IA precisa de uma forma de pagamento válida para liberar os créditos. Revise a configuração de faturamento do serviço de IA e tente novamente.',
    )
  }
  if (msg.includes('api key') || msg.includes('unauthorized') || msg.includes('401')) {
    return new Error(
      'Não foi possível autenticar no serviço de IA. Verifique a configuração da integração e tente novamente.',
    )
  }
  if (msg.includes('rate limit') || msg.includes('429')) {
    return new Error('Limite de requisições de IA atingido. Aguarde alguns instantes e tente novamente.')
  }
  if (msg.includes('quota') || msg.includes('insufficient') || msg.includes('billing')) {
    return new Error(
      'Os créditos de IA se esgotaram ou o faturamento do serviço não está ativo. Verifique a integração de IA.',
    )
  }
  return new Error('Falha ao processar com a IA: ' + (raw || 'erro desconhecido') + '.')
}

/**
 * Monta a descrição final combinando o texto livre extraído com todos os
 * atributos que não couberam nos campos estruturados. Cada atributo vira uma
 * linha "Rótulo: valor", de modo que nada do documento se perca.
 */
function buildDescription(
  description: string | null | undefined,
  extraAttributes: { label: string; value: string }[] | null | undefined,
): string | null {
  const lines: string[] = []

  const freeText = description?.trim()
  if (freeText) lines.push(freeText)

  for (const attr of extraAttributes ?? []) {
    const label = attr?.label?.trim()
    const value = attr?.value?.trim()
    if (!value) continue
    // Evita duplicar uma linha idêntica já presente no texto livre.
    const line = label ? `${label}: ${value}` : value
    if (!lines.includes(line)) lines.push(line)
  }

  return lines.length > 0 ? lines.join('\n') : null
}

function normalize(result: z.infer<typeof extractedSchema>): AiExtractionResult {
  const products: AiExtractedProduct[] = (result.products ?? [])
    .filter((p) => p.name && p.name.trim())
    .map((p) => ({
      sku: (p.sku && p.sku.trim()) || slugifySku(p.name),
      name: p.name.trim(),
      description: buildDescription(p.description, p.extraAttributes),
      quantity: Math.max(0, Math.trunc(Number(p.quantity) || 0)),
      priceUsd: Math.max(0, Number(p.priceUsd) || 0),
    }))
  return {
    products,
    currencyDetected: result.currencyDetected ?? null,
    documentType: result.documentType ?? null,
  }
}

/**
 * Extrai produtos a partir de texto colado (nota/recibo/lista).
 */
export async function extractFromText(text: string): Promise<AiExtractionResult> {
  await requirePermission('products', 'create')
  if (!text.trim()) throw new Error('Texto vazio')

  try {
    const { output } = await generateText({
      model: MODEL,
      system: SYSTEM_PROMPT,
      prompt: `Extraia os produtos do seguinte conteúdo:\n\n${text}`,
      output: Output.object({ schema: extractedSchema }),
    })
    return normalize(output)
  } catch (err) {
    console.log('[v0] extractFromText error:', err instanceof Error ? err.message : err)
    throw toFriendlyError(err)
  }
}

/**
 * Extrai e processa arquivos XLSX convertendo em texto estruturado.
 * Retorna o conteúdo como texto para a IA processar.
 */
async function processXlsxFile(bytes: Buffer): Promise<string> {
  try {
    const { read, utils } = await import('xlsx')
    const wb = read(bytes, { cellDates: true })
    const rows: string[] = []
    
    for (const sheet of wb.SheetNames) {
      const data = utils.sheet_to_json(wb.Sheets[sheet])
      rows.push(`=== SHEET: ${sheet} ===`)
      
      if (data.length > 0) {
        const cols = Object.keys(data[0] || {})
        rows.push(cols.join('\t'))
        
        for (const row of data) {
          rows.push(cols.map((c) => {
            const val = (row as Record<string, unknown>)[c]
            return String(val ?? '')
          }).join('\t'))
        }
      }
    }
    
    return rows.join('\n')
  } catch (err) {
    console.log('[v0] processXlsxFile error:', err instanceof Error ? err.message : err)
    return ''
  }
}

/**
 * Extrai produtos a partir de um arquivo (imagem, PDF ou Office) enviado como data URL.
 */
export async function extractFromFile(
  dataUrl: string,
  mediaType: string,
): Promise<AiExtractionResult> {
  await requirePermission('products', 'create')
  if (!dataUrl) throw new Error('Arquivo vazio')

  const isPdf = mediaType === 'application/pdf'
  const isOffice = mediaType.includes('spreadsheet') || mediaType.includes('document') ||
    mediaType.includes('xlsx') || mediaType.includes('docx')
  
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl
  const bytes = Buffer.from(base64, 'base64')

  try {
    // Se for arquivo XLSX, processar como texto estruturado
    if (isOffice) {
      const text = await processXlsxFile(bytes)
      if (text) {
        return await extractFromText(text)
      }
    }

    const { output } = await generateText({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia todos os produtos deste documento.' },
            isPdf
              ? { type: 'file', data: bytes, mediaType: 'application/pdf' }
              : { type: 'image', image: bytes, mediaType },
          ],
        },
      ],
      output: Output.object({ schema: extractedSchema }),
    })
    return normalize(output)
  } catch (err) {
    console.log('[v0] extractFromFile error:', err instanceof Error ? err.message : err)
    throw toFriendlyError(err)
  }
}

// --- Mapeamento de colunas de planilha (barato: só a amostra) ---------------

const columnMappingSchema = z.object({
  sku: z.number().int().nullable().describe('Índice (0-based) da coluna de código/SKU. null se não houver.'),
  name: z.number().int().nullable().describe('Índice da coluna do nome/descrição do produto.'),
  quantity: z.number().int().nullable().describe('Índice da coluna de quantidade em estoque. null se não houver.'),
  price: z.number().int().nullable().describe('Índice da coluna de preço de custo unitário. null se não houver.'),
  headerRowIndex: z.number().int().describe('Índice (0-based) da linha que contém os cabeçalhos.'),
  currencyDetected: z.string().nullable().describe('Moeda detectada (ex: USD, BRL). null se indefinida.'),
})

export type AiColumnMapping = {
  sku: number | null
  name: number | null
  quantity: number | null
  price: number | null
  headerRowIndex: number
  currencyDetected: string | null
}

const COLUMN_MAP_PROMPT = `Você recebe as primeiras linhas de uma planilha de produtos de QUALQUER segmento comercial (peixes ornamentais, peças de moto/automotivas, eletrônicos, vestuário, etc.).
Sua tarefa é identificar, pelos índices 0-based das colunas, qual coluna corresponde a cada campo:
- name: nome ou descrição do produto (obrigatório identificar a mais provável).
- sku: código/referência do produto, se houver.
- quantity: quantidade em estoque/saldo, se houver.
- price: preço de custo unitário; se só houver preço de venda, use-o.
Regras:
- Use null quando o campo não existir na planilha.
- Informe headerRowIndex (a linha onde estão os títulos das colunas; geralmente 0).
- Informe a moeda detectada, se possível.
- NÃO invente colunas: baseie-se apenas na amostra fornecida.`

/**
 * Analisa APENAS a amostra (cabeçalho + poucas linhas) de uma planilha e
 * devolve o mapeamento de colunas. O restante das milhares de linhas é
 * processado localmente, sem custo de IA.
 */
export async function mapProductColumns(sampleRows: string[][]): Promise<AiColumnMapping> {
  await requirePermission('products', 'create')
  if (!sampleRows?.length) throw new Error('Amostra vazia')

  const sample = sampleRows
    .slice(0, 8)
    .map((r, i) => `[linha ${i}] ${JSON.stringify(r)}`)
    .join('\n')

  try {
    const { output } = await generateText({
      model: MODEL,
      system: COLUMN_MAP_PROMPT,
      prompt: `Amostra da planilha (cada linha é um array de células):\n${sample}`,
      output: Output.object({ schema: columnMappingSchema }),
    })
    return {
      sku: output.sku ?? null,
      name: output.name ?? null,
      quantity: output.quantity ?? null,
      price: output.price ?? null,
      headerRowIndex: output.headerRowIndex ?? 0,
      currencyDetected: output.currencyDetected ?? null,
    }
  } catch (err) {
    console.log('[v0] mapProductColumns error:', err instanceof Error ? err.message : err)
    throw toFriendlyError(err)
  }
}

// --- Extração de clientes ---------------------------------------------------

const customerSchema = z.object({
  customers: z.array(
    z.object({
      name: z.string().describe('Nome completo do cliente ou empresa'),
      phone: z.string().nullable().describe('Telefone/celular'),
      email: z.string().nullable().describe('E-mail'),
      document: z.string().nullable().describe('CPF ou CNPJ'),
      addressLine: z.string().nullable().describe('Logradouro, número e complemento'),
      city: z.string().nullable().describe('Cidade'),
      state: z.string().nullable().describe('UF (2 letras)'),
      zipCode: z.string().nullable().describe('CEP'),
      notes: z.string().nullable().describe('Observações adicionais'),
    }),
  ),
})

export type AiExtractedCustomer = {
  name: string
  phone: string | null
  email: string | null
  document: string | null
  addressLine: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  notes: string | null
}

const CUSTOMER_SYSTEM_PROMPT = `Você é um assistente especializado em extrair dados de clientes a partir de listas, planilhas, contratos, cadastros e documentos diversos.
Analise o conteúdo fornecido e identifique cada cliente (pessoa ou empresa) distinto.
Regras:
- Extraia nome, telefone, e-mail, documento (CPF/CNPJ), endereço, cidade, UF, CEP e observações quando existirem.
- A UF deve ter 2 letras maiúsculas (ex: SP, RJ).
- Ignore cabeçalhos, totais e linhas que não representem um cliente.
- Se um campo não existir, retorne null. O nome é obrigatório.`

function normalizeCustomers(result: z.infer<typeof customerSchema>): AiExtractedCustomer[] {
  return (result.customers ?? [])
    .filter((c) => c.name && c.name.trim())
    .map((c) => ({
      name: c.name.trim(),
      phone: c.phone?.trim() || null,
      email: c.email?.trim() || null,
      document: c.document?.trim() || null,
      addressLine: c.addressLine?.trim() || null,
      city: c.city?.trim() || null,
      state: c.state?.trim().toUpperCase().slice(0, 2) || null,
      zipCode: c.zipCode?.trim() || null,
      notes: c.notes?.trim() || null,
    }))
}

/**
 * Extrai clientes a partir de texto colado (lista, cadastro, etc.).
 */
export async function extractCustomersFromText(text: string): Promise<AiExtractedCustomer[]> {
  await requirePermission('customers', 'create')
  if (!text.trim()) throw new Error('Texto vazio')

  try {
    const { output } = await generateText({
      model: MODEL,
      system: CUSTOMER_SYSTEM_PROMPT,
      prompt: `Extraia os clientes do seguinte conteúdo:\n\n${text}`,
      output: Output.object({ schema: customerSchema }),
    })
    return normalizeCustomers(output)
  } catch (err) {
    console.log('[v0] extractCustomersFromText error:', err instanceof Error ? err.message : err)
    throw toFriendlyError(err)
  }
}

/**
 * Extrai clientes a partir de um arquivo (imagem ou PDF) enviado como data URL.
 */
export async function extractCustomersFromFile(
  dataUrl: string,
  mediaType: string,
): Promise<AiExtractedCustomer[]> {
  await requirePermission('customers', 'create')
  if (!dataUrl) throw new Error('Arquivo vazio')

  const isPdf = mediaType === 'application/pdf'
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl
  const bytes = Buffer.from(base64, 'base64')

  try {
    const { output } = await generateText({
      model: MODEL,
      system: CUSTOMER_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extraia todos os clientes deste documento.' },
            isPdf
              ? { type: 'file', data: bytes, mediaType: 'application/pdf' }
              : { type: 'image', image: bytes, mediaType },
          ],
        },
      ],
      output: Output.object({ schema: customerSchema }),
    })
    return normalizeCustomers(output)
  } catch (err) {
    console.log('[v0] extractCustomersFromFile error:', err instanceof Error ? err.message : err)
    throw toFriendlyError(err)
  }
}
