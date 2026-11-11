import type { GateV1Match, GateV1Ticket, GateV1Operation, GateV1Receipt, GateV1History } from '@nacional/shared/gate-v1';
import { request } from './api';
export const gateV1Api = {
  matches: (token: string) => request<GateV1Match[]>('/gate/v1/matches', { token }),
  inspect: (token: string, body: { partidaId: string; alocacaoId: string; chaveQr: string }) => request<GateV1Ticket>('/gate/v1/inspect', { token, method: 'POST', body }),
  admit: (token: string, body: GateV1Operation & { chaveQr: string }) => request<GateV1Receipt>('/gate/v1/admit', { token, method: 'POST', body }),
  receipt: (token: string, operation: GateV1Operation) => request<GateV1Receipt>('/gate/v1/receipt?' + new URLSearchParams({ partidaId: operation.partidaId, alocacaoId: operation.alocacaoId, requestKey: operation.requestKey }), { token }),
  history: (token: string, filters: Record<string, string> = {}) => request<GateV1History>('/gate/v1/history?' + new URLSearchParams(filters), { token }),
  assignments: (token: string, userId: string, allocationIds: string[]) => request('/admin/employees/assignments-v1', { token, method: 'PUT', body: { userId, allocationIds } }),
};
