import { formatBRL, formatDateTime, formatSaleCode } from "@/lib/format"
import type { Order } from "@/lib/orders"

/**
 * Recibo simples e imprimível de um pedido (venda ou orçamento). Apresentacional:
 * recebe um `Order` já montado. Usado na página pública de recibo e como base
 * visual do orçamento enviado por e-mail. Todos os valores são exibidos em reais.
 */
export function ReceiptView({ order }: { order: Order }) {
  const isQuote = order.kind === "quote"
  const code = formatSaleCode(order.kind, order.id)
  const { store } = order

  return (
    <div className="mx-auto max-w-2xl bg-card text-card-foreground">
      <div className="border-b p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {store.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.logoUrl || "/placeholder.svg"}
                alt={`Logo ${store.name}`}
                className="h-14 w-auto max-w-[120px] object-contain"
                crossOrigin="anonymous"
              />
            )}
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{store.name}</h1>
              <p className="text-sm text-muted-foreground">{isQuote ? "Orçamento" : "Recibo de venda"}</p>
              <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                {store.address && <span>{store.address}</span>}
                {store.phone && <span>Tel.: {store.phone}</span>}
                {store.email && <span>{store.email}</span>}
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-sm font-medium">{code}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</p>
            {isQuote && order.approvedAt && (
              <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Aprovado em {formatDateTime(order.approvedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="border-b p-6">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cliente</h2>
        <p className="font-medium">{order.customer.name ?? "Cliente não identificado"}</p>
        <div className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
          {order.customer.document && <span>Documento: {order.customer.document}</span>}
          {order.customer.phone && <span>Telefone: {order.customer.phone}</span>}
          {order.customer.email && <span>E-mail: {order.customer.email}</span>}
        </div>
      </div>

      <div className="p-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Itens</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="pb-2 font-medium">Produto</th>
              <th className="pb-2 text-center font-medium">Qtd</th>
              <th className="pb-2 text-right font-medium">Unitário (R$)</th>
              <th className="pb-2 text-right font-medium">Total (R$)</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => {
              const unitBrl = item.quantity > 0 ? Number(item.totalBrl) / item.quantity : Number(item.totalBrl)
              return (
                <tr key={item.id} className="border-b border-border/50">
                  <td className="py-2">
                    <span className="font-medium">{item.productName ?? "Produto"}</span>
                    {item.sku && <span className="block text-xs text-muted-foreground">{item.sku}</span>}
                  </td>
                  <td className="py-2 text-center">{item.quantity}</td>
                  <td className="py-2 text-right text-muted-foreground">{formatBRL(unitBrl)}</td>
                  <td className="py-2 text-right font-medium">{formatBRL(Number(item.totalBrl))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-xs">
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Total a pagar
              </span>
              <span className="text-2xl font-bold text-primary">{formatBRL(order.totalBrl)}</span>
            </div>
          </div>
        </div>

        {isQuote && !order.approvedAt && (
          <p className="mt-6 rounded-md bg-muted p-3 text-center text-xs text-muted-foreground">
            Este é um orçamento. Os valores podem sofrer alteração até a confirmação do pedido.
          </p>
        )}
      </div>
    </div>
  )
}
