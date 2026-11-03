import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import { ChevronLeft, ShieldCheck } from 'lucide-react-native';
import type { AuthSession } from '@nacional/shared/types';
import { Page, Panel, Button, Title } from '../components/ui';
import { Text, TextInput } from '../components/Typography';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { request } from '../services/api';
import { messageOf } from '../utils/format';
export function SecurityScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const { token, demoMode, logoutAll, clearSession } = useSession();
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const [currentPassword, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const lock = useRef(false);
  const input = { padding: 14, backgroundColor: colors.soft, borderRadius: 12, color: colors.text, borderWidth: 1, borderColor: colors.border };
  async function refresh() {
    if (!token || demoMode) return;
    setLoading(true); setError('');
    try { setSessions(await request<AuthSession[]>('/auth/sessions', { token })); } catch (err) { setError(messageOf(err)); } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function perform(work: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try { await work(); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); lock.current = false; }
  }
  async function changePassword() {
    if (password.length < 10 || password.length > 128) throw new Error('Use entre 10 e 128 caracteres na nova senha.');
    if (password !== confirmation) throw new Error('A confirmação da nova senha está diferente.');
    await request('/auth/password', { token, method: 'PUT', body: { currentPassword, newPassword: password } });
    await clearSession();
  }
  return <Page refreshing={loading} onRefresh={() => void refresh()}>
    <Pressable accessibilityRole="button" onPress={onBack} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5 }}><ChevronLeft size={20} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 14 }}>Voltar</Text></Pressable>
    <Title title="Segurança" subtitle="Controle sua senha e suas sessões." action={<ShieldCheck color={colors.primary} size={28} />} />
    {demoMode ? <Text style={{ color: colors.muted }}>Entre com uma conta real para gerenciar a segurança.</Text> : <>
      <Panel style={{ gap: 14 }}><Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Alterar senha</Text><TextInput style={input} value={currentPassword} onChangeText={setCurrent} secureTextEntry placeholder="Senha atual" placeholderTextColor={colors.muted} accessibilityLabel="Senha atual" textContentType="password" maxLength={128} editable={!busy} /><TextInput style={input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Nova senha" placeholderTextColor={colors.muted} accessibilityLabel="Nova senha" textContentType="newPassword" maxLength={128} editable={!busy} /><TextInput style={input} value={confirmation} onChangeText={setConfirmation} secureTextEntry placeholder="Confirmar nova senha" placeholderTextColor={colors.muted} accessibilityLabel="Confirmar nova senha" textContentType="newPassword" maxLength={128} editable={!busy} /><Text style={{ color: colors.muted, fontSize: 14 }}>Ao alterar a senha, todas as sessões serão encerradas. Entre novamente com a nova senha.</Text><Button label="Salvar nova senha e sair" loading={busy} disabled={!currentPassword || !password || !confirmation} onPress={() => void perform(changePassword)} /></Panel>
      <Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Sessões ativas</Text>{sessions.map((session) => <Panel key={session.id} style={{ gap: 8 }}><Text style={{ color: session.current ? colors.primary : colors.text, fontWeight: '700' }}>{session.current ? 'Esta sessão' : 'Outra sessão conectada'}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Conectada em {new Date(session.createdAt).toLocaleString('pt-BR')}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Válida até {new Date(session.expiresAt).toLocaleString('pt-BR')}</Text></Panel>)}
      {confirmLogout ? <Panel style={{ gap: 14 }}><Text style={{ color: colors.text }}>Encerrar todas as sessões, incluindo esta?</Text><Button secondary label="Manter conectado" disabled={busy} onPress={() => setConfirmLogout(false)} /><Button label="Confirmar saída de todos os dispositivos" loading={busy} onPress={() => void perform(logoutAll)} /></Panel> : <Button secondary label="Sair de todos os dispositivos" disabled={busy} onPress={() => setConfirmLogout(true)} />}
    </>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
  </Page>;
}
