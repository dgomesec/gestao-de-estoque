import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const sql = `
CREATE TABLE IF NOT EXISTS flows (
  id serial PRIMARY KEY, "tenantId" text NOT NULL, name text NOT NULL, description text,
  trigger text NOT NULL, enabled boolean NOT NULL DEFAULT true,
  conditions text NOT NULL DEFAULT '{}', actions text NOT NULL DEFAULT '[]',
  "createdBy" text NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS flows_tenant_idx ON flows ("tenantId", trigger);
CREATE TABLE IF NOT EXISTS flow_runs (
  id serial PRIMARY KEY, "tenantId" text NOT NULL, "flowId" integer NOT NULL, "flowName" text NOT NULL,
  trigger text NOT NULL, "groupId" text, status text NOT NULL, log text NOT NULL DEFAULT '[]',
  "createdAt" timestamp NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS flow_runs_tenant_idx ON flow_runs ("tenantId", "createdAt");
CREATE TABLE IF NOT EXISTS flow_tasks (
  id serial PRIMARY KEY, "tenantId" text NOT NULL, "flowId" integer, "groupId" text,
  title text NOT NULL, description text, status text NOT NULL DEFAULT 'open',
  "completedBy" text, "completedAt" timestamp, "createdAt" timestamp NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS document_templates (
  id serial PRIMARY KEY, "tenantId" text NOT NULL, name text NOT NULL, description text, spec text NOT NULL,
  "createdBy" text NOT NULL, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS generated_documents (
  id serial PRIMARY KEY, "tenantId" text NOT NULL, title text NOT NULL, "groupId" text,
  "templateId" integer, "flowId" integer, source text NOT NULL DEFAULT 'template', payload text NOT NULL,
  "createdBy" text, "createdAt" timestamp NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS generated_documents_tenant_idx ON generated_documents ("tenantId", "createdAt");
`
await pool.query(sql)
console.log('flows tables ok')
await pool.end()
