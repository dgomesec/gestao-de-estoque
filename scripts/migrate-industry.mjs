import pg from 'pg'
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
await pool.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS industry text`)
await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS "partyType" text`)
console.log('ok')
await pool.end()
