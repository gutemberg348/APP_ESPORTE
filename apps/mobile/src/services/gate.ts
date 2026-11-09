import type { Match, GateCredential, TicketReview, AdmissionResult, Employee } from '@nacional/shared/types';
import { request } from './api';
import type { AccountEditInput } from './admin';
export const gateApi = {
  matches: (token: string) => request<Match[]>('/gate/matches', { token }),
  inspect: (token: string, credential: GateCredential, matchId: string, sectorId: string) => request<TicketReview>('/gate/inspect', { token, method: 'POST', body: { ...credential, matchId, sectorId } }),
  admit: (token: string, credential: GateCredential, matchId: string, sectorId: string, quantity: number, requestKey: string) => request<AdmissionResult>('/gate/admit', { token, method: 'POST', body: { ...credential, matchId, sectorId, quantity, requestKey } }),
  receipt: (token: string, ticketId: string, matchId: string, sectorId: string, requestKey: string) => request<AdmissionResult>(`/gate/admission-receipt?${new URLSearchParams({ ticketId, matchId, sectorId, requestKey })}`, { token }),
};
export const employeeApi = {
  list: (token: string, search = '', offset = 0) => request<Employee[]>('/admin/employees?' + new URLSearchParams({ limit: '100', offset: String(offset), search }), { token }),
  create: (token: string, body: { name: string; email: string; password: string; role?: Employee['role']; contact?: string }) => request<Employee>('/admin/employees', { token, method: 'POST', body }),
  edit: (token: string, body: AccountEditInput & { role?: Employee['role'] }) => request<Employee>('/admin/employees', { token, method: 'PATCH', body }),
  password: (token: string, userId: string, password: string) => request('/admin/employees/password', { token, method: 'PUT', body: { userId, password } }),
  assignments: (token: string, userId: string, sectorIds: string[]) => request<Employee>('/admin/employees/assignments', { token, method: 'PUT', body: { userId, sectorIds } }),
};
