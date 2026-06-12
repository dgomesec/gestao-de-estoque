import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { user as userTable } from '@/lib/db/schema'
import { count } from 'drizzle-orm'
import { AuthForm } from '@/components/auth-form'

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect('/dashboard')

  const [{ value: totalUsers }] = await db
    .select({ value: count() })
    .from(userTable)

  return <AuthForm needsBootstrap={Number(totalUsers) === 0} />
}
