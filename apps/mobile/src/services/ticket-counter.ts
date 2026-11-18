import type { PixIntent } from '@nacional/shared/types';
import { Platform } from 'react-native';
import { request } from './api';
import { openReceipt } from './receipt-files';

type Match = { timeMandante: string; timeVisitante: string; dataPartida: string };
export type CounterLot = { pixAvailable?: boolean; id: string; name: string; unitCents: number; available: number; match: Match & { id: string }; sector: { nome: string; numerado: boolean } };
export type CounterOrder = { id: string; chaveBalcao: string; metodoBalcao: string; statusPagamento: string; expiraEm: string | null; criadoEm: string; valorTotalCentavos: number; partida: Match };
export type CounterReceipt = CounterOrder & { ingressos: { id: string; status: string; chaveQr?: string; codigoPortaria?: string; nomeTitular: string; alocacao: { setor: { nome: string } } }[] };
type Printable = { id: string; name: string; mimeType: string; base64: string };
const base = '/bilheteria';
export const counterApi = {
  pix: (token: string, key: string) => request<PixIntent>(base + '/pix?key=' + encodeURIComponent(key), { token }),
  lots: (token: string) => request<CounterLot[]>(base + '/lotes', { token }),
  recent: (token: string) => request<CounterOrder[]>(base + '/vendas', { token }),
  receipt: (token: string, key: string) => request<CounterReceipt>(base + '/bilhete?key=' + encodeURIComponent(key), { token }),
  settle: (token: string, key: string, pay: boolean) => request<CounterReceipt>(base + '/recebimento', { token, method: 'POST', body: { key, pay } }),
  sell: (token: string, body: { key: string; cpf: string; lotId: string; unitCents: number; quantity: number; method: string; seat?: { block: number; row: string; first: number } }) =>
    request<CounterReceipt>(base + '/vendas', { token, body, method: 'POST', timeoutMs: 30000 }),
};
export async function deliverTickets(token: string, key: string, print: boolean) {
  const tab = print && Platform.OS === 'web' ? window.open('about:blank', '_blank') : null;
  if (tab) tab.opener = null;
  try {
    const file = await request<Printable>(base + '/pdf?key=' + encodeURIComponent(key), { token });
    if (!print || (Platform.OS === 'web' && !tab)) return await openReceipt(file);
    if (tab) {
      const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      tab.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 300000);
    } else {
      const Print = await import('expo-print');
      await Print.printAsync({ uri: 'data:application/pdf;base64,' + file.base64 });
    }
  } catch (error) { tab?.close(); throw error; }
}
