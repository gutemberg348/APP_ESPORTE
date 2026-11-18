import { InvitationSheet } from './FriendInvitationSheet';
import React, { useState } from 'react';
import { Text, TextInput } from './Typography';
import { Sheet } from './Sheet';
import { Button, Page, Panel, Title } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { useClub } from '../providers/ClubProvider';
import { useSession } from '../providers/SessionProvider';
import { request } from '../services/api';
import { club } from '../config/club';
import { messageOf } from '../utils/format';
export function ReferralSheet({ kind, onClose }: { kind: 'FRIEND' | 'BUSINESS' | 'PARTNER'; onClose: () => void }) {
  return kind === 'PARTNER' ? <PartnerSheet onClose={onClose} /> : <InvitationSheet business={kind === 'BUSINESS'} onClose={onClose} />;
}

function PartnerSheet({ onClose }: { onClose: () => void }) {
  const { refer } = useClub();
  const { demoMode } = useSession();
  return <Sheet visible title="Seja um Parceiro Oficial" onClose={onClose}>
    <BusinessForm onSend={(name, contact) => refer('PARTNER', name, contact)} onDone={onClose} demoMode={demoMode} />
  </Sheet>;
}

export function BusinessInvitationPage({ code, onDone }: { code: string | null; onDone: () => void }) {
  const { colors } = useTheme();
  return <Page><Panel style={{ gap: 16, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
    <Title title={`Seja parceiro do ${club.shortName}`} />
    {code && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(code) ? <>
      <Text style={{ color: colors.muted }}>Envie seu contato para a equipe do clube conversar sobre a parceria.</Text>
      <BusinessForm onSend={(name, contact) => request('/invitations/business', { method: 'POST', body: { code, name, contact } })} onDone={onDone} />
    </> : <Text style={{ color: colors.danger }}>Convite inválido. Peça o link completo a quem indicou seu comércio.</Text>}
  </Panel></Page>;
}

function BusinessForm({ onSend, onDone, demoMode }: { onSend: (name: string, contact: string) => Promise<unknown>; onDone: () => void; demoMode?: boolean }) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function submit() {
    if (name.trim().length < 2 || contact.trim().length < 5) { setError('Informe nome e contato válidos.'); return; }
    setBusy(true); setError('');
    try { await onSend(name.trim(), contact.trim()); setDone(true); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }
  const inputStyle = { padding: 14, borderRadius: 12, color: colors.text, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border };
  return <>{done ? <><Text style={{ color: colors.primary }}>{demoMode ? 'Indicação simulada. Nenhum contato foi enviado.' : 'Indicação registrada! Nossa equipe poderá analisar a solicitação.'}</Text><Button label="Concluir" onPress={onDone} /></> : <>
    <TextInput value={name} onChangeText={setName} placeholder={'Nome do comércio'} placeholderTextColor={colors.muted} maxLength={100} style={inputStyle} accessibilityLabel="Nome da indicação" />
    <TextInput value={contact} onChangeText={setContact} mask="contact" placeholder="E-mail ou telefone de contato" placeholderTextColor={colors.muted} maxLength={254} autoCapitalize="none" style={inputStyle} accessibilityLabel="Contato da indicação" />
    {error ? <Text style={{ color: colors.danger }} accessibilityRole="alert">{error}</Text> : null}
    <Button label="Enviar indicação" loading={busy} onPress={() => void submit()} />
  </>}</>;
}
