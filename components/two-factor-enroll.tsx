"use client"

import { useState } from "react"
import QRCode from "qrcode"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Check, Copy, ShieldCheck, Smartphone } from "lucide-react"

type Step = "password" | "scan" | "backup"

/**
 * Fluxo de inscrição do 2FA (TOTP) por autosserviço.
 * 1) Usuário confirma a senha -> plugin gera o segredo e a URI otpauth.
 * 2) Lê o QR code no Google/Microsoft Authenticator e digita o código de 6 dígitos.
 * 3) Exibe os códigos de backup e conclui.
 *
 * `onComplete` é chamado ao finalizar (usado para redirecionar quando o 2FA é obrigatório).
 */
export function TwoFactorEnroll({ onComplete }: { onComplete?: () => void }) {
  const [step, setStep] = useState<Step>("password")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  function extractSecret(uri: string): string | null {
    try {
      const url = new URL(uri)
      return url.searchParams.get("secret")
    } catch {
      return null
    }
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await authClient.twoFactor.enable({ password })
    if (error || !data) {
      setLoading(false)
      toast.error(error?.message ?? "Senha incorreta ou falha ao iniciar o 2FA")
      return
    }
    try {
      const dataUrl = await QRCode.toDataURL(data.totpURI, { width: 220, margin: 1 })
      setQrDataUrl(dataUrl)
    } catch {
      // Se falhar o QR, ainda mostramos o segredo manual.
    }
    setSecret(extractSecret(data.totpURI))
    setBackupCodes(data.backupCodes ?? [])
    setStep("scan")
    setLoading(false)
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await authClient.twoFactor.verifyTotp({ code })
    if (error) {
      setLoading(false)
      toast.error(error.message ?? "Código inválido. Tente novamente.")
      return
    }
    setLoading(false)
    setStep("backup")
    toast.success("Verificação de dois fatores ativada")
  }

  function copyBackup() {
    navigator.clipboard.writeText(backupCodes.join("\n"))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (step === "password") {
    return (
      <form onSubmit={handleEnable} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="tf-password">Confirme sua senha</Label>
          <Input
            id="tf-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="Sua senha atual"
          />
          <p className="text-xs text-muted-foreground text-pretty">
            Por segurança, confirme sua senha para gerar a chave do aplicativo autenticador.
          </p>
        </div>
        <Button type="submit" disabled={loading || password.length < 1} className="gap-2">
          <ShieldCheck className="size-4" aria-hidden="true" />
          {loading ? "Gerando..." : "Iniciar configuração"}
        </Button>
      </form>
    )
  }

  if (step === "scan") {
    return (
      <form onSubmit={handleVerify} className="flex flex-col gap-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="flex items-start gap-2 text-sm text-foreground">
            <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="text-pretty">
              Abra o Google Authenticator ou Microsoft Authenticator e escaneie o QR code abaixo.
            </p>
          </div>
          {qrDataUrl && (
            <div className="mt-4 flex justify-center">
              <img
                src={qrDataUrl || "/placeholder.svg"}
                alt="QR code para configurar o aplicativo autenticador"
                className="size-52 rounded-md border bg-background p-2"
              />
            </div>
          )}
          {secret && (
            <div className="mt-3">
              <p className="text-xs text-muted-foreground">Ou digite a chave manualmente:</p>
              <code className="mt-1 block break-all rounded bg-background px-2 py-1 text-xs font-mono">
                {secret}
              </code>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="tf-code">Código de 6 dígitos</Label>
          <Input
            id="tf-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="text-center text-lg tracking-[0.5em]"
            required
          />
        </div>
        <Button type="submit" disabled={loading || code.length !== 6}>
          {loading ? "Verificando..." : "Verificar e ativar"}
        </Button>
      </form>
    )
  }

  // step === "backup"
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-chart-2/40 bg-chart-2/10 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="size-4 text-chart-2" aria-hidden="true" />
          Dois fatores ativado com sucesso
        </div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">
          Guarde os códigos de backup abaixo em local seguro. Cada um pode ser usado uma vez caso
          você perca o acesso ao aplicativo autenticador.
        </p>
      </div>

      {backupCodes.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3">
            {backupCodes.map((c) => (
              <code key={c} className="rounded bg-background px-2 py-1 text-center text-sm font-mono">
                {c}
              </code>
            ))}
          </div>
          <Button variant="outline" onClick={copyBackup} className="gap-2 bg-transparent">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copiado" : "Copiar códigos de backup"}
          </Button>
        </>
      )}

      <Button onClick={() => onComplete?.()}>Concluir</Button>
    </div>
  )
}
