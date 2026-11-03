import type { CashWallet, CashCharge, MerchantSetup } from '@nacional/shared/types';
import { request } from './api';
import { config } from '../config/env';
const tenant = `tenant=${encodeURIComponent(config.tenantSlug)}`;
export const paymentsApi = {
  wallet: (token: string) => request<CashWallet>(`/cashback/wallet?${tenant}`, { token }),
  setup: (token: string) => request<MerchantSetup>('/merchant/setup', { token }),
  merchantCharges: (token: string) => request<CashCharge[]>('/merchant/charges', { token }),
  create: (token: string, body: { offerId: string; amountCents: number; customerCode?: string; requestKey: string }) => request<CashCharge>('/merchant/charges', { token, method: 'POST', body }),
  fixedCharge: (token: string, body: { merchantCode: string; amountCents: number; requestKey: string }) => request<CashCharge>(`/payments/customer-charge?${tenant}`, { token, method: 'POST', body }),
  resolve: (token: string, code: string) => request<CashCharge>('/payments/resolve', { token, method: 'POST', body: { code } }),
  claim: (token: string, code: string) => request<CashCharge>('/payments/claim', { token, method: 'PUT', body: { code } }),
  simulate: (token: string, chargeId: string, type: 'SETTLED' | 'REFUNDED', eventId: string) => request('/merchant/simulate-event', { token, method: 'POST', body: { chargeId, type, eventId } }),
};
