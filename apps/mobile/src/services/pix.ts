import type { PixIntent, BillingProfile, AdminPixIntent } from '@nacional/shared/types';
import { request } from './api';
export const pixApi = {
  profile: (token: string) => request<BillingProfile>('/payments/billing-profile', { token }),
  saveProfile: (token: string, document: string) => request<BillingProfile>('/payments/billing-profile', { token, method: 'PUT', body: { document } }),
  ticket: (token: string, ticketId: string) => request<PixIntent | null>(`/tickets/payment?ticketId=${encodeURIComponent(ticketId)}`, { token }),
  createTicket: (token: string, ticketId: string) => request<PixIntent>('/tickets/pix', { token, method: 'POST', body: { ticketId } }),
  createCash: (token: string, chargeId: string) => request<PixIntent>('/payments/pix', { token, method: 'POST', body: { chargeId } }),
  shop: (token: string, orderId: string) => request<PixIntent | null>(`/shop/payment?orderId=${encodeURIComponent(orderId)}`, { token }),
  createShop: (token: string, orderId: string) => request<PixIntent>('/shop/pix', { token, method: 'POST', body: { orderId } }),
  intent: (token: string, id: string) => request<PixIntent>(`/payments/intent?id=${encodeURIComponent(id)}`, { token }),
  adminList: (token: string, offset = 0) => request<AdminPixIntent[]>(`/admin/payments?limit=25&offset=${offset}`, { token }),
  reconcile: (token: string, id: string) => request('/admin/payments/reconcile', { token, method: 'POST', body: { id } }),
  refund: (token: string, id: string, reason: string) => request('/admin/payments/refund', { token, method: 'POST', body: { id, reason } }),
};
