"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Loader2 } from "lucide-react"
import { approveQuoteByToken } from "@/app/actions/sales"

/**
 * Botão público de aprovação de orçamento. Chama a action por token (sem login)
 * e reflete o estado aprovado. Quando já aprovado na carga inicial, entra com
 * `initialApproved`.
 */
export function ApproveButton({
  token,
  initialApproved,
}: {
  token: string
  initialApproved: boolean
}) {
  const [approved, setApproved] = useState(initialApproved)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleApprove() {
    setError(null)
    startTransition(async () => {
      const res = await approveQuoteByToken(token)
      if (res.ok) setApproved(true)
      else setError(res.error)
    })
  }

  if (approved) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-6 text-center">
        <CheckCircle2 className="size-8 text-primary" aria-hidden="true" />
        <p className="font-semibold text-primary">Orçamento aprovado!</p>
        <p className="text-sm text-muted-foreground">
          Recebemos sua aprovação. Em breve entraremos em contato para dar sequência ao atendimento.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button size="lg" onClick={handleApprove} disabled={pending} className="w-full gap-2 sm:w-auto">
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        )}
        Aprovar orçamento
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Ao aprovar, você confirma os itens e o valor total acima.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
