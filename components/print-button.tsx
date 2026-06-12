"use client"

import { Button } from "@/components/ui/button"
import { Printer } from "lucide-react"

/** Botão que dispara a impressão da página (recibo). Client component. */
export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()} variant="outline" size="sm" className="gap-2 print:hidden">
      <Printer className="size-4" aria-hidden="true" />
      {label}
    </Button>
  )
}
