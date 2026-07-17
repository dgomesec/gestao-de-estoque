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
      description: z.string().nullable().describe('Detalhes adicionais do produto'),
      quantity: z.number().nullable().describe('Quantidade comprada'),
      priceUsd: z.number().nullable().describe('Preço unitário de custo em dólar (USD). Se o valor estiver em real, converta aproximando ou deixe nulo.'),
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

const SYSTEM_PROMPT = `Você é um assistente especializado em extrair produtos de notas fiscais, recibos de compra e planilhas de QUALQUER segmento comercial.
Os produtos podem ser de qualquer categoria — eletrônicos, peças automotivas, peixes ornamentais e acessórios de aquário, vestuário, alimentos, cosméticos, materiais de construção, etc. Não presuma um segmento específico: identifique os itens exatamente como aparecem no documento.
Analise o conteúdo fornecido e identifique cada item de produto distinto.
Regras:
- Extraia o nome, quantidade e preço unitário de custo de cada produto, seja ele qual for.
- Os preços devem ser o CUSTO unitário em dólar (USD). Se o documento estiver em reais (BRL) ou outra moeda, retorne o valor mesmo assim e indique a moeda em currencyDetected.
- Se não houver um SKU/código explícito, gere um SKU curto e legível derivado do nome. Exemplos por segmento: "iPhone 15 128GB" -> "IPH15-128"; "Pastilha de Freio Bosch" -> "PAST-FREIO-BOSCH"; "Peixe Betta Macho Azul" -> "BETTA-MACHO-AZUL"; "Filtro Externo Canister 1200L/h" -> "FILT-CANISTER-1200".
- Ignore linhas que não sejam produtos (impostos, frete, totais, descontos).
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

function normalize(result: z.infer<typeof extractedSchema>): AiExtractionResult {
  const products: AiExtractedProduct[] = (result.products ?? [])
    .filter((p) => p.name && p.name.trim())
    .map((p) => ({
      sku: (p.sku && p.sku.trim()) || slugifySku(p.name),
      name: p.name.trim(),
      description: p.description?.trim() || null,
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
 * Extrai produtos a partir de um arquivo (imagem ou PDF) enviado como data URL.
 */
export async function extractFromFile(
  dataUrl: string,
  mediaType: string,
): Promise<AiExtractionResult> {
  await requirePermission('products', 'create')
  if (!dataUrl) throw new Error('Arquivo vazio')

  const isPdf = mediaType === 'application/pdf'
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl
  const bytes = Buffer.from(base64, 'base64')

  try {
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
