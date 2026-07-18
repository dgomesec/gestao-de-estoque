"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TwoFactorEnroll } from "@/components/two-factor-enroll"
import { toast } from "sonner"
import { ShieldCheck, ShieldAlert, ShieldX } from "lucide-react"

/**
 * Card de autosserviço para o usuário ativar/desativar o próprio 2FA na página
 * de Segurança. `required` indica que o admin tornou o 2FA obrigatório para a
 * conta (o botão de desativar fica oculto nesse caso).
 */
export function TwoFactorCard({
  enabled,
  required,
}: {
  enabled: boolean
  required: boolean
}) {
  const router = useRouter()
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await authClient.twoFactor.disable({ password })
    if (error) {
      setLoading(false)
      toast.error(error.message ?? "Senha incorreta ou falha ao desativar")
      return
    }
    setLoading(false)
    setDisableOpen(false)
    setPassword("")
    toast.success("Verificação de dois fatores desativada")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              Verificação em duas etapas (2FA)
            </CardTitle>
            <CardDescription className="text-pretty">
              Adicione uma camada extra de segurança usando um aplicativo autenticador como Google
              Authenticator ou Microsoft Authenticator.
            </CardDescription>
          </div>
          {enabled ? (
            <Badge className="gap-1 bg-chart-2 text-white hover:bg-chart-2">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Ativado
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <ShieldX className="size-3" aria-hidden="true" />
              Desativado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {required && !enabled && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-pretty">
              O administrador tornou o 2FA <strong>obrigatório</strong> para a sua conta. Configure
              agora para continuar acessando o sistema.
            </p>
          </div>
        )}

        {enabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Sua conta está protegida por verificação em duas etapas.
            </p>
            {!required && (
              <Button variant="outline" onClick={() => setDisableOpen(true)}>
                Desativar 2FA
              </Button>
            )}
          </div>
        ) : (
          <div>
            <Button onClick={() => setEnrollOpen(true)} className="gap-2">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Configurar 2FA
            </Button>
          </div>
        )}
      </CardContent>

      {/* Inscrição */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar verificação em duas etapas</DialogTitle>
            <DialogDescription>
              Siga os passos para vincular seu aplicativo autenticador.
            </DialogDescription>
          </DialogHeader>
          <TwoFactorEnroll
            onComplete={() => {
              setEnrollOpen(false)
              router.refresh()
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Desativar */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desativar 2FA</DialogTitle>
            <DialogDescription>Confirme sua senha para desativar a verificação em duas etapas.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDisable} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="disable-pass">Senha</Label>
              <Input
                id="disable-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDisableOpen(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={loading}>
                {loading ? "Desativando..." : "Desativar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
