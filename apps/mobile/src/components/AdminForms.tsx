import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import type { Match, Sector, ClubPlan } from '@nacional/shared/types';
import { Text } from './Typography';
import { AdminField, AdminToggle, AdminDateTimeField, AdminFormGrid, AdminSection, AdminNotice } from './admin/AdminControls';
import { Sheet } from './Sheet';
import { Button } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { adminApi } from '../services/admin';
import { parseAmount } from '../utils/payments';
import { formDate, parseClubDate } from '../utils/admin';
import { messageOf } from '../utils/format';
import { club } from '../config/club';

export { AdminField, AdminToggle } from './admin/AdminControls';

function useFormAction(onSaved: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function save(work: () => Promise<unknown>) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work(); await onSaved(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); lock.current = false; } }
  return { busy, error, save };
}
export function MatchForm({ match, onClose, onSaved }: { match: Match | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useSession();
  const { colors } = useTheme();
  const [home, setHome] = useState(match?.homeTeam || '');
  const [away, setAway] = useState(match?.awayTeam || '');
  const [starts, setStarts] = useState(match ? formDate(match.startsAt) : '');
  const [stadium, setStadium] = useState(match?.stadium || '');
  const [competition, setCompetition] = useState(match?.competition || '');
  const [salesOpen, setSalesOpen] = useState(match?.salesOpenAt ? formDate(match.salesOpenAt) : '');
  const [salesClose, setSalesClose] = useState(match?.salesCloseAt ? formDate(match.salesCloseAt) : '');
  const [published, setPublished] = useState(match?.published ?? false);
  const [salesEnabled, setSalesEnabled] = useState(match?.salesEnabled ?? true);
  const [entryEnabled, setEntryEnabled] = useState(match?.entryEnabled ?? false);
  const [gateOpen, setGateOpen] = useState(match?.gateOpenAt ? formDate(match.gateOpenAt) : '');
  const [gateClose, setGateClose] = useState(match?.gateCloseAt ? formDate(match.gateCloseAt) : '');
  const { busy, error, save } = useFormAction(onSaved);
  function submit() {
    return save(async () => {
      const body = { homeTeam: home.trim(), awayTeam: away.trim(), startsAt: parseClubDate(starts), stadium: stadium.trim(), competition: competition.trim(), isHome: match?.isHome ?? true, published: match ? published : false, salesEnabled, salesOpenAt: salesOpen.trim() ? parseClubDate(salesOpen) : null, salesCloseAt: salesClose.trim() ? parseClubDate(salesClose) : null, entryEnabled, gateOpenAt: gateOpen.trim() ? parseClubDate(gateOpen) : null, gateCloseAt: gateClose.trim() ? parseClubDate(gateClose) : null };
      return match ? adminApi.updateMatch(token!, { id: match.id, ...body }) : adminApi.createMatch(token!, body);
    });
  }
  return <Sheet visible title={match ? 'Editar jogo' : 'Cadastrar jogo'} onClose={busy ? () => {} : onClose}>
    <AdminSection title="Dados da partida"><AdminFormGrid><AdminField label="Time mandante" value={home} onChange={setHome} required editable={!busy} /><AdminField label="Adversário" value={away} onChange={setAway} required editable={!busy} /></AdminFormGrid><AdminFormGrid><AdminDateTimeField label="Data e hora do jogo" value={starts} onChange={setStarts} disabled={busy} /><AdminField label="Estádio" value={stadium} onChange={setStadium} required editable={!busy} /></AdminFormGrid><AdminField label="Competição" value={competition} onChange={setCompetition} required editable={!busy} /></AdminSection>
    <AdminSection title="Venda de ingressos" description="Datas opcionais. Sem uma janela específica, vale o período até o início do jogo."><AdminFormGrid><AdminDateTimeField label="Abrir vendas" value={salesOpen} onChange={setSalesOpen} optional disabled={busy} /><AdminDateTimeField label="Encerrar vendas" value={salesClose} onChange={setSalesClose} optional disabled={busy} /></AdminFormGrid><AdminToggle label="Vendas habilitadas" value={salesEnabled} onChange={setSalesEnabled} disabled={busy} />{match && <AdminToggle label="Publicado no aplicativo" value={published} onChange={setPublished} disabled={busy} />}</AdminSection>
    <AdminSection title="Portaria" description="Sem horários específicos: de 2h antes até 4h após o início do jogo."><AdminToggle label="Habilitar entrada nesta partida" value={entryEnabled} onChange={setEntryEnabled} disabled={busy} /><AdminFormGrid><AdminDateTimeField label="Abrir portaria" value={gateOpen} onChange={setGateOpen} optional disabled={busy} /><AdminDateTimeField label="Fechar portaria" value={gateClose} onChange={setGateClose} optional disabled={busy} /></AdminFormGrid></AdminSection>
    {!match && <AdminNotice>O jogo será criado como rascunho. Cadastre os setores antes de publicar.</AdminNotice>}
    {!!error && <AdminNotice tone="error">{error}</AdminNotice>}<Button label="Salvar jogo" loading={busy} onPress={() => void submit()} />
  </Sheet>;
}
export function SectorForm({ match, sector, onClose, onSaved }: { match: Match; sector: Sector | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useSession();
  const { colors } = useTheme();
  const [name, setName] = useState(sector?.name || '');
  const [price, setPrice] = useState(((sector?.priceCents || 0) / 100).toFixed(2).replace('.', ','));
  const [capacity, setCapacity] = useState(String(sector?.capacity ?? 500));
  const [enabled, setEnabled] = useState(sector?.salesEnabled ?? true);
  const { busy, error, save } = useFormAction(onSaved);
  return <Sheet visible title={sector ? 'Editar setor' : 'Cadastrar setor'} onClose={busy ? () => {} : onClose}>
    <Text style={{ color: colors.muted }}>{match.homeTeam} × {match.awayTeam}</Text><AdminField label="Nome do setor" value={name} onChange={setName} /><AdminField label="Preço por ingresso" prefix="R$" value={price} onChange={setPrice} numeric /><AdminField label="Capacidade de pessoas" value={capacity} onChange={setCapacity} keyboardType="number-pad" /><AdminToggle label="Disponível para venda" value={enabled} onChange={setEnabled} />
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}<Button label="Salvar setor" loading={busy} onPress={() => void save(async () => { if (!/^\d+$/.test(capacity)) throw new Error('Informe uma capacidade inteira.'); const body = { name: name.trim(), priceCents: parseAmount(price, true), capacity: Number(capacity), salesEnabled: enabled }; return sector ? adminApi.updateSector(token!, { id: sector.id, ...body }) : adminApi.createSector(token!, { matchId: match.id, ...body }); })} />
  </Sheet>;
}
export function PlanForm({ plan, onClose, onSaved }: { plan: ClubPlan | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useSession();
  const { colors } = useTheme();
  const [name, setName] = useState(plan?.name || '');
  const [price, setPrice] = useState(((plan?.priceCents || 0) / 100).toFixed(2).replace('.', ','));
  const [discount, setDiscount] = useState(String(plan?.discountPercent || 0));
  const { busy, error, save } = useFormAction(onSaved);
  return <Sheet visible title={plan ? 'Editar plano' : 'Criar plano'} onClose={busy ? () => {} : onClose}><AdminField label="Nome do plano" value={name} onChange={setName} /><AdminField label="Mensalidade" prefix="R$" value={price} onChange={setPrice} numeric /><AdminField label="Desconto em ingressos" prefix="%" value={discount} onChange={setDiscount} numeric />{!!error && <Text style={{ color: colors.danger }}>{error}</Text>}<Button label="Salvar plano" loading={busy} onPress={() => void save(async () => { if (!/^\d+$/.test(discount)) throw new Error('Informe um percentual inteiro.'); const body = { name: name.trim(), priceCents: parseAmount(price, true), discountPercent: Number(discount) }; return plan ? adminApi.updatePlan(token!, { ...body, id: plan.id }) : adminApi.createPlan(token!, body); })} /></Sheet>;
}
