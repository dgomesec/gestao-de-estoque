'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { assignInitialRole } from '@/app/actions/bootstrap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Package } from 'lucide-react'

export function AuthForm({
  needsBootstrap,
  brand,
}: {
  needsBootstrap: boolean
  brand: { name: string; logoUrl: string | null }
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Quando não há nenhum usuário, mostramos o cadastro do super admin.
  const isSignUp = needsBootstrap

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (isSignUp) {
      const { data, error } = await authClient.signUp.email({
        email,
        password,
        name,
      })
      if (error) {
        setLoading(false)
        setError(error.message ?? 'Falha ao criar conta')
        return
      }
      // Atribui papel super_admin ao primeiro usuário.
      if (data?.user?.id) {
        try {
          await assignInitialRole(data.user.id)
        } catch {
          // segue mesmo assim; admin pode ajustar depois
        }
      }
    } else {
      const { data, error } = await authClient.signIn.email({ email, password })
      if (error) {
        setLoading(false)
        setError(error.message ?? 'E-mail ou senha inválidos')
        return
      }
      // Conta com 2FA ativo: o login não cria sessão ainda; o cliente redireciona
      // para /two-factor via onTwoFactorRedirect. Evitamos navegar ao dashboard.
      if ((data as { twoFactorRedirect?: boolean })?.twoFactorRedirect) {
        return
      }
    }

    setLoading(false)
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="min-h-svh bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center text-center">
          {brand.logoUrl ? (
            <img
              src={brand.logoUrl || "/placeholder.svg"}
              alt={brand.name}
              className="mb-3 size-12 rounded-xl object-contain"
            />
          ) : (
            <div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Package className="size-6" aria-hidden="true" />
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground text-balance">
            {brand.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-pretty">
            {isSignUp
              ? 'Crie a conta do administrador principal para começar'
              : 'Acesse sua conta para gerenciar estoque e vendas'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignUp && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nome completo</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading
              ? 'Aguarde...'
              : isSignUp
                ? 'Criar conta de administrador'
                : 'Entrar'}
          </Button>
        </form>

        {!isSignUp && (
          <p className="text-xs text-muted-foreground text-center mt-6 text-pretty">
            Novos acessos são criados pelo administrador no painel de usuários.
          </p>
        )}
      </Card>
    </main>
  )
}
