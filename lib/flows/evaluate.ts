import { FIELD_MAP, type ConditionNode, type ConditionRule } from "./types"

export type Facts = Record<string, string | number | boolean | string[] | null | undefined>

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase()
const splitList = (v: string) => v.split(",").map(norm).filter(Boolean)

function evalRule(rule: ConditionRule, facts: Facts): boolean {
  const def = FIELD_MAP[rule.field]
  if (!def) return false
  const raw = facts[rule.field]
  const val = rule.value ?? ""
  const op = rule.operator

  if (def.type === "boolean") {
    const actual = raw === true
    const expected = norm(val) === "true"
    if (op === "neq") return actual !== expected
    return actual === expected
  }

  if (def.type === "number") {
    const n = raw == null || raw === "" ? NaN : Number(raw)
    const x = Number(String(val).replace(",", "."))
    switch (op) {
      case "eq": return n === x
      case "neq": return n !== x
      case "gt": return n > x
      case "gte": return n >= x
      case "lt": return n < x
      case "lte": return n <= x
      case "between": {
        const [a, b] = String(val).split(",").map((p) => Number(p.trim().replace(",", ".")))
        return n >= Math.min(a, b) && n <= Math.max(a, b)
      }
      case "in": return splitList(val).includes(norm(n))
      case "not_in": return !splitList(val).includes(norm(n))
      case "is_empty": return Number.isNaN(n)
      case "is_not_empty": return !Number.isNaN(n)
      default: return false
    }
  }

  // text e list: lista = qualquer elemento satisfaz (negativos = nenhum elemento).
  const items = def.type === "list" ? (Array.isArray(raw) ? raw.map(norm) : []) : [norm(raw)]
  const v = norm(val)
  const any = (fn: (s: string) => boolean) => items.some(fn)
  switch (op) {
    case "eq": return any((s) => s === v)
    case "neq": return !any((s) => s === v)
    case "contains": return any((s) => s.includes(v))
    case "not_contains": return !any((s) => s.includes(v))
    case "starts_with": return any((s) => s.startsWith(v))
    case "ends_with": return any((s) => s.endsWith(v))
    case "in": { const l = splitList(val); return any((s) => l.includes(s)) }
    case "not_in": { const l = splitList(val); return !any((s) => l.includes(s)) }
    case "is_empty": return items.every((s) => s === "")
    case "is_not_empty": return items.some((s) => s !== "")
    default: return false
  }
}

/** Avalia a árvore de condições. Grupo vazio = sempre verdadeiro. */
export function evaluate(node: ConditionNode | null | undefined, facts: Facts): boolean {
  if (!node) return true
  if (node.type === "rule") return evalRule(node, facts)
  if (node.children.length === 0) return true
  const results = node.children.map((c) => evaluate(c, facts))
  const r = node.op === "AND" ? results.every(Boolean) : results.some(Boolean)
  return node.negate ? !r : r
}
