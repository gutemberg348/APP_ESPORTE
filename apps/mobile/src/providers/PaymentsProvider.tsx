import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { CashCharge, CashWallet, MerchantSetup } from '@nacional/shared/types';
import { useSession } from './SessionProvider';
import { paymentsApi } from '../services/payments';
import { requestKey } from '../utils/payments';
import { club } from '../config/club';
const demoSetup: MerchantSetup = { demo: true, enabled: true, merchants: [{ id: 'demo-merchant', name: 'Farmácia Bem-Estar · demo', fixedQr: 'nacional://merchant/00000000-0000-4000-8000-000000000001', offers: [{ id: 'demo-offer', tenant: { slug: club.id, name: club.name }, cashbackBps: 1000, commissionBps: 200, customerQrEnabled: false }] }] };
const initialWallet: CashWallet = { tenant: { slug: club.id, name: club.name }, customerCode: 'NC-DEMO-ALEX-SEM-VALIDADE', availableCents: 0, debtCents: 0, demo: true, entries: [], charges: [] };
interface Payments {
  wallet: CashWallet | null; setup: MerchantSetup | null; charges: CashCharge[]; error: string; loading: boolean;
  refresh: () => Promise<void>;
  create: (offerId: string, amountCents: number, customerCode: string, key: string) => Promise<CashCharge>;
  resolve: (code: string) => Promise<CashCharge>; claim: (code: string) => Promise<CashCharge>;
  fixedCharge: (merchantCode: string, amountCents: number, key: string) => Promise<CashCharge>;
  simulate: (id: string, type: 'SETTLED' | 'REFUNDED') => Promise<void>;
}
const Context = createContext<Payments | null>(null);
export function PaymentsProvider({ children }: React.PropsWithChildren) {
  const { demoMode, token, member } = useSession();
  const [wallet, setWallet] = useState<CashWallet | null>(demoMode ? initialWallet : null);
  const [setup, setSetup] = useState<MerchantSetup | null>(demoMode ? demoSetup : null);
  const [charges, setCharges] = useState<CashCharge[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const revision = useRef(0);
  const lock = useRef(false);
  async function exclusive<T>(work: () => Promise<T>) {
    if (lock.current) throw new Error('Aguarde a operação em andamento.');
    lock.current = true; try { return await work(); } finally { lock.current = false; }
  }
  const refresh = useCallback(async () => {
    if (demoMode || !token) return;
    const current = ++revision.current;
    setLoading(true); setError('');
    try {
      const [freshWallet, freshSetup, merchantCharges] = await Promise.all([member?.role === 'CASHIER' ? Promise.resolve(null) : paymentsApi.wallet(token), paymentsApi.setup(token), paymentsApi.merchantCharges(token)]);
      if (current !== revision.current) return;
      setWallet(freshWallet); setSetup(freshSetup); setCharges(merchantCharges);
    } catch (err) { if (current === revision.current) setError(err instanceof Error ? err.message : 'Não foi possível carregar a carteira.'); }
    finally { if (current === revision.current) setLoading(false); }
  }, [demoMode, token, member?.role]);
  useEffect(() => { void refresh(); return () => { revision.current++; }; }, [member?.id, demoMode]);
  async function create(offerId: string, amountCents: number, code: string, key: string) {
    return exclusive(async () => {
      if (!demoMode) { const charge = await paymentsApi.create(token!, { offerId, amountCents, requestKey: key, ...(code.trim() ? { customerCode: code.trim() } : {}) }); await refresh(); return charge; }
      const merchant = demoSetup.merchants[0];
      const offer = merchant?.offers[0];
      if (!merchant || !offer || offerId !== offer.id) throw new Error('Parceria indisponível.');
      if (code.trim() && code.trim() !== wallet?.customerCode) throw new Error('Use o código demonstrativo desta carteira.');
      const existing = charges.find((item) => item.id === `demo-${key}`);
      if (existing) { if (existing.amountCents !== amountCents) throw new Error('Essa solicitação já foi usada para outra venda.'); return existing; }
      const cashbackCents = Math.round(amountCents * offer.cashbackBps / 10000);
      const commissionCents = Math.round(amountCents * offer.commissionBps / 10000);
      const saleCode = `DEMO_${requestKey()}`;
      const charge: CashCharge = { id: `demo-${key}`, tenant: offer.tenant, merchant: { name: merchant.name }, channel: 'CASHIER_QR', status: 'PENDING', amountCents, cashbackCents, commissionCents, merchantCents: amountCents - cashbackCents - commissionCents, gatewayFeeCents: 0, customerLinked: Boolean(code.trim()), demo: true, pixPayload: null, saleCode, saleQr: `nacional://sale/${saleCode}`, createdAt: new Date().toISOString(), paidAt: null, expiresAt: new Date(Date.now() + 15 * 60000).toISOString() };
      setCharges((all) => [charge, ...all]);
      if (charge.customerLinked) setWallet((current) => current ? { ...current, charges: [charge, ...current.charges] } : current);
      return charge;
    });
  }
  async function resolve(code: string) {
    if (!demoMode) return paymentsApi.resolve(token!, code);
    const charge = charges.find((item) => item.saleCode === code);
    if (!charge) throw new Error('Venda não encontrada. Gere uma cobrança no Caixa demo primeiro.');
    return charge.status === 'PENDING' && new Date(charge.expiresAt) <= new Date() ? { ...charge, status: 'EXPIRED' as const } : charge;
  }
  async function claim(code: string) {
    return exclusive(async () => {
      if (!demoMode) { const charge = await paymentsApi.claim(token!, code); await refresh(); return charge; }
      const charge = await resolve(code);
      if (charge.status !== 'PENDING') throw new Error('Esta venda não está disponível para vinculação.');
      const linked = { ...charge, customerLinked: true };
      setCharges((all) => all.map((item) => item.id === linked.id ? linked : item));
      setWallet((current) => current ? { ...current, charges: [linked, ...current.charges.filter((item) => item.id !== linked.id)] } : current);
      return linked;
    });
  }
  async function fixedCharge(merchantCode: string, amountCents: number, key: string) {
    if (!demoMode) { const charge = await paymentsApi.fixedCharge(token!, { merchantCode, amountCents, requestKey: key }); await refresh(); return charge; }
    throw new Error('O modelo A está preparado, mas o QR fixo ainda não foi habilitado nesta loja.');
  }
  async function simulate(id: string, type: 'SETTLED' | 'REFUNDED') {
    return exclusive(async () => {
      if (!demoMode) { await paymentsApi.simulate(token!, id, type, requestKey()); await refresh(); return; }
      const charge = charges.find((item) => item.id === id);
      if (!charge?.customerLinked) throw new Error('Vincule o torcedor pelo QR da venda ou pelo código da carteira.');
      if (type === 'SETTLED' && (charge.status !== 'PENDING' || new Date(charge.expiresAt) <= new Date())) throw new Error('Esta cobrança já foi concluída ou expirou.');
      if (type === 'REFUNDED' && charge.status !== 'PAID') throw new Error('Somente vendas pagas podem ser estornadas.');
      const status = type === 'SETTLED' ? 'PAID' as const : 'REFUNDED' as const;
      const updated = { ...charge, status, paidAt: type === 'SETTLED' ? new Date().toISOString() : charge.paidAt };
      const amountCents = type === 'SETTLED' ? charge.cashbackCents : -charge.cashbackCents;
      setCharges((all) => all.map((item) => item.id === id ? updated : item));
      setWallet((current) => {
        if (!current) return current;
        const balance = current.availableCents - current.debtCents + amountCents;
        return { ...current, availableCents: Math.max(0, balance), debtCents: Math.max(0, -balance), charges: current.charges.map((item) => item.id === id ? updated : item), entries: [{ id: requestKey(), kind: type === 'SETTLED' ? 'CASHBACK' : 'REVERSAL', amountCents, balanceAfterCents: balance, merchant: charge.merchant.name, createdAt: new Date().toISOString() }, ...current.entries] };
      });
    });
  }
  return <Context.Provider value={{ wallet, setup, charges, error, loading, refresh, create, resolve, claim, fixedCharge, simulate }}>{children}</Context.Provider>;
}
export function usePayments() { const value = useContext(Context); if (!value) throw new Error('PaymentsProvider ausente'); return value; }
