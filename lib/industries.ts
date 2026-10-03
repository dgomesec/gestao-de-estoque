export const INDUSTRIES = [
  { id: "aquarismo", label: "Aquarismo, pesca ou peixes ornamentais" },
  { id: "eletronica", label: "Eletrônica e tecnologia" },
  { id: "joalheria", label: "Joalheria e semijoias" },
  { id: "varejo", label: "Varejo em geral" },
  { id: "atacado", label: "Atacado e distribuição" },
  { id: "alimentos", label: "Alimentos e bebidas" },
  { id: "moda", label: "Moda e vestuário" },
  { id: "servicos", label: "Serviços" },
  { id: "outros", label: "Outros" },
] as const

export type IndustryId = (typeof INDUSTRIES)[number]["id"]

export function isValidIndustry(value: string): value is IndustryId {
  return INDUSTRIES.some((i) => i.id === value)
}

export function isAquariumIndustry(industry: string | null | undefined): boolean {
  return industry === "aquarismo"
}

export const PARTY_TYPES = [
  { id: "cliente", label: "Cliente" },
  { id: "fornecedor", label: "Fornecedor" },
  { id: "pescador", label: "Pescador" },
] as const

export type PartyType = (typeof PARTY_TYPES)[number]["id"]

export function isValidPartyType(value: string): value is PartyType {
  return PARTY_TYPES.some((p) => p.id === value)
}

export function partyTypeLabel(value: string | null | undefined): string {
  return PARTY_TYPES.find((p) => p.id === value)?.label ?? "Cliente"
}
