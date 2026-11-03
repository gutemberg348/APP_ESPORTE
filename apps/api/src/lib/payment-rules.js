import { AppError } from './errors.js';

export const MAX_PAYMENT_CENTS = 100000000;
export function splitPayment(grossCents, cashbackBps, commissionBps, gatewayFeeCents = 0) {
  const validRate = (rate) => Number.isInteger(rate) && rate >= 0 && rate <= 10000;
  if (!Number.isSafeInteger(grossCents) || grossCents < 1 || grossCents > MAX_PAYMENT_CENTS || !validRate(cashbackBps) || !validRate(commissionBps) || cashbackBps + commissionBps > 10000 || !Number.isSafeInteger(gatewayFeeCents) || gatewayFeeCents < 0) {
    throw new AppError(422, 'INVALID_SPLIT', 'Valor ou condições de divisão inválidos.');
  }
  const cashbackCents = Math.round(grossCents * cashbackBps / 10000);
  const commissionCents = Math.round(grossCents * commissionBps / 10000);
  const merchantCents = grossCents - cashbackCents - commissionCents - gatewayFeeCents;
  if (merchantCents < 0) throw new AppError(422, 'INVALID_SPLIT', 'A divisão supera o valor disponível da cobrança.');
  return { grossCents, merchantCents, cashbackCents, commissionCents, gatewayFeeCents };
}

// Refund wins over late paid events. An expired QR is never claimable.
export function paymentTransition(status, event) {
  if (event === 'REFUNDED') return status === 'REFUNDED' ? status : 'REFUNDED';
  if (event === 'SETTLED' && status === 'PENDING') return 'PAID';
  return status;
}
export function assertClaimable(charge, walletId, now = new Date()) {
  if (charge.status !== 'PENDING' || charge.expiresAt <= now) throw new AppError(409, 'SALE_CLOSED', 'Esta venda não está disponível para vinculação.');
  if (charge.walletId && charge.walletId !== walletId) throw new AppError(409, 'SALE_CLAIMED', 'Esta venda já foi vinculada a outro torcedor.');
}
export function assertSettlement(charge, event) {
  for (const field of ['grossCents', 'merchantCents', 'cashbackCents', 'commissionCents', 'gatewayFeeCents']) {
    if (event[field] !== charge[field]) throw new AppError(409, 'SETTLEMENT_MISMATCH', 'O valor ou a divisão confirmada diverge da cobrança.');
  }
  if (event.currency !== 'BRL') throw new AppError(409, 'SETTLEMENT_MISMATCH', 'Moeda inválida para a cobrança.');
  if (event.type === 'SETTLED' && event.occurredAt > charge.expiresAt) throw new AppError(409, 'LATE_PAYMENT_REVIEW', 'Pagamento após a validade exige conciliação do gateway.');
}
