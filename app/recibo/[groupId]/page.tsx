import { notFound } from "next/navigation"
import { getOrderByGroupId } from "@/lib/orders"
import { ReceiptView } from "@/components/receipt-view"
import { PrintButton } from "@/components/print-button"

export const dynamic = "force-dynamic"

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params
  const order = await getOrderByGroupId(groupId)
  if (!order) notFound()

  return (
    <main className="min-h-screen bg-muted/40 py-8">
      <div className="mx-auto mb-4 flex max-w-2xl items-center justify-between px-4 print:hidden">
        <h1 className="text-sm font-medium text-muted-foreground">Recibo do pedido</h1>
        <PrintButton />
      </div>
      <div className="mx-auto max-w-2xl px-4">
        <div className="overflow-hidden rounded-lg border shadow-sm print:border-0 print:shadow-none">
          <ReceiptView order={order} />
        </div>
      </div>
    </main>
  )
}
