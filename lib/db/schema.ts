import { pgTable, text, timestamp, boolean, serial, integer, numeric, uniqueIndex } from "drizzle-orm/pg-core"

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
})

// --- RBAC -------------------------------------------------------------------
// Roles are shared business entities (not per-user). Access is gated by the
// permissions attached to the role(s) a user holds.

export const appRoles = pgTable("app_roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  // System roles (super_admin, administrativo, vendas) cannot be deleted.
  isSystem: boolean("isSystem").notNull().default(false),
  // super_admin bypasses all permission checks.
  isSuperAdmin: boolean("isSuperAdmin").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// One row per (role, resource, action) that is granted.
// resource: products | stock | sales | users | roles | reports | settings
// action:   view | create | update | delete
export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: serial("id").primaryKey(),
    roleId: integer("roleId").notNull(),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("role_perm_uniq").on(t.roleId, t.resource, t.action),
  }),
)

export const userRoles = pgTable(
  "user_roles",
  {
    id: serial("id").primaryKey(),
    userId: text("userId").notNull(),
    roleId: integer("roleId").notNull(),
  },
  (t) => ({
    uniq: uniqueIndex("user_role_uniq").on(t.userId, t.roleId),
  }),
)

// --- Inventory --------------------------------------------------------------

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  // Cor do produto. Para um único produto, o rótulo em português (ex.: "Azul").
  // Para variações, uma lista separada por vírgula (ex.: "Azul, Preto").
  color: text("color"),
  quantity: integer("quantity").notNull().default(0),
  // All monetary values entered in USD.
  priceUsd: numeric("priceUsd", { precision: 12, scale: 2 }).notNull(),
  // Profit margins as percentages (e.g. 15.00 = 15%).
  marginMin: numeric("marginMin", { precision: 6, scale: 2 }).notNull().default("0"),
  marginMax: numeric("marginMax", { precision: 6, scale: 2 }).notNull().default("0"),
  // Low-stock alert threshold.
  reorderLevel: integer("reorderLevel").notNull().default(5),
  // Origin of the record: "manual" | "batch" | "ai"
  importSource: text("importSource").notNull().default("manual"),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Generic stock entries/exits (purchases, restocks, adjustments, losses).
export const stockMovements = pgTable("stock_movements", {
  id: serial("id").primaryKey(),
  productId: integer("productId").notNull(),
  type: text("type").notNull(), // "in" | "out"
  quantity: integer("quantity").notNull(),
  note: text("note"),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// Sales generate an automatic stock exit and feed profit reports.
// A row can be either a finalized sale ("sale") or a quote/estimate ("quote").
// Quotes reserve stock until converted into a sale or cancelled.
export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  productId: integer("productId").notNull(),
  quantity: integer("quantity").notNull(),
  // "sale" = venda finalizada | "quote" = orçamento (reserva estoque)
  kind: text("kind").notNull().default("sale"),
  // Snapshot of pricing at sale time.
  unitPriceUsd: numeric("unitPriceUsd", { precision: 12, scale: 2 }).notNull(),
  unitCostUsd: numeric("unitCostUsd", { precision: 12, scale: 2 }).notNull(),
  exchangeRate: numeric("exchangeRate", { precision: 10, scale: 4 }).notNull(),
  currencyProtectionPct: numeric("currencyProtectionPct", { precision: 6, scale: 2 }).notNull().default("0"),
  // Margem praticada (%) informada manualmente pelo vendedor.
  marginPct: numeric("marginPct", { precision: 8, scale: 2 }).notNull().default("0"),
  totalUsd: numeric("totalUsd", { precision: 14, scale: 2 }).notNull(),
  totalBrl: numeric("totalBrl", { precision: 14, scale: 2 }).notNull(),
  profitBrl: numeric("profitBrl", { precision: 14, scale: 2 }).notNull(),
  // Texto livre (compatibilidade) e vínculo opcional com o cadastro de clientes.
  customer: text("customer"),
  customerId: integer("customerId"),
  soldBy: text("soldBy").notNull(),
  // Quando um orçamento foi convertido em venda.
  convertedAt: timestamp("convertedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})

// --- Clientes ---------------------------------------------------------------
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  document: text("document"), // CPF/CNPJ
  addressLine: text("addressLine"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zipCode"),
  notes: text("notes"),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// --- Metas mensais de vendas (globais) --------------------------------------
// Uma linha por mês (formato "YYYY-MM"). Acompanha receita e lucro.
export const salesGoals = pgTable("sales_goals", {
  id: serial("id").primaryKey(),
  month: text("month").notNull().unique(), // "2026-06"
  revenueTargetBrl: numeric("revenueTargetBrl", { precision: 14, scale: 2 }).notNull().default("0"),
  profitTargetBrl: numeric("profitTargetBrl", { precision: 14, scale: 2 }).notNull().default("0"),
  createdBy: text("createdBy").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
})

// Singleton settings row (id = 1).
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  // Current USD -> BRL exchange rate used for cost calculations.
  exchangeRate: numeric("exchangeRate", { precision: 10, scale: 4 }).notNull().default("5"),
  // When true, the rate is locked to a manual value (not auto-updated).
  manualRate: boolean("manualRate").notNull().default(false),
  // Additional percentage added to the final price for currency protection.
  currencyProtectionPct: numeric("currencyProtectionPct", { precision: 6, scale: 2 }).notNull().default("0"),
  rateUpdatedAt: timestamp("rateUpdatedAt").notNull().defaultNow(),
  // Source of the last successful auto rate ("awesomeapi" | "er-api" | "manual").
  rateSource: text("rateSource"),
  // Timestamp of the last *attempt* to refresh the rate (success or failure).
  rateCheckedAt: timestamp("rateCheckedAt"),
})

// --- Audit & monitoring -----------------------------------------------------
// Every meaningful action is recorded here: logins, and create/update/delete
// of products, users, roles, sales, stock and settings.
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  // Who performed the action (may be null for failed logins).
  userId: text("userId"),
  userName: text("userName"),
  userEmail: text("userEmail"),
  // What happened: "login" | "login_failed" | "logout" | "create" | "update" | "delete"
  action: text("action").notNull(),
  // Affected resource: "auth" | "products" | "users" | "roles" | "sales" | "stock" | "settings"
  resource: text("resource").notNull(),
  // Optional id of the affected record (as text to support text/serial pks).
  resourceId: text("resourceId"),
  // Human-friendly summary, e.g. 'Produto "iPhone 15" criado'.
  summary: text("summary"),
  // Arbitrary structured details (diffs, counts) as JSON string.
  metadata: text("metadata"),
  // Request origin.
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  browser: text("browser"),
  os: text("os"),
  country: text("country"),
  city: text("city"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
})
