import type { Match, Sector, Member, AdminOverview, AdminTicket, AdminSaleQuote, ClubPlan, AuditEvent, Ticket, TicketReview, AdmissionResult } from '@nacional/shared/types';
import { request } from './api';
const encodedQuery = (values: Record<string, string>) => Object.entries(values).filter(([, value]) => value).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
export interface MatchInput { homeTeam: string; awayTeam: string; startsAt: string; stadium: string; competition: string; isHome: boolean; published: boolean; salesEnabled: boolean; salesOpenAt?: string | null; salesCloseAt?: string | null; entryEnabled?: boolean; gateOpenAt?: string | null; gateCloseAt?: string | null }
export interface SaleReviewInput { ticketId: string; revision: string; sectorId: string; quantity: number }
export const adminApi = {
  overview: (token: string) => request<AdminOverview>('/admin/overview', { token }),
  matches: (token: string) => request<Match[]>('/admin/matches?limit=100', { token }),
  createMatch: (token: string, body: MatchInput) => request<Match>('/admin/matches', { token, method: 'POST', body }),
  updateMatch: (token: string, body: Partial<MatchInput> & { id: string }) => request<Match>('/admin/matches', { token, method: 'PATCH', body }),
  createSector: (token: string, body: { matchId: string; name: string; capacity: number; priceCents: number; salesEnabled: boolean }) => request<Sector>('/admin/sectors', { token, method: 'POST', body }),
  updateSector: (token: string, body: { id: string; name: string; capacity: number; priceCents: number; salesEnabled: boolean }) => request<Sector>('/admin/sectors', { token, method: 'PATCH', body }),
  tickets: (token: string, filters: Record<string, string> = {}) => request<AdminTicket[]>(`/admin/tickets?limit=100&${encodedQuery(filters)}`, { token }),
  quoteSale: (token: string, body: SaleReviewInput) => request<AdminSaleQuote>('/admin/tickets/quote', { token, method: 'POST', body }),
  updateSale: (token: string, body: SaleReviewInput & { expectedTotalCents: number; reason: string }) => request<AdminTicket>('/admin/tickets', { token, method: 'PATCH', body }),
  deleteSale: (token: string, body: { ticketId: string; revision: string; reason: string }) => request<{ ticketId: string; deleted: true }>('/admin/tickets', { token, method: 'DELETE', body }),
  users: (token: string, search = '') => request<Member[]>(`/admin/users?limit=100&search=${encodeURIComponent(search)}`, { token }),
  plans: (token: string) => request<ClubPlan[]>('/admin/plans', { token }),
  createPlan: (token: string, body: { name: string; priceCents: number; discountPercent: number }) => request<ClubPlan>('/admin/plans', { token, method: 'POST', body }),
  updatePlan: (token: string, body: ClubPlan) => request<ClubPlan>('/admin/plans', { token, method: 'PATCH', body }),
  membership: (token: string, body: { userId: string; planId: string; status: 'ACTIVE' | 'PENDING' | 'EXPIRED'; validUntil: string }) => request<Member>('/admin/memberships', { token, method: 'PUT', body }),
  account: (token: string, userId: string, active: boolean) => request('/admin/users/status', { token, method: 'PATCH', body: { userId, active } }),
  confirm: (token: string, ticketId: string, receivedCents: number, reference: string) => request<Ticket>('/admin/tickets/confirm-payment', { token, method: 'POST', body: { ticketId, receivedCents, reference, paymentVerified: true } }),
  cancel: (token: string, ticketId: string) => request<Ticket>('/admin/tickets/cancel', { token, method: 'POST', body: { ticketId } }),
  inspect: (token: string, entryToken: string, matchId: string, sectorId: string) => request<TicketReview>('/admin/tickets/inspect', { token, method: 'POST', body: { token: entryToken, matchId, sectorId } }),
  admit: (token: string, entryToken: string, matchId: string, sectorId: string, quantity: number, requestKey: string) => request<AdmissionResult>('/admin/tickets/admit', { token, method: 'POST', body: { token: entryToken, matchId, sectorId, quantity, requestKey } }),
  admissionReceipt: (token: string, ticketId: string, matchId: string, sectorId: string, requestKey: string) => request<AdmissionResult>(`/admin/tickets/admission-receipt?${encodedQuery({ ticketId, matchId, sectorId, requestKey })}`, { token }),
  audit: (token: string) => request<AuditEvent[]>('/admin/audit?limit=100', { token }),
};
