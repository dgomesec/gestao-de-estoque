/**
 * Seed de demonstração: cria o cliente "ACME Demo" (slug `acmedemo`) e popula
 * todas as áreas do sistema com dados fictícios (máx. 5 por área).
 *
 * Uso:
 *   node --env-file=.env.development.local scripts/seed-acmedemo.mjs
 *
 * Idempotente: remove dados anteriores do tenant `acmedemo` antes de inserir.
 * Usuários são criados via endpoint do Better Auth (hash de senha correto).
 *
 * Observação: as colunas `id` serial deste banco têm DEFAULT literal (sem
 * sequência real), então inserimos ids explícitos calculados como MAX(id)+1.
 */
import pg from 'pg'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const BASE = process.env.SEED_BASE_URL || 'http://localhost:3000'

const SLUG = 'acmedemo'
const NAME = 'ACME Demo'
const EXCHANGE_RATE = 5.4

// Contadores de id por tabela (preenchidos a partir de MAX(id)).
const idCounters = {}
async function initIds(tables) {
  for (const t of tables) {
    const r = await pool.query(`SELECT COALESCE(MAX(id), 0) AS m FROM ${t}`)
    idCounters[t] = Number(r.rows[0].m)
  }
}
function nextId(table) {
  idCounters[table] += 1
  return idCounters[table]
}

// --- Usuários (máx. 5) ------------------------------------------------------
const USERS = [
  { name: 'Administrador ACME', email: 'admin@acmedemo.com.br', password: 'AcmeDemo2026!', role: 'super_admin' },
  { name: 'Beatriz Gerente', email: 'gerente@acmedemo.com.br', password: 'AcmeDemo2026!', role: 'administrativo' },
  { name: 'Rafael Vendas', email: 'rafael@acmedemo.com.br', password: 'AcmeDemo2026!', role: 'vendas' },
  { name: 'Carla Vendas', email: 'carla@acmedemo.com.br', password: 'AcmeDemo2026!', role: 'vendas' },
  { name: 'Diego Estoque', email: 'estoque@acmedemo.com.br', password: 'AcmeDemo2026!', role: 'administrativo' },
]

// --- Produtos (máx. 5) ------------------------------------------------------
const PRODUCTS = [
  { sku: 'SMG-A55', name: 'Smartphone Galaxy A55 128GB', description: 'Smartphone Android, tela 6.6", 8GB RAM', color: 'Azul', colorHex: '#2563eb', quantity: 24, priceUsd: 220.0, marginMin: 18, marginMax: 30, reorderLevel: 8 },
  { sku: 'NB-INS15', name: 'Notebook Inspiron 15', description: 'Notebook Core i5, 16GB RAM, SSD 512GB', color: 'Prata', colorHex: '#9ca3af', quantity: 12, priceUsd: 540.0, marginMin: 15, marginMax: 25, reorderLevel: 4 },
  { sku: 'FN-JBL', name: 'Fone Bluetooth JBL Tune', description: 'Fone de ouvido sem fio com microfone', color: 'Preto', colorHex: '#111827', quantity: 60, priceUsd: 28.0, marginMin: 30, marginMax: 50, reorderLevel: 15 },
  { sku: 'TV-50-4K', name: 'Smart TV 50" 4K UHD', description: 'Televisor 4K com Google TV', color: 'Preto', colorHex: '#111827', quantity: 8, priceUsd: 410.0, marginMin: 12, marginMax: 22, reorderLevel: 3 },
  { sku: 'CRG-65W', name: 'Carregador USB-C 65W', description: 'Carregador rápido GaN com cabo', color: 'Branco', colorHex: '#f9fafb', quantity: 100, priceUsd: 15.0, marginMin: 40, marginMax: 60, reorderLevel: 20 },
]

// --- Clientes (máx. 5) ------------------------------------------------------
const CUSTOMERS = [
  { name: 'João da Silva', phone: '(11) 98888-1010', email: 'joao.silva@email.com', document: '123.456.789-00', addressLine: 'Rua das Flores, 120', city: 'São Paulo', state: 'SP', zipCode: '01010-000', notes: 'Cliente recorrente' },
  { name: 'Maria Oliveira', phone: '(21) 97777-2020', email: 'maria.oliveira@email.com', document: '987.654.321-00', addressLine: 'Av. Atlântica, 500', city: 'Rio de Janeiro', state: 'RJ', zipCode: '22010-000', notes: 'Prefere contato por WhatsApp' },
  { name: 'Tech Solutions LTDA', phone: '(31) 3322-4040', email: 'compras@techsolutions.com.br', document: '12.345.678/0001-90', addressLine: 'Rua da Bahia, 1500', city: 'Belo Horizonte', state: 'MG', zipCode: '30160-011', notes: 'Compra em volume - emitir NF' },
  { name: 'Carlos Pereira', phone: '(41) 99999-3030', email: 'carlos.pereira@email.com', document: '456.789.123-00', addressLine: 'Rua XV de Novembro, 80', city: 'Curitiba', state: 'PR', zipCode: '80020-310', notes: '' },
  { name: 'Mercado Bom Preço ME', phone: '(51) 3211-5050', email: 'financeiro@bompreco.com.br', document: '98.765.432/0001-10', addressLine: 'Av. Ipiranga, 2200', city: 'Porto Alegre', state: 'RS', zipCode: '90160-091', notes: 'Pagamento a prazo (30 dias)' },
]

// --- Metas mensais (máx. 5) -------------------------------------------------
const GOALS = [
  { month: '2026-02', revenueTargetBrl: 30000, profitTargetBrl: 6000 },
  { month: '2026-03', revenueTargetBrl: 32000, profitTargetBrl: 6500 },
  { month: '2026-04', revenueTargetBrl: 35000, profitTargetBrl: 7000 },
  { month: '2026-05', revenueTargetBrl: 38000, profitTargetBrl: 7600 },
  { month: '2026-06', revenueTargetBrl: 40000, profitTargetBrl: 8000 },
]

function money(n) {
  return Number(n).toFixed(2)
}

async function createAuthUser(u) {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ name: u.name, email: u.email, password: u.password }),
  })
  if (res.ok) {
    console.log(`[v0]   usuário criado: ${u.email}`)
    return
  }
  const txt = await res.text()
  if (txt.includes('already') || txt.includes('exist') || res.status === 422) {
    console.log(`[v0]   usuário já existia: ${u.email}`)
    return
  }
  throw new Error(`Falha ao criar ${u.email}: ${res.status} ${txt}`)
}

async function main() {
  console.log('[v0] Iniciando seed do cliente ACME Demo...')

  await initIds([
    'app_roles', 'role_permissions', 'user_roles', 'settings', 'products',
    'customers', 'stock_movements', 'sales', 'sales_goals', 'audit_logs',
  ])

  // 1) Remove dados anteriores do tenant (idempotência).
  const prior = await pool.query('SELECT id FROM tenants WHERE slug=$1', [SLUG])
  if (prior.rows[0]) {
    const tid = prior.rows[0].id
    console.log(`[v0] Tenant existente encontrado (${tid}); limpando dados anteriores...`)
    await pool.query('DELETE FROM stock_movements WHERE "tenantId"=$1', [tid])
    await pool.query('DELETE FROM sales WHERE "tenantId"=$1', [tid])
    await pool.query('DELETE FROM sales_goals WHERE "tenantId"=$1', [tid])
    await pool.query('DELETE FROM customers WHERE "tenantId"=$1', [tid])
    await pool.query('DELETE FROM products WHERE "tenantId"=$1', [tid])
    await pool.query('DELETE FROM settings WHERE "tenantId"=$1', [tid])
    await pool.query('DELETE FROM audit_logs WHERE "tenantId"=$1', [tid])
    await pool.query('DELETE FROM user_roles WHERE "tenantId"=$1', [tid])
    await pool.query(
      'DELETE FROM role_permissions WHERE "roleId" IN (SELECT id FROM app_roles WHERE "tenantId"=$1)',
      [tid],
    )
    await pool.query('DELETE FROM app_roles WHERE "tenantId"=$1', [tid])
    await pool.query('DELETE FROM "user" WHERE "tenantId"=$1', [tid])
    await pool.query('DELETE FROM tenants WHERE id=$1', [tid])
    // Recarrega contadores após as remoções.
    await initIds([
      'app_roles', 'role_permissions', 'user_roles', 'settings', 'products',
      'customers', 'stock_movements', 'sales', 'sales_goals', 'audit_logs',
    ])
  }

  // 2) Cria o tenant com branding próprio.
  const tenantId = crypto.randomUUID()
  await pool.query(
    `INSERT INTO tenants (id, slug, name, status, "brandName", "colorPrimary", "colorPrimaryForeground", "colorAccent", "colorAccentForeground")
     VALUES ($1,$2,$3,'active',$4,'#2563eb','#ffffff','#0ea5e9','#ffffff')`,
    [tenantId, SLUG, NAME, NAME],
  )
  console.log(`[v0] Tenant criado: ${NAME} (${SLUG}) -> ${tenantId}`)

  // 3) Papéis de sistema + permissões (espelha lib/tenant-provision.ts).
  const ROLE_TEMPLATE = [
    { name: 'super_admin', description: 'Acesso total ao sistema', isSuperAdmin: true, permissions: [] },
    {
      name: 'administrativo',
      description: 'Gestão completa da operação',
      isSuperAdmin: false,
      permissions: [
        'audit:view', 'customers:create', 'customers:delete', 'customers:update', 'customers:view',
        'products:create', 'products:delete', 'products:update', 'products:view',
        'reports:create', 'reports:update', 'reports:view', 'roles:view',
        'sales:create', 'sales:update', 'sales:view', 'settings:view',
        'stock:create', 'stock:update', 'stock:view', 'users:view',
      ],
    },
    {
      name: 'vendas',
      description: 'Operação de vendas e atendimento',
      isSuperAdmin: false,
      permissions: [
        'customers:create', 'customers:delete', 'customers:update', 'customers:view',
        'products:view', 'reports:view', 'sales:create', 'sales:view', 'stock:view',
      ],
    },
  ]
  const roleIdByName = {}
  for (const r of ROLE_TEMPLATE) {
    const roleId = nextId('app_roles')
    await pool.query(
      `INSERT INTO app_roles (id, "tenantId", name, description, "isSystem", "isSuperAdmin")
       VALUES ($1,$2,$3,$4,true,$5)`,
      [roleId, tenantId, r.name, r.description, r.isSuperAdmin],
    )
    roleIdByName[r.name] = roleId
    for (const p of r.permissions) {
      const [resource, action] = p.split(':')
      await pool.query(
        'INSERT INTO role_permissions (id, "roleId", resource, action) VALUES ($1,$2,$3,$4)',
        [nextId('role_permissions'), roleId, resource, action],
      )
    }
  }
  console.log('[v0] Papéis de sistema provisionados (super_admin, administrativo, vendas)')

  // 4) Configurações (câmbio + dados da loja).
  await pool.query(
    `INSERT INTO settings (id, "tenantId", "exchangeRate", "manualRate", "currencyProtectionPct", "rateSource", "storeName", "storeAddress", "storePhone", "storeEmail")
     VALUES ($1,$2,$3,true,2,'manual',$4,$5,$6,$7)`,
    [nextId('settings'), tenantId, money(EXCHANGE_RATE), 'ACME Demo Comércio de Eletrônicos', 'Av. Paulista, 1000 - São Paulo/SP', '(11) 4000-2000', 'contato@acmedemo.com.br'],
  )
  console.log('[v0] Configurações criadas (câmbio R$ 5,40 + dados da loja)')

  // 5) Usuários via Better Auth, depois vincula tenant + papel.
  console.log('[v0] Criando usuários...')
  for (const u of USERS) await createAuthUser(u)
  for (const u of USERS) {
    const found = await pool.query('SELECT id FROM "user" WHERE email=$1', [u.email.toLowerCase()])
    if (!found.rows[0]) throw new Error(`Usuário não encontrado após criação: ${u.email}`)
    const uid = found.rows[0].id
    await pool.query('UPDATE "user" SET "tenantId"=$1, "isPlatformAdmin"=false WHERE id=$2', [tenantId, uid])
    await pool.query(
      'INSERT INTO user_roles (id, "tenantId", "userId", "roleId") VALUES ($1,$2,$3,$4)',
      [nextId('user_roles'), tenantId, uid, roleIdByName[u.role]],
    )
  }
  const adminId = (await pool.query('SELECT id FROM "user" WHERE email=$1', [USERS[0].email])).rows[0].id
  console.log(`[v0] ${USERS.length} usuários vinculados ao tenant`)

  // 6) Produtos.
  const productIdBySku = {}
  for (const p of PRODUCTS) {
    const pid = nextId('products')
    await pool.query(
      `INSERT INTO products (id, "tenantId", sku, name, description, color, "colorHex", quantity, "priceUsd", "marginMin", "marginMax", "reorderLevel", "importSource", "createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual',$13)`,
      [pid, tenantId, p.sku, p.name, p.description, p.color, p.colorHex, p.quantity, money(p.priceUsd), money(p.marginMin), money(p.marginMax), p.reorderLevel, adminId],
    )
    productIdBySku[p.sku] = pid
  }
  console.log(`[v0] ${PRODUCTS.length} produtos criados`)

  // 7) Clientes.
  const customerIdByName = {}
  for (const c of CUSTOMERS) {
    const cid = nextId('customers')
    await pool.query(
      `INSERT INTO customers (id, "tenantId", name, phone, email, document, "addressLine", city, state, "zipCode", notes, "createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [cid, tenantId, c.name, c.phone, c.email, c.document, c.addressLine, c.city, c.state, c.zipCode, c.notes, adminId],
    )
    customerIdByName[c.name] = cid
  }
  console.log(`[v0] ${CUSTOMERS.length} clientes criados`)

  // 8) Movimentações de estoque (entradas/saídas).
  const MOVES = [
    { sku: 'SMG-A55', type: 'in', quantity: 30, note: 'Compra inicial de estoque', daysAgo: 25 },
    { sku: 'NB-INS15', type: 'in', quantity: 16, note: 'Reposição de fornecedor', daysAgo: 18 },
    { sku: 'FN-JBL', type: 'out', quantity: 6, note: 'Ajuste de inventário - avaria', daysAgo: 10 },
    { sku: 'CRG-65W', type: 'in', quantity: 120, note: 'Compra em volume', daysAgo: 7 },
    { sku: 'TV-50-4K', type: 'out', quantity: 2, note: 'Saída para demonstração em loja', daysAgo: 3 },
  ]
  for (const m of MOVES) {
    await pool.query(
      `INSERT INTO stock_movements (id, "tenantId", "productId", type, quantity, note, "createdBy", "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7, now() - ($8 || ' days')::interval)`,
      [nextId('stock_movements'), tenantId, productIdBySku[m.sku], m.type, m.quantity, m.note, adminId, String(m.daysAgo)],
    )
  }
  console.log(`[v0] ${MOVES.length} movimentações de estoque criadas`)

  // 9) Vendas finalizadas (com cálculo de lucro em BRL).
  const SALES = [
    { sku: 'SMG-A55', qty: 2, marginPct: 25, customer: 'João da Silva', soldBy: 'Rafael Vendas', daysAgo: 20 },
    { sku: 'NB-INS15', qty: 1, marginPct: 22, customer: 'Tech Solutions LTDA', soldBy: 'Carla Vendas', daysAgo: 14 },
    { sku: 'FN-JBL', qty: 5, marginPct: 40, customer: 'Maria Oliveira', soldBy: 'Rafael Vendas', daysAgo: 9 },
    { sku: 'TV-50-4K', qty: 1, marginPct: 20, customer: 'Carlos Pereira', soldBy: 'Carla Vendas', daysAgo: 5 },
    { sku: 'CRG-65W', qty: 10, marginPct: 50, customer: 'Mercado Bom Preço ME', soldBy: 'Rafael Vendas', daysAgo: 2 },
  ]
  const userNameToId = {}
  for (const u of USERS) {
    userNameToId[u.name] = (await pool.query('SELECT id FROM "user" WHERE email=$1', [u.email])).rows[0].id
  }
  for (const s of SALES) {
    const prod = PRODUCTS.find((p) => p.sku === s.sku)
    const unitCostUsd = prod.priceUsd
    const unitPriceUsd = unitCostUsd * (1 + s.marginPct / 100)
    const totalUsd = unitPriceUsd * s.qty
    const totalBrl = totalUsd * EXCHANGE_RATE
    const costBrl = unitCostUsd * s.qty * EXCHANGE_RATE
    const profitBrl = totalBrl - costBrl
    await pool.query(
      `INSERT INTO sales (id, "tenantId", "productId", quantity, kind, "unitPriceUsd", "unitCostUsd", "exchangeRate", "currencyProtectionPct", "marginPct", "totalUsd", "totalBrl", "profitBrl", customer, "customerId", "soldBy", "groupId", "createdAt")
       VALUES ($1,$2,$3,$4,'sale',$5,$6,$7,0,$8,$9,$10,$11,$12,$13,$14,$15, now() - ($16 || ' days')::interval)`,
      [
        nextId('sales'), tenantId, productIdBySku[s.sku], s.qty,
        money(unitPriceUsd), money(unitCostUsd), money(EXCHANGE_RATE), money(s.marginPct),
        money(totalUsd), money(totalBrl), money(profitBrl),
        s.customer, customerIdByName[s.customer], userNameToId[s.soldBy], crypto.randomUUID(), String(s.daysAgo),
      ],
    )
  }
  console.log(`[v0] ${SALES.length} vendas criadas`)

  // 10) Metas mensais.
  for (const g of GOALS) {
    await pool.query(
      `INSERT INTO sales_goals (id, "tenantId", month, "revenueTargetBrl", "profitTargetBrl", "createdBy")
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [nextId('sales_goals'), tenantId, g.month, money(g.revenueTargetBrl), money(g.profitTargetBrl), adminId],
    )
  }
  console.log(`[v0] ${GOALS.length} metas mensais criadas`)

  // 11) Logs de auditoria (amostra de atividade).
  // Recalcula o MAX(id) agora: a criação de usuários (Better Auth) gera logs de
  // login que avançam a tabela após o cálculo inicial dos contadores.
  await initIds(['audit_logs'])
  const admin = USERS[0]
  const AUDIT = [
    { action: 'login', resource: 'auth', summary: `${admin.name} efetuou login`, daysAgo: 1 },
    { action: 'create', resource: 'products', summary: 'Produto "Smartphone Galaxy A55 128GB" criado', daysAgo: 25 },
    { action: 'create', resource: 'sales', summary: 'Venda registrada para João da Silva', daysAgo: 20 },
    { action: 'update', resource: 'settings', summary: 'Cotação do dólar atualizada para R$ 5,40', daysAgo: 12 },
    { action: 'create', resource: 'users', summary: 'Usuário "Rafael Vendas" criado', daysAgo: 26 },
  ]
  for (const a of AUDIT) {
    await pool.query(
      `INSERT INTO audit_logs (id, "tenantId", "userId", "userName", "userEmail", action, resource, summary, browser, os, "createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Chrome','Windows', now() - ($9 || ' days')::interval)`,
      [nextId('audit_logs'), tenantId, adminId, admin.name, admin.email, a.action, a.resource, a.summary, String(a.daysAgo)],
    )
  }
  console.log(`[v0] ${AUDIT.length} registros de auditoria criados`)

  // 12) CRÍTICO: como inserimos linhas com IDs explícitos, precisamos avançar as
  // sequências serial até o MAX(id) de cada tabela. Sem isto, o próximo INSERT
  // feito pela aplicação (que omite o id) reutilizaria um id já existente e
  // falharia com "duplicate key" — quebrando criação de vendas, estoque, etc.
  const SEQ_TABLES = [
    'sales', 'products', 'customers', 'stock_movements', 'sales_goals',
    'app_roles', 'role_permissions', 'user_roles', 'audit_logs', 'settings',
  ]
  for (const t of SEQ_TABLES) {
    await pool.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), (SELECT GREATEST(COALESCE(MAX(id),0),1) FROM ${t}), true)
       WHERE pg_get_serial_sequence($1, 'id') IS NOT NULL`,
      [t],
    )
  }
  console.log('[v0] sequencias serial ressincronizadas')

  console.log('\n[v0] Seed concluido com sucesso!')
  console.log('[v0] Login de demonstracao: admin@acmedemo.com.br / AcmeDemo2026!')
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error('[v0] ERRO no seed:', err)
    pool.end()
    process.exit(1)
  })
