import { AppError } from './errors.js';
export const shopOrderInclude = { items: true, payment: true, paymentIntent: { select: { id: true, state: true, cancelRequestedAt: true, refundRequestedAt: true } } };
export const shopError = (code, message) => new AppError(409, code, message);
export async function reservedStock(tx, variantId, now, excludeOrderId) {
  const result = await tx.shopOrderItem.aggregate({ where: { variantId, order: { status: 'PENDING', expiresAt: { gt: now }, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) } }, _sum: { quantity: true } });
  return result._sum.quantity || 0;
}
export async function settleShopOrder(tx, order, { method, reference, actorId, amountCents, now }) {
  if (order.payment) {
    if (order.payment.reference === reference && order.payment.amountCents === amountCents && order.payment.method === method) return;
    throw shopError('SHOP_ALREADY_PAID', 'Este pedido já tem um pagamento registrado.');
  }
  const user = await tx.user.findUnique({ where: { id: order.userId } });
  if (!user?.active || order.status !== 'PENDING' || order.expiresAt <= now() || amountCents !== order.totalCents) throw shopError('SHOP_NOT_PAYABLE', 'O pedido não está disponível para pagamento.');
  const variants = [];
  for (const item of order.items) {
    const variant = await tx.productVariant.findUnique({ where: { id: item.variantId }, include: { product: true } });
    const reserved = await reservedStock(tx, item.variantId, now(), order.id);
    if (!variant?.active || !variant.product.active || variant.product.archivedAt || variant.stock - reserved < item.quantity) throw shopError('SHOP_OUT_OF_STOCK', 'O estoque deste pedido não está mais disponível.');
    variants.push({ item, variant });
  }
  if (order.expiresAt <= now()) throw shopError('SHOP_NOT_PAYABLE', 'A reserva venceu.');
  await tx.shopPayment.create({ data: { orderId: order.id, method, reference, amountCents, confirmedById: method === 'MANUAL' ? actorId : null, confirmedAt: now() } });
  for (const { item, variant } of variants) {
    const changed = await tx.productVariant.updateMany({ where: { id: variant.id, version: variant.version, stock: { gte: item.quantity } }, data: { stock: { decrement: item.quantity }, version: { increment: 1 } } });
    if (changed.count !== 1) throw shopError('SHOP_STOCK_CONFLICT', 'O estoque mudou. Tente novamente.');
    await tx.stockMovement.create({ data: { variantId: variant.id, orderId: order.id, actorId, requestKey: `SALE:${order.id}:${variant.id}`, kind: 'SALE', quantity: -item.quantity, balanceAfter: variant.stock - item.quantity, reason: 'Pagamento confirmado do pedido' } });
  }
  await tx.shopOrder.update({ where: { id: order.id }, data: { status: 'PAID', inventoryConsumedAt: now(), version: { increment: 1 } } });
  await tx.auditLog.create({ data: { actorId, action: 'SHOP_PAYMENT_CONFIRMED', entityId: order.id, details: { method, reference, amountCents } } });
}
export async function reverseShopOrder(tx, intent, refunded, now) {
  const order = await tx.shopOrder.findUnique({ where: { id: intent.shopOrderId }, include: shopOrderInclude });
  if (!order) return;
  if (!order.payment) {
    if (refunded === intent.amountCents && order.status === 'PENDING') {
      await tx.shopOrder.update({ where: { id: order.id }, data: { status: 'CANCELED', version: { increment: 1 } } });
      await tx.auditLog.create({ data: { actorId: order.userId, action: 'SHOP_UNISSUED_REFUNDED', entityId: order.id, details: { intentId: intent.id, refundedCents: refunded } } });
    }
    return;
  }
  if (order.payment.reference !== `ASAAS:${intent.providerReference}`) return;
  await applyShopRefund(tx, order, refunded, now, order.userId, { intentId: intent.id });
}
export async function applyShopRefund(tx, order, refunded, now, actorId, details = {}) {
  const full = refunded === order.totalCents;
  if (order.status === (full ? 'REFUNDED' : 'REFUND_REVIEW') && order.payment.refundedCents >= refunded) return;
  await tx.shopPayment.update({ where: { orderId: order.id }, data: { refundedCents: Math.max(order.payment.refundedCents, refunded) } });
  // Shipped goods return to stock only after physical receipt and an explicit adjustment.
  if (full && order.inventoryConsumedAt && !order.stockRestoredAt && !order.shippedAt && !order.deliveredAt) {
    for (const item of order.items) {
      const variant = await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity }, version: { increment: 1 } } });
      await tx.stockMovement.create({ data: { variantId: variant.id, orderId: order.id, actorId, requestKey: `REFUND:${order.id}:${variant.id}`, kind: 'RETURN', quantity: item.quantity, balanceAfter: variant.stock, reason: 'Estorno integral antes da entrega ou postagem' } });
    }
    await tx.shopOrder.update({ where: { id: order.id }, data: { stockRestoredAt: now() } });
  }
  await tx.shopOrder.update({ where: { id: order.id }, data: { status: full ? 'REFUNDED' : 'REFUND_REVIEW', version: { increment: 1 } } });
  await tx.auditLog.create({ data: { actorId, action: 'SHOP_REFUND_UPDATED', entityId: order.id, details: { ...details, refundedCents: refunded } } });
}
export function publicShopOrder(order, now = new Date(), admin = false) {
  const { requestKey, requestHash, paymentIntent, payment, items, shippingSnapshot, ...safe } = order;
  return { ...safe, ...(admin ? { shippingSnapshot } : {}), status: order.status === 'PENDING' && order.expiresAt <= now ? 'EXPIRED' : order.status, items: items.map(({ costCents, ...item }) => admin ? { ...item, costCents } : item), payment: payment ? { method: payment.method, amountCents: payment.amountCents, refundedCents: payment.refundedCents, confirmedAt: payment.confirmedAt } : null, intentId: paymentIntent?.id || null, serverTime: now.toISOString() };
}
