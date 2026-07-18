import pg from 'pg'
const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const cols = await pool.query(`SELECT table_name, column_name FROM information_schema.columns WHERE column_name ILIKE '%email%' ORDER BY table_name`)
console.log('[v0] colunas email:', JSON.stringify(cols.rows))
const u = await pool.query(`SELECT id, email FROM "user" WHERE email = $1`, ['admin@rafamotos.com.br'])
console.log('[v0] user rafamotos:', JSON.stringify(u.rows))
const acc = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_name IN ('account','session','user')`)
console.log('[v0] tabelas auth:', JSON.stringify(acc.rows))
await pool.end()
