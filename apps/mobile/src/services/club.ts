import type { Member, Dashboard, Match, Ticket, TicketQuote, CardToken, Preferences, Redemption, TicketQr } from '@nacional/shared/types';
import { request } from './api';
export const clubApi = {
  dashboard: (token: string) => request<Dashboard>('/dashboard', { token }),
  card: (token: string) => request<CardToken>('/me/card-token', { token }),
  update: (token: string, name: string, city?: string, contact?: string) => request<Member>('/me', { token, method: 'PATCH', body: { name, city, contact } }),
  preferences: (token: string, body: Preferences) => request<Member>('/me/preferences', { token, method: 'PATCH', body }),
  school: (token: string, interested: boolean) => request<Member>('/me/school-interest', { token, method: 'PUT', body: { interested } }),
  checkIn: (token: string) => request('/check-ins', { token, method: 'POST' }),
  redeem: (token: string, rewardId: string) => request<Redemption>('/redemptions', { token, method: 'POST', body: { rewardId } }),
  matches: () => request<Match[]>('/matches'),
  tickets: (token: string) => request<Ticket[]>('/tickets', { token }),
  quoteTicket: (token: string, matchId: string, sectorId: string, quantity: number) => request<TicketQuote>('/tickets/quote', { token, method: 'POST', body: { matchId, sectorId, quantity } }),
  ticket: (token: string, matchId: string, sectorId: string, quantity: number, expectedTotalCents?: number) => request<Ticket>('/tickets', { token, method: 'POST', body: { matchId, sectorId, quantity, ...(expectedTotalCents !== undefined ? { expectedTotalCents } : {}) } }),
  cancelTicket: (token: string, ticketId: string) => request<Ticket>('/tickets/cancel', { token, method: 'POST', body: { ticketId } }),
  ticketQr: (token: string, ticketId: string) => request<TicketQr>(`/tickets/entry-qr?ticketId=${encodeURIComponent(ticketId)}`, { token }),
  ticketInstructions: (token: string) => request<{ instructions: string }>('/tickets/payment-instructions', { token }),
  predict: (token: string, matchId: string, homeScore: number, awayScore: number) => request('/predictions', { token, method: 'POST', body: { matchId, homeScore, awayScore } }),
  refer: (token: string, kind: string, name: string, contact: string) => request('/referrals', { token, method: 'POST', body: { kind, name, contact } }),
};
