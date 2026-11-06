export function toCharge(charge) {
  return {
    id: charge.id, tenant: { slug: charge.offer.tenant.slug, name: charge.offer.tenant.name },
    merchant: { name: charge.offer.merchant.name }, channel: charge.channel,
    status: charge.status === 'PENDING' && charge.expiresAt <= new Date() ? 'EXPIRED' : charge.status,
    amountCents: charge.grossCents, cashbackCents: charge.cashbackCents,
    merchantCents: charge.merchantCents, commissionCents: charge.commissionCents,
    gatewayFeeCents: charge.gatewayFeeCents, customerLinked: Boolean(charge.walletId),
    demo: charge.provider === 'demo', pixPayload: charge.provider === 'asaas' ? (charge.paymentIntent?.state === 'PENDING' && !charge.paymentIntent.cancelRequestedAt && !charge.paymentIntent.refundRequestedAt && charge.expiresAt > new Date() ? charge.paymentIntent.pixPayload : null) : charge.pixPayload,
    paymentIntentId: charge.paymentIntent?.id || null,
    saleCode: charge.claimCode, saleQr: `nacional://sale/${charge.claimCode}`,
    expiresAt: charge.expiresAt, createdAt: charge.createdAt, paidAt: charge.paidAt,
  };
}
export function toCashWallet({ wallet, tenant, entries, charges }) {
  return {
    tenant: { slug: tenant.slug, name: tenant.name }, customerCode: wallet.customerCode,
    availableCents: Math.max(0, wallet.balanceCents), debtCents: Math.max(0, -wallet.balanceCents),
    entries: entries.map((entry) => ({ id: entry.id, kind: entry.kind, amountCents: entry.amountCents, balanceAfterCents: entry.balanceAfterCents, merchant: entry.charge.offer.merchant.name, createdAt: entry.createdAt })),
    charges: charges.map(toCharge),
  };
}
