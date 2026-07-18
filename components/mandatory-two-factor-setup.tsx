"use client"

import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TwoFactorEnroll } from "@/components/two-factor-enroll"
import { ShieldAlert, LogOut } from "lucide-react"

/**
 * Configuração obrigatória do 2FA no primeiro acesso após o admin exigir. O
 * usuário só chega ao sistema depois de concluir a inscrição do autenticador.
 */
export function MandatoryTwoFactorSetup({
  brand,
}: {
  brand: { name: string; logoUrl: string | null }
}) {
  const router = useRouter()

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <main className="min-h-svh bg-background flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6 flex flex-col items-center text-center">
          {brand.logoUrl ? (
            <img
              src={brand.logoUrl || "/placeholder.svg"}
              alt={brand.name}
              className="mb-3 size-12 rounded-xl object-contain"
            />
          ) : null}
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-destructive/10">
            <ShieldAlert className="size-6 text-destructive" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance">
            Configuração de segurança obrigatória
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-pretty">
            O administrador exige verificação em duas etapas para a sua conta. Configure um
            aplicativo autenticador para continuar.
          </p>
        </div>

        <TwoFactorEnroll
          onComplete={() => {
            router.push("/dashboard")
            router.refresh()
          }}
        />

        <button
          type="button"
          onClick={handleSignOut}
          className="mt-6 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-3" aria-hidden="true" />
          Sair
        </button>
      </Card>
    </main>
  )
}
