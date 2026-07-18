"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { ShieldCheck, KeyRound } from "lucide-react"

/**
 * Desafio de 2FA exibido no login quando a conta tem 2FA ativo. Aceita o código
 * de 6 dígitos do app autenticador ou, alternativamente, um código de backup.
 */
export function TwoFactorChallenge({
  brand,
}: {
  brand: { name: string; logoUrl: string | null }
}) {
  const router = useRouter()
  const [mode, setMode] = useState<"totp" | "backup">("totp")
  const [code, setCode] = useState("")
  const [backupCode, setBackupCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    if (mode === "totp") {
      const { error } = await authClient.twoFactor.verifyTotp({ code })
      if (error) {
        setLoading(false)
        setError(error.message ?? "Código inválido. Tente novamente.")
        return
      }
    } else {
      const { error } = await authClient.twoFactor.verifyBackupCode({ code: backupCode })
      if (error) {
        setLoading(false)
        setError(error.message ?? "Código de backup inválido.")
        return
      }
    }

    setLoading(false)
    router.push("/dashboard")
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
              <ShieldCheck className="size-6" aria-hidden="true" />
            </div>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-foreground text-balance">
            Verificação em duas etapas
          </h1>
          <p className="text-sm text-muted-foreground mt-1 text-pretty">
            {mode === "totp"
              ? "Digite o código de 6 dígitos do seu aplicativo autenticador"
              : "Digite um dos seus códigos de backup"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === "totp" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="challenge-code">Código</Label>
              <Input
                id="challenge-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="text-center text-lg tracking-[0.5em]"
                required
                autoFocus
              />
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="challenge-backup">Código de backup</Label>
              <Input
                id="challenge-backup"
                value={backupCode}
                onChange={(e) => setBackupCode(e.target.value.trim())}
                placeholder="xxxxxxxxxx"
                className="text-center font-mono"
                required
                autoFocus
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || (mode === "totp" ? code.length !== 6 : backupCode.length < 1)}
            className="w-full"
          >
            {loading ? "Verificando..." : "Verificar"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "totp" ? "backup" : "totp"))
            setError(null)
          }}
          className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <KeyRound className="size-3" aria-hidden="true" />
          {mode === "totp" ? "Usar um código de backup" : "Usar o aplicativo autenticador"}
        </button>
      </Card>
    </main>
  )
}
