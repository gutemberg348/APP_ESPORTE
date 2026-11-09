import React, { useRef, useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowRight, ArrowUpRight, CalendarDays, Mail, Moon, Sun, Ticket, Users } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { Crest } from '../components/Crest';
import { AdminButton, AdminField, AdminNotice } from '../components/admin/AdminControls';
import { AdminThemeProvider } from '../theme/AdminThemeProvider';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { club } from '../config/club';
import { messageOf } from '../utils/format';
import { Sheet } from '../components/Sheet';
import { PasswordRecoveryForm } from '../components/PasswordRecoveryForm';
interface Props { onOpenApp: () => void; loading: boolean; bootError: string | null; onRetry: () => void }
export function AdminLoginScreen(props: Props) { return <AdminThemeProvider><AdminLoginPage {...props} /></AdminThemeProvider>; }
function AdminLoginPage({ onOpenApp, loading, bootError, onRetry }: Props) {
  const desktop = useWindowDimensions().width >= 1000, { colors, isDark, toggle } = useTheme(), { signIn } = useSession(), insets = useSafeAreaInsets();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), disabled = busy || loading || Boolean(bootError);
  const [forgot, setForgot] = useState(false);
  async function submit() {
    if (lock.current || loading || bootError) return;
    if (!email.trim() || !password) { setError('Preencha seu e-mail e sua senha.'); return; }
    lock.current = true; setBusy(true); setError('');
    try { await signIn(email.trim().toLowerCase(), password, undefined, 'ADMIN'); }
    catch (err) { setError(messageOf(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.surface }}><StatusBar style={isDark ? 'light' : 'dark'} /><View style={{ flex: 1, flexDirection: desktop ? 'row' : 'column', paddingTop: insets.top }}>
    {desktop && <View style={{ width: '44%', backgroundColor: colors.background, borderRightWidth: 1, borderColor: colors.border, padding: 48, justifyContent: 'space-between' }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Crest size={36} height={36} /><View><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{club.name}</Text><Text style={{ color: colors.subtle, fontSize: 11 }}>Portal administrativo</Text></View></View><View style={{ maxWidth: 360, gap: 20, paddingVertical: 32 }}><View style={{ width: 30, height: 3, borderRadius: 2, backgroundColor: colors.primary }} /><Text heading style={{ color: colors.text, fontSize: 37, lineHeight: 48, fontWeight: '600', letterSpacing: -1.2 }}>A gestão do clube,{ '\n' }em um só lugar.</Text><Text style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}>Da próxima partida à entrada da torcida. Organize a operação com clareza.</Text><View style={{ gap: 0, marginTop: 12 }}>{[{ icon: CalendarDays, title: 'Jogos e setores', detail: 'Agenda, preços e disponibilidade' }, { icon: Ticket, title: 'Vendas e pagamentos', detail: 'Pedidos, Pix e conciliação' }, { icon: Users, title: 'Equipe e portaria', detail: 'Escalas, entradas e protocolos' }].map(({ icon: Icon, title, detail }) => <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 17, borderBottomWidth: 1, borderColor: colors.border }}><Icon size={19} color={colors.muted} strokeWidth={1.5} /><View style={{ gap: 3 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '500' }}>{title}</Text><Text style={{ color: colors.subtle, fontSize: 11 }}>{detail}</Text></View></View>)}</View></View><Text style={{ color: colors.subtle, fontSize: 11 }}>Acesso exclusivo à equipe autorizada.</Text></View>}
    <View style={{ flex: 1, minWidth: 0 }}><View style={{ minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: desktop ? 36 : 20 }}><Text style={{ color: colors.muted, fontSize: 12 }}>{desktop ? 'Administração' : club.shortName}</Text><AdminButton label={isDark ? 'Usar tema claro' : 'Usar tema escuro'} icon={isDark ? Sun : Moon} iconOnly variant="ghost" onPress={toggle} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: desktop ? 40 : 24, paddingBottom: Math.max(insets.bottom, 32) }}><View style={{ width: '100%', maxWidth: 380, gap: 28 }}><View style={{ gap: 8 }}><Text heading accessibilityRole="header" style={{ color: colors.text, fontSize: 28, lineHeight: 38, fontWeight: '600', letterSpacing: -0.8 }}>{loading ? 'Restaurando acesso' : 'Entrar no painel'}</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 22 }}>Use sua conta administrativa para continuar.</Text></View>
      {loading ? <View style={{ gap: 12, paddingVertical: 28 }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>Conferindo sua sessão…</Text></View> : bootError ? <><AdminNotice tone="error">{bootError}</AdminNotice><AdminButton primary label="Tentar restaurar acesso" onPress={onRetry} /></> : <View style={{ gap: 18 }}><AdminField label="E-mail" value={email} onChange={setEmail} icon={Mail} placeholder="voce@clube.com.br" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={254} editable={!disabled} onSubmitEditing={() => void submit()} /><AdminField label="Senha" value={password} onChange={setPassword} placeholder="Digite sua senha" secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" returnKeyType="go" maxLength={128} editable={!disabled} onSubmitEditing={() => void submit()} />{!!error && <AdminNotice tone="error">{error}</AdminNotice>}<AdminButton primary label="Entrar no painel" icon={ArrowRight} loading={busy} disabled={disabled} fullWidth onPress={() => void submit()} /><Text style={{ color: colors.subtle, fontSize: 11, lineHeight: 19 }}>Para obter acesso, fale com o responsável pelo clube.</Text></View>}
      <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 20, gap: 7 }}><Text style={{ color: colors.subtle, fontSize: 11 }}>Ingressos e benefícios para você?</Text><View style={{ alignSelf: 'flex-start' }}><AdminButton label="Abrir área do torcedor" icon={ArrowUpRight} variant="ghost" disabled={busy} onPress={onOpenApp} /></View></View>
      <AdminButton label="Esqueci minha senha" variant="ghost" disabled={busy || loading} onPress={() => setForgot(true)} />
      {forgot && <Sheet visible title="Recuperar acesso ao painel" onClose={() => setForgot(false)}><PasswordRecoveryForm initialEmail={email} portal="ADMIN" onDone={() => setForgot(false)} /></Sheet>}
    </View></ScrollView></View>
  </View></KeyboardAvoidingView>;
}
