import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { BusinessSettings, AdminReward } from '@nacional/shared/settings';
import { settingsApi } from '../../services/settings';
import { useSession } from '../../providers/SessionProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { Text } from '../Typography';
import { Panel } from '../ui';
import { Sheet } from '../Sheet';
import { AdminButton, AdminField, AdminFormGrid, AdminNotice, AdminSection, AdminSelect, AdminToggle } from './AdminControls';
import { useShopAction } from './shop/useShopAction';

const fields = [
  ['ticketReservationMinutes', 'Reserva de ingresso (minutos)', 1, 1440],
  ['shopReservationMinutes', 'Reserva de produtos (minutos)', 1, 1440],
  ['shopQuoteMinutes', 'Validade da cotação de frete (minutos)', 1, 60],
  ['cashChargeMinutes', 'Cobrança do parceiro (minutos)', 1, 1440],
  ['shopPendingOrderLimit', 'Pedidos pendentes por cliente na loja', 1, 20],
  ['checkInPoints', 'Pontos por check-in', 1, 100000],
] as const;
function integer(value: string, min: number, max: number, label: string) {
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new Error(`${label}: informe um inteiro entre ${min} e ${max}.`);
  return Number(value);
}
export function AdminSettingsPanel({ refreshKey, onSelect }: { refreshKey: number; onSelect: (section: string) => void }) {
  const { token } = useSession(), { colors } = useTheme();
  const [settings, setSettings] = useState<BusinessSettings | null>(null), [rewards, setRewards] = useState<AdminReward[]>([]), [edit, setEdit] = useState<AdminReward | null | undefined>(), [notice, setNotice] = useState('');
  const { busy, error, run } = useShopAction();
  async function load() { const [config, items] = await Promise.all([settingsApi.settings(token!), settingsApi.rewards(token!)]); setSettings(config); setRewards(items); }
  useEffect(() => { if (token) void run(load); }, [token, refreshKey]);
  return <View style={{ gap: 22 }}>
    {!!error && <AdminNotice tone="error">{error}</AdminNotice>}{!!notice && <AdminNotice>{notice}</AdminNotice>}
    <AdminNotice>Alterações valem para novas operações. Pedidos, taxas já conciliadas, prazos de reservas existentes e resgates anteriores mantêm os valores registrados.</AdminNotice>
    <Panel><AdminSection title="Valores e percentuais" description="Cada valor é mantido no seu cadastro, sem repetir a configuração em outras telas.">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[
        ['Financeiro', 'Comissão, taxa estimada do gateway e repasse'], ['Loja', 'Produtos, estoque, frete e retirada'],
        ['Jogos', 'Preços de ingressos e capacidade por setor'], ['Planos', 'Mensalidades e descontos'], ['Parceiros', 'Cashback, comissão e recebedores'],
      ].map(([section, label]) => <AdminButton key={section} label={label!} onPress={() => onSelect(section!)} />)}</View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Em Financeiro → Configurações, a taxa estimada serve para previsão. Quando o gateway informa a tarifa efetiva, ela é usada na conciliação.</Text>
    </AdminSection></Panel>
    {settings ? <SettingsForm key={`${settings.version}:${settings.updatedAt}`} settings={settings} onSaved={async () => { await load(); setNotice('Configurações salvas.'); }} /> : <Text style={{ color: colors.muted }}>Carregando configurações…</Text>}
    <Panel><AdminSection title="Recompensas de pontos" description="Cadastre experiências, custo em pontos, vagas disponíveis e disponibilidade no app.">
      <AdminButton label="Cadastrar recompensa" primary disabled={busy} onPress={() => setEdit(null)} />
      {!rewards.length && <Text style={{ color: colors.muted }}>Nenhuma recompensa cadastrada.</Text>}
      {rewards.map((reward) => <View key={reward.id} style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: colors.text, fontWeight: '600' }}>{reward.title}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{reward.cost.toLocaleString('pt-BR')} pontos · {reward.stock} vagas · {reward.active ? 'Ativa' : 'Inativa'}</Text></View><AdminButton label="Editar" size="small" disabled={busy} onPress={() => setEdit(reward)} /></View>)}
    </AdminSection></Panel>
    {edit !== undefined && <RewardForm current={edit} onClose={() => setEdit(undefined)} onSaved={async () => { setEdit(undefined); await load(); setNotice('Recompensa salva.'); }} />}
  </View>;
}
function SettingsForm({ settings, onSaved }: { settings: BusinessSettings; onSaved: () => Promise<void> }) {
  const { token } = useSession();
  const [values, setValues] = useState(() => Object.fromEntries(fields.map(([key]) => [key, String(settings[key])]))), [enabled, setEnabled] = useState(settings.checkInEnabled);
  const { busy, error, run } = useShopAction();
  const change = (key: string, value: string) => { setValues((old) => ({ ...old, [key]: value })); };
  return <Panel><AdminSection title="Reservas e participação" description="O prazo do ingresso também respeita o encerramento das vendas e o início do jogo.">
    <AdminFormGrid>{fields.map(([key, label, min, max]) => <AdminField key={key} label={label} value={values[key] || ''} onChange={(value) => change(key, value)} keyboardType="number-pad" maxLength={6} hint={`${min} a ${max}`} editable={!busy} required />)}</AdminFormGrid>
    <AdminToggle label="Check-in diário habilitado" value={enabled} onChange={(value) => { setEnabled(value); }} disabled={busy} />
    {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
    <AdminButton label="Salvar configurações" primary loading={busy} onPress={() => void run(async () => {
      const data = Object.fromEntries(fields.map(([key, label, min, max]) => [key, integer(values[key] || '', min, max, label)])) as unknown as Pick<BusinessSettings, typeof fields[number][0]>;
      await settingsApi.save(token!, { ...data, checkInEnabled: enabled, version: settings.version }); await onSaved();
    })} />
  </AdminSection></Panel>;
}
function RewardForm({ current, onClose, onSaved }: { current: AdminReward | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useSession();
  const [title, setTitle] = useState(current?.title || ''), [description, setDescription] = useState(current?.description || ''), [cost, setCost] = useState(String(current?.cost ?? 100)), [stock, setStock] = useState(String(current?.stock ?? 0)), [icon, setIcon] = useState(current?.icon || 'gift'), [active, setActive] = useState(current?.active ?? false);
  const { busy, error, run } = useShopAction();
  return <Sheet visible title={current ? 'Editar recompensa' : 'Nova recompensa'} onClose={busy ? () => {} : onClose}>
    <AdminField label="Nome" value={title} onChange={setTitle} maxLength={100} required editable={!busy} />
    <AdminField label="Descrição e condições" value={description} onChange={setDescription} maxLength={2000} multiline editable={!busy} />
    <AdminFormGrid><AdminField label="Custo em pontos" value={cost} onChange={setCost} keyboardType="number-pad" maxLength={8} required editable={!busy} /><AdminField label="Vagas disponíveis" value={stock} onChange={setStock} keyboardType="number-pad" maxLength={7} required editable={!busy} /></AdminFormGrid>
    <AdminSelect label="Ícone" value={icon} onChange={setIcon} disabled={busy} options={[{ value: 'gift', label: 'Presente' }, { value: 'flag', label: 'Bandeira' }, { value: 'camera', label: 'Foto' }, { value: 'shirt', label: 'Camisa' }]} />
    <AdminToggle label="Disponível no app" value={active} onChange={setActive} disabled={busy} />
    <AdminNotice>Inativar preserva o histórico. O custo de resgates realizados permanece registrado. Se alguém resgatar durante a edição, atualize a lista antes de salvar as vagas.</AdminNotice>
    {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
    <AdminButton label="Salvar recompensa" primary loading={busy} onPress={() => void run(async () => { await settingsApi.reward(token!, { title: title.trim(), description: description.trim(), cost: integer(cost, 1, 10000000, 'Custo'), stock: integer(stock, 0, 1000000, 'Vagas'), icon, active }, current); await onSaved(); })} />
  </Sheet>;
}
