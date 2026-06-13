// Definição central dos recursos e ações do RBAC.
// Usado tanto no servidor (verificação) quanto no cliente (UI de papéis).

export const RESOURCES = [
  { key: 'products', label: 'Produtos' },
  { key: 'stock', label: 'Estoque' },
  { key: 'sales', label: 'Vendas' },
  { key: 'customers', label: 'Clientes' },
  { key: 'reports', label: 'Relatórios' },
  { key: 'users', label: 'Usuários' },
  { key: 'roles', label: 'Papéis e Permissões' },
  { key: 'settings', label: 'Configurações' },
  { key: 'audit', label: 'Auditoria e Monitoramento' },
] as const

export const ACTIONS = [
  { key: 'view', label: 'Visualizar' },
  { key: 'create', label: 'Criar' },
  { key: 'update', label: 'Editar' },
  { key: 'delete', label: 'Excluir' },
] as const

export type ResourceKey = (typeof RESOURCES)[number]['key']
export type ActionKey = (typeof ACTIONS)[number]['key']

// Mapa rápido de rótulos por recurso (usado no painel master e em UIs).
export const RESOURCE_LABELS: Record<ResourceKey, string> = RESOURCES.reduce(
  (acc, r) => {
    acc[r.key] = r.label
    return acc
  },
  {} as Record<ResourceKey, string>,
)

export type Permission = `${ResourceKey}:${ActionKey}`

// Itens de navegação do painel e a permissão mínima (view) que os habilita.
export const NAV_ITEMS: {
  href: string
  label: string
  resource: ResourceKey
}[] = [
  { href: '/dashboard', label: 'Painel', resource: 'reports' },
  { href: '/produtos', label: 'Produtos', resource: 'products' },
  { href: '/estoque', label: 'Estoque', resource: 'stock' },
  { href: '/vendas', label: 'Vendas', resource: 'sales' },
  { href: '/clientes', label: 'Clientes', resource: 'customers' },
  { href: '/relatorios', label: 'Relatórios', resource: 'reports' },
  { href: '/usuarios', label: 'Usuários', resource: 'users' },
  { href: '/papeis', label: 'Papéis', resource: 'roles' },
  { href: '/configuracoes', label: 'Configurações', resource: 'settings' },
  { href: '/auditoria', label: 'Auditoria', resource: 'audit' },
]
