'use server'

import { Resend } from 'resend'
import { requirePermission } from '@/lib/rbac'
import { getOrderByGroupId, getBaseUrl, type Order } from '@/lib/orders'
import { formatBRL, formatUSD, formatDateTime } from '@/lib/format'
import { logAudit } from '@/lib/audit'

// Remetente: usa um domínio verificado no Resend se configurado, senão o
// sandbox oficial (onboarding@resend.dev), que funciona para testes.
const FROM = process.env.RESEND_FROM_EMAIL || 'Gestão de Estoque <onboarding@resend.dev>'

/**
 * Envia por e-mail o recibo (venda) ou o orçamento (com link de aprovação) ao
 * cliente. Usa Resend. Requer permissão de visualização de vendas.
 */
export async function sendOrderEmail(groupId: string) {
  await requirePermission('sales', 'view')

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false as const, error: 'Envio de e-mail não configurado (RESEND_API_KEY ausente).' }
  }

  const order = await getOrderByGroupId(groupId)
  if (!order) return { ok: false as const, error: 'Pedido não encontrado.' }
  if (!order.customer.email) {
    return { ok: false as const, error: 'O cliente não possui e-mail cadastrado.' }
  }

  const isQuote = order.kind === 'quote'
  const base = getBaseUrl()
  const approvalUrl = order.approvalToken ? `${base}/orcamento/${order.approvalToken}` : null
  const receiptUrl = `${base}/recibo/${order.groupId}`

  const subject = isQuote
    ? `Seu orçamento - ${order.storeName}`
    : `Seu recibo de compra - ${order.storeName}`

  const html = buildHtml(order, { isQuote, approvalUrl, receiptUrl })

  const resend = new Resend(apiKey)
  const { error } = await resend.emails.send({
    from: FROM,
    to: order.customer.email,
    subject,
    html,
  })

  if (error) {
    return { ok: false as const, error: error.message || 'Falha ao enviar e-mail.' }
  }

  await logAudit({
    action: 'update',
    resource: 'sales',
    summary: `${isQuote ? 'Orçamento' : 'Recibo'} enviado por e-mail para ${order.customer.email}`,
    metadata: { groupId, email: order.customer.email },
  })

  return { ok: true as const, email: order.customer.email }
}

function buildHtml(
  order: Order,
  opts: { isQuote: boolean; approvalUrl: string | null; receiptUrl: string },
): string {
  const { isQuote, approvalUrl, receiptUrl } = opts
  const rows = order.items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">
          <strong>${escapeHtml(it.productName ?? 'Produto')}</strong>
          ${it.sku ? `<br/><span style="color:#888;font-size:12px;">${escapeHtml(it.sku)}</span>` : ''}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">${it.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;color:#666;">${formatUSD(Number(it.unitPriceUsd))}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;"><strong>${formatBRL(Number(it.totalBrl))}</strong></td>
      </tr>`,
    )
    .join('')

  const approveBlock =
    isQuote && approvalUrl
      ? `
      <div style="text-align:center;margin:28px 0;">
        <a href="${approvalUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:16px;">
          Aprovar orçamento com um clique
        </a>
        <p style="color:#888;font-size:12px;margin-top:8px;">Ou copie este link: ${approvalUrl}</p>
      </div>`
      : ''

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;">
    <div style="padding:24px 0;border-bottom:2px solid #111;">
      <h1 style="margin:0;font-size:20px;">${escapeHtml(order.storeName)}</h1>
      <p style="margin:4px 0 0;color:#666;font-size:14px;">${isQuote ? 'Orçamento' : 'Recibo de venda'} · ${formatDateTime(order.createdAt)}</p>
    </div>

    <p style="margin:20px 0 4px;">Olá, <strong>${escapeHtml(order.customer.name ?? 'cliente')}</strong>!</p>
    <p style="margin:0 0 16px;color:#444;">
      ${
        isQuote
          ? 'Preparamos o orçamento abaixo para você. Confira os itens e o valor total. Se estiver tudo certo, basta aprovar com um clique.'
          : 'Obrigado pela sua compra! Segue abaixo o recibo do seu pedido.'
      }
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="text-align:left;color:#888;">
          <th style="padding:8px 0;border-bottom:1px solid #ddd;">Produto</th>
          <th style="padding:8px 0;border-bottom:1px solid #ddd;text-align:center;">Qtd</th>
          <th style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right;">Unitário</th>
          <th style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="text-align:right;margin-top:16px;">
      <span style="color:#666;font-size:13px;">Total a pagar</span><br/>
      <span style="font-size:26px;font-weight:700;color:#16a34a;">${formatBRL(order.totalBrl)}</span>
    </div>

    ${approveBlock}

    <p style="margin:24px 0 0;font-size:12px;color:#888;text-align:center;">
      <a href="${receiptUrl}" style="color:#888;">Ver versão completa</a>
    </p>
  </div>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
