import type { ShopOrder, ShopOrderStatus } from '@nacional/shared/shop';
export const shopStatus: Record<ShopOrderStatus, string> = { PENDING: 'Aguardando pagamento', EXPIRED: 'Reserva expirada', PAID: 'Pagamento confirmado', PREPARING: 'Em preparação', READY: 'Pronto para retirada', SHIPPED: 'Enviado', DELIVERED: 'Entregue', CANCELED: 'Cancelado', REFUNDED: 'Estornado', REFUND_REVIEW: 'Devolução em conferência' };
export function shopNextSteps(order: ShopOrder): ShopOrderStatus[] {
  if (order.payment?.refundedCents || !order.payment) return [];
  if (order.status === 'PAID') return order.deliveryMethod === 'PICKUP' ? ['PREPARING', 'READY'] : ['PREPARING'];
  if (order.status === 'PREPARING') return order.deliveryMethod === 'PICKUP' ? ['READY'] : ['SHIPPED'];
  if (order.status === 'READY' || order.status === 'SHIPPED') return ['DELIVERED'];
  return [];
}
export function safeShopUrl(value: string) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null; } catch { return null; } }
export const shopDate = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'short' });
