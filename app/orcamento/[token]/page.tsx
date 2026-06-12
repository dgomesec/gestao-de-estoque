import { notFound } from "next/navigation"
import { getOrderByToken } from "@/lib/orders"
import { ReceiptView } from "@/components/receipt-view"
import { PrintButton } from "@/components/print-button"
import { ApproveButton } from "./approve-button"

export const dynamic = "force-dynamic"

export default async function QuoteApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const order = await getOrderByToken(token)
  if (!order || order.kind !== "quote") notFound()

  return (
    <main className="min-h-screen bg-muted/40 py-8">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between px-4 print:hidden">
        <h1 className="text-sm font-medium text-muted-foreground">Seu orçamento</h1>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-2xl px-4">
        <div className="overflow-hidden rounded-lg border shadow-sm print:border-0 print:shadow-none">
          <ReceiptView order={order} />
        </div>

        <div className="mt-6 print:hidden">
          <ApproveButton token={token} initialApproved={order.approvedAt != null} />
        </div>
      </div>
    </main>
  )
}
