// Segmentos disponíveis para clientes e seus produtos
export const SEGMENTS = {
  eletronica: {
    id: 'eletronica',
    label: 'Eletrônica',
    description: 'Produtos eletrônicos em geral',
  },
  joalheria: {
    id: 'joalheria',
    label: 'Joalheria',
    description: 'Jóias, gemas e adornos',
  },
} as const

export type SegmentId = keyof typeof SEGMENTS

export function isValidSegment(segment: string): segment is SegmentId {
  return segment in SEGMENTS
}

export function getSegmentLabel(segment: string): string {
  if (segment in SEGMENTS) {
    return SEGMENTS[segment as SegmentId].label
  }
  return segment
}

// Campos específicos por segmento
export const SEGMENT_FIELDS = {
  eletronica: [
    'sku',
    'name',
    'description',
    'color',
    'quantity',
    'priceUsd',
    'marginMin',
    'marginMax',
    'reorderLevel',
  ],
  joalheria: [
    'catalogCode',
    'jewelryCategory',
    'name',
    'mainMaterial',
    'baseMaterial',
    'heightCm',
    'lengthCm',
    'widthCm',
    'description',
    'conservationState',
    'identificationConfidence',
    'quantity',
    'priceUsd',
    'retailPriceUsd',
    'marginMin',
    'marginMax',
    'reorderLevel',
  ],
} as const

export type SegmentFields = typeof SEGMENT_FIELDS
