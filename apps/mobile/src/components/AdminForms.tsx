import React, { useRef, useState } from 'react';
import { View, Switch, useWindowDimensions } from 'react-native';
import type { Match, Sector, ClubPlan } from '@nacional/shared/types';
import { Text, TextInput } from './Typography';
import { Sheet } from './Sheet';
import { Button } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { adminApi } from '../services/admin';
import { parseAmount } from '../utils/payments';
import { formDate, parseClubDate } from '../utils/admin';
import { messageOf } from '../utils/format';
import { club } from '../config/club';

export function AdminField({ label, value, onChange, numeric = false }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean }) {
  const { colors, tone } = useTheme();
  return <View style={{ gap: 7 }}><Text style={{ color: colors.muted, fontSize: 12, lineHeight: 20, fontWeight: '500' }}>{label}</Text><TextInput value={value} onChangeText={onChange} accessibilityLabel={label} keyboardType={numeric ? 'decimal-pad' : 'default'} style={{ color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, minHeight: 44, padding: 11, borderRadius: 8 }} /></View>;
}
function AdminFormGrid({ children }: React.PropsWithChildren) {
  const { width } = useWindowDimensions();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{React.Children.toArray(children).map((child, index) => <View key={index} style={{ width: width >= 768 ? '48%' : '100%' }}>{child}</View>)}</View>;
}
export function AdminToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const { colors } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ flex: 1, color: colors.text }}>{label}</Text><Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ false: colors.subtle, true: colors.primaryStrong }} thumbColor="#fff" /></View>;
}
function useFormAction(onSaved: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function save(work: () => Promise<unknown>) { if (lock.current) return; lock.current = true; setBusy(true); setError(''); try { await work(); await onSaved(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); lock.current = false; } }
  return { busy, error, save };
}
export function MatchForm({ match, onClose, onSaved }: { match: Match | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useSession();
  const { colors, tone } = useTheme();
  const [home, setHome] = useState(match?.homeTeam || club.upperName);
  const [away, setAway] = useState(match?.awayTeam || '');
  const [starts, setStarts] = useState(match ? formDate(match.startsAt) : '');
  const [stadium, setStadium] = useState(match?.stadium || 'José Cavalcanti');
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
    <AdminFormGrid><AdminField label="Time mandante" value={home} onChange={setHome} /><AdminField label="Adversário" value={away} onChange={setAway} /></AdminFormGrid>
    <AdminFormGrid><AdminField label="Jogo · AAAA-MM-DD HH:mm (Patos)" value={starts} onChange={setStarts} /><AdminField label="Estádio" value={stadium} onChange={setStadium} /></AdminFormGrid><AdminField label="Competição" value={competition} onChange={setCompetition} />
    <AdminFormGrid><AdminField label="Abrir vendas · opcional · AAAA-MM-DD HH:mm" value={salesOpen} onChange={setSalesOpen} /><AdminField label="Encerrar vendas · opcional · AAAA-MM-DD HH:mm" value={salesClose} onChange={setSalesClose} /></AdminFormGrid>
    <AdminToggle label="Vendas habilitadas" value={salesEnabled} onChange={setSalesEnabled} />{match && <AdminToggle label="Publicado no app" value={published} onChange={setPublished} />}
    <Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Portaria</Text><AdminToggle label="Habilitar entrada nesta partida" value={entryEnabled} onChange={setEntryEnabled} /><AdminField label="Portaria abre · opcional · AAAA-MM-DD HH:mm" value={gateOpen} onChange={setGateOpen} /><AdminField label="Portaria fecha · opcional · AAAA-MM-DD HH:mm" value={gateClose} onChange={setGateClose} /><Text style={{ color: colors.muted, fontSize: 14 }}>Sem horários específicos, a entrada abre 2 horas antes do jogo e encerra 4 horas após o início. A portaria começa desativada.</Text>
    {!match && <Text style={{ color: colors.muted, fontSize: 14 }}>O jogo começa como rascunho. Cadastre os setores e publique quando estiver pronto.</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}<Button label="Salvar jogo" loading={busy} onPress={() => void submit()} />
  </Sheet>;
}
export function SectorForm({ match, sector, onClose, onSaved }: { match: Match; sector: Sector | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useSession();
  const { colors, tone } = useTheme();
  const [name, setName] = useState(sector?.name || '');
  const [price, setPrice] = useState(((sector?.priceCents || 0) / 100).toFixed(2).replace('.', ','));
  const [capacity, setCapacity] = useState(String(sector?.capacity ?? 500));
  const [enabled, setEnabled] = useState(sector?.salesEnabled ?? true);
  const { busy, error, save } = useFormAction(onSaved);
  return <Sheet visible title={sector ? 'Editar setor' : 'Cadastrar setor'} onClose={busy ? () => {} : onClose}>
    <Text style={{ color: colors.muted }}>{match.homeTeam} × {match.awayTeam}</Text><AdminField label="Nome do setor" value={name} onChange={setName} /><AdminField label="Preço por ingresso · R$" value={price} onChange={setPrice} numeric /><AdminField label="Capacidade total de lugares" value={capacity} onChange={setCapacity} numeric /><AdminToggle label="Disponível para venda" value={enabled} onChange={setEnabled} />
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}<Button label="Salvar setor" loading={busy} onPress={() => void save(async () => { if (!/^\d+$/.test(capacity)) throw new Error('Informe uma capacidade inteira.'); const body = { name: name.trim(), priceCents: parseAmount(price, true), capacity: Number(capacity), salesEnabled: enabled }; return sector ? adminApi.updateSector(token!, { id: sector.id, ...body }) : adminApi.createSector(token!, { matchId: match.id, ...body }); })} />
  </Sheet>;
}
export function PlanForm({ plan, onClose, onSaved }: { plan: ClubPlan | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useSession();
  const { colors, tone } = useTheme();
  const [name, setName] = useState(plan?.name || '');
  const [price, setPrice] = useState(((plan?.priceCents || 0) / 100).toFixed(2).replace('.', ','));
  const [discount, setDiscount] = useState(String(plan?.discountPercent || 0));
  const { busy, error, save } = useFormAction(onSaved);
  return <Sheet visible title={plan ? 'Editar plano' : 'Criar plano'} onClose={busy ? () => {} : onClose}><AdminField label="Nome do plano" value={name} onChange={setName} /><AdminField label="Mensalidade · R$" value={price} onChange={setPrice} numeric /><AdminField label="Desconto em ingressos · %" value={discount} onChange={setDiscount} numeric />{!!error && <Text style={{ color: colors.danger }}>{error}</Text>}<Button label="Salvar plano" loading={busy} onPress={() => void save(async () => { if (!/^\d+$/.test(discount)) throw new Error('Informe um percentual inteiro.'); const body = { name: name.trim(), priceCents: parseAmount(price, true), discountPercent: Number(discount) }; return plan ? adminApi.updatePlan(token!, { ...body, id: plan.id }) : adminApi.createPlan(token!, body); })} /></Sheet>;
}
