import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { Dashboard, Member, Ticket, Preferences } from '@nacional/shared/types';
import demo from '../config/demo';
import { useSession } from './SessionProvider';
import { clubApi } from '../services/club';
import { ApiError } from '../services/api';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
interface Club {
  data: Dashboard | null; loading: boolean; error: string | null; preseason: boolean;
  toggleSeason: () => void; refresh: () => Promise<void>;
  requestTicket: (sectorId: string, quantity: number, matchId?: string, expectedTotalCents?: number) => Promise<Ticket>;
  predict: (home: number, away: number) => Promise<void>;
  refer: (kind: string, name: string, contact: string) => Promise<void>;
  checkIn: () => Promise<void>; redeem: (rewardId: string) => Promise<void>;
  preferences: (preferences: Preferences) => Promise<void>; school: (interested: boolean) => Promise<void>;
}
const Context = createContext<Club | null>(null);
export function ClubProvider({ children }: React.PropsWithChildren) {
  const { member, token, demoMode, signOut, updateMember } = useSession();
  const [data, setData] = useState<Dashboard | null>(demoMode ? { member: demo.member as Member, nextMatch: demo.match, matches: [demo.match], partners: demo.partners, tickets: [], engagement: demo.engagement, predictions: [] } : null);
  const [loading, setLoading] = useState(!demoMode);
  const [error, setError] = useState<string | null>(null);
  const [preseason, setPreseason] = useState(false);
  const revision = useRef(0);
  const mutations = useRef(new Set<string>());
  async function exclusive<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (mutations.current.has(key)) throw new Error('Aguarde a operação em andamento.');
    mutations.current.add(key);
    try { return await work(); } finally { mutations.current.delete(key); }
  }
  const refresh = useCallback(async () => {
    if (demoMode || !token) return;
    const requestId = ++revision.current;
    setLoading(true); setError(null);
    try { const fresh = await clubApi.dashboard(token); if (requestId === revision.current) { setData(fresh); updateMember(fresh.member); } }
    catch (err) {
      if (requestId !== revision.current) return;
      if (err instanceof ApiError && err.status === 401) await signOut();
      else setError(err instanceof Error ? err.message : 'Erro ao carregar dados.');
    } finally { if (requestId === revision.current) setLoading(false); }
  }, [demoMode, token, updateMember, signOut]);
  useEffect(() => { if (!demoMode) { setData(null); void refresh(); } return () => { revision.current++; }; }, [member?.id, demoMode]);
  useEffect(() => { if (member) setData((current) => current ? { ...current, member } : current); }, [member]);
  async function requestTicket(sectorId: string, quantity: number, matchId?: string, expectedTotalCents?: number) {
    return exclusive('ticket', async () => {
      const match = matchId ? data?.matches.find((item) => item.id === matchId) : data?.nextMatch;
      const sector = match?.sectors.find((item) => item.id === sectorId);
      if (!match || !sector) throw new Error('Selecione um setor.');
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 4) throw new Error('Escolha de 1 a 4 ingressos.');
      const existing = data?.tickets.find((ticket) => ticket.match.id === match.id && !['EXPIRED', 'CANCELED'].includes(ticket.status) && !(ticket.status === 'PENDING' && ticket.expiresAt && new Date(ticket.expiresAt) <= new Date()));
      if (demoMode && existing) throw new Error('Você já tem um ingresso ou solicitação para este jogo.');
      const ticket: Ticket = demoMode ? { id: `DEMO-${Date.now()}`, status: 'ISSUED', quantity, expiresAt: null, createdAt: new Date().toISOString(), priceCents: sector.priceCents * quantity, match, sector } : await clubApi.ticket(token!, match.id, sector.id, quantity, expectedTotalCents);
      setData((current) => current ? { ...current, tickets: [ticket, ...current.tickets.filter((item) => item.id !== ticket.id)] } : current);
      if (!demoMode) await refresh();
      return ticket;
    });
  }
  async function predict(homeScore: number, awayScore: number) {
    return exclusive('prediction', async () => {
      if (!data?.nextMatch) throw new Error('Nenhum jogo disponível.');
      const matchId = data.nextMatch.id;
      if (data.predictions.some((p) => p.matchId === matchId)) throw new Error('Seu palpite já foi registrado.');
      if (!demoMode) await clubApi.predict(token!, matchId, homeScore, awayScore);
      setData((current) => current ? { ...current, predictions: [...current.predictions, { matchId, homeScore, awayScore }] } : current);
    });
  }
  async function checkIn() {
    return exclusive('points', async () => {
      if (!data) return;
      if (!demoMode) { await clubApi.checkIn(token!); await refresh(); return; }
      if (data.engagement.checkedIn && data.engagement.day === today()) throw new Error('Você já fez o check-in de hoje.');
      const updated = { ...data.member, points: data.member.points + 30 };
      setData({ ...data, member: updated, engagement: { ...data.engagement, checkedIn: true, day: today(), ledger: [{ id: `demo-${Date.now()}`, amount: 30, reason: 'Check-in diário', createdAt: new Date().toISOString() }, ...data.engagement.ledger] } });
      updateMember(updated);
    });
  }
  async function redeem(rewardId: string) {
    return exclusive('points', async () => {
      if (!data) return;
      if (!demoMode) { await clubApi.redeem(token!, rewardId); await refresh(); return; }
      const reward = data.engagement.rewards.find((item) => item.id === rewardId);
      if (!reward || reward.stock < 1) throw new Error('Experiência indisponível.');
      if (data.engagement.redemptions.some((item) => item.rewardId === rewardId)) throw new Error('Você já resgatou esta experiência.');
      if (data.member.points < reward.cost) throw new Error('Você ainda não tem pontos suficientes.');
      const updated = { ...data.member, points: data.member.points - reward.cost };
      const createdAt = new Date().toISOString();
      setData({ ...data, member: updated, engagement: { ...data.engagement,
        rewards: data.engagement.rewards.map((item) => item.id === rewardId ? { ...item, stock: item.stock - 1 } : item),
        redemptions: [{ id: `DEMO-${Date.now()}`, rewardId, cost: reward.cost, createdAt, reward }, ...data.engagement.redemptions],
        ledger: [{ id: `demo-${Date.now()}`, amount: -reward.cost, reason: `Resgate · ${reward.title}`, createdAt }, ...data.engagement.ledger],
      } }); updateMember(updated);
    });
  }
  async function preferences(value: Preferences) { if (member) updateMember(demoMode ? { ...member, preferences: value } : await clubApi.preferences(token!, value)); }
  async function school(interested: boolean) { if (member) updateMember(demoMode ? { ...member, schoolInterested: interested } : await clubApi.school(token!, interested)); }
  async function refer(kind: string, name: string, contact: string) { if (!demoMode) await clubApi.refer(token!, kind, name, contact); }
  return <Context.Provider value={{ data, loading, error, refresh, requestTicket, predict, refer, checkIn, redeem, preferences, school, preseason, toggleSeason: () => setPreseason((value) => !value) }}>{children}</Context.Provider>;
}
export function useClub() { const value = useContext(Context); if (!value) throw new Error('ClubProvider ausente'); return value; }
