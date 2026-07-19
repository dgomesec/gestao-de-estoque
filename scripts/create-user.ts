import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { user as userTable, userRoles, appRoles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

async function createAdminUser() {
  const email = 'admin@belezadivinajoias.com.br'
  const password = 'BelezaDivina@2024'
  const name = 'Admin Beleza Divina'
  const tenantId = 'beleza-divina-joias-001'

  console.log('[v0] Criando usuário admin...')

  try {
    await auth.api.signUpEmail({
      body: { name, email, password },
    })
    
    const users = await db.select().from(userTable).where(eq(userTable.email, email))
    const newUser = users[0]
    
    if (!newUser) throw new Error('Usuário não foi criado')

    await db.update(userTable)
      .set({ tenantId })
      .where(eq(userTable.id, newUser.id))
    
    const adminRole = await db.select().from(appRoles)
      .where(eq(appRoles.name, 'admin'))
      .limit(1)
    
    if (adminRole.length > 0) {
      await db.insert(userRoles).values({
        userId: newUser.id,
        roleId: adminRole[0].id,
        tenantId,
      })
    }

    console.log('\n[v0] ========================================')
    console.log('[v0] ✓ USUÁRIO CRIADO COM SUCESSO!')
    console.log('[v0] ========================================')
    console.log(`[v0] Email: ${email}`)
    console.log(`[v0] Senha: ${password}`)
    console.log(`[v0] Tenant: Beleza Divina Joias`)
    console.log('[v0] ========================================\n')

    process.exit(0)
  } catch (err) {
    console.log('[v0] Erro:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

createAdminUser()
