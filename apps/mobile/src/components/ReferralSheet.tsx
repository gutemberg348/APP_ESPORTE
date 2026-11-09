import React, { useState } from 'react';
import { Text, TextInput } from './Typography';
import { Sheet } from './Sheet';
import { Button } from './ui';
import { useTheme } from '../theme/ThemeProvider';
import { useClub } from '../providers/ClubProvider';
import { useSession } from '../providers/SessionProvider';
import { messageOf } from '../utils/format';
export function ReferralSheet({ kind, onClose }: { kind: 'FRIEND' | 'BUSINESS' | 'PARTNER'; onClose: () => void }) {
  const { colors } = useTheme();
  const { refer } = useClub();
  const { demoMode } = useSession();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const title = kind === 'FRIEND' ? 'Indicar Amigo' : kind === 'BUSINESS' ? 'Indicar Comércio' : 'Seja um Parceiro Oficial';
  async function submit() {
    if (name.trim().length < 2 || contact.trim().length < 5) { setError('Informe nome e contato válidos.'); return; }
    setBusy(true); setError('');
    try { await refer(kind, name.trim(), contact.trim()); setDone(true); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }
  const inputStyle = { padding: 14, borderRadius: 12, color: colors.text, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border };
  return <Sheet visible title={title} onClose={busy ? () => {} : onClose}>{done ? <><Text style={{ color: colors.primary }}>{demoMode ? 'Indicação simulada. Nenhum contato foi enviado.' : 'Indicação registrada! Nossa equipe poderá analisar a solicitação.'}</Text><Button label="Concluir" onPress={onClose} /></> : <>
    <TextInput value={name} onChangeText={setName} placeholder={kind === 'FRIEND' ? 'Nome do amigo' : 'Nome do comércio'} placeholderTextColor={colors.muted} maxLength={100} style={inputStyle} accessibilityLabel="Nome da indicação" />
    <TextInput value={contact} onChangeText={setContact} mask="contact" placeholder="E-mail ou telefone de contato" placeholderTextColor={colors.muted} maxLength={254} autoCapitalize="none" style={inputStyle} accessibilityLabel="Contato da indicação" />
    {kind === 'FRIEND' && <Text style={{ color: colors.muted, fontSize: 12 }}>Os Zezitos serão creditados após a confirmação da associação, quando a campanha estiver ativa.</Text>}
    {error ? <Text style={{ color: colors.danger }} accessibilityRole="alert">{error}</Text> : null}
    <Button label="Enviar indicação" loading={busy} onPress={() => void submit()} />
  </>}</Sheet>;
}
