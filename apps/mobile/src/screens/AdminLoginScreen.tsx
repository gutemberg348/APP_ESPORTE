import React, { useRef, useState } from 'react';
import { View, Keyboard, TextInput, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ArrowRight, LockKeyhole, Mail, Moon, ScanLine, Sun, Ticket } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { Crest } from '../components/Crest';
import { AdminButton, AdminNotice, AdminToggle } from '../components/admin/AdminControls';
import { AuthField } from '../components/AuthField';
import { AdminThemeProvider } from '../theme/AdminThemeProvider';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { club } from '../config/club';
import { messageOf } from '../utils/format';
import { Sheet } from '../components/Sheet';
import { PasswordRecoveryForm } from '../components/PasswordRecoveryForm';
import { ApiConnectionHelp } from '../components/ApiConnectionHelp';
import { ApiError } from '../services/api';
import { canRememberStaff } from '../services/session-storage';
interface Props { onOpenApp: () => void; loading: boolean; bootError: string | null; onRetry: () => void }
const stations = [
  { name: 'Bilheteria', action: 'Venda e emissão de ingressos', icon: Ticket },
  { name: 'Portaria', action: 'Leitura de ingressos e registro de entrada', icon: ScanLine },
];
export function AdminLoginScreen(props: Props) { return <AdminThemeProvider><AdminLoginPage {...props} /></AdminThemeProvider>; }
function AdminLoginPage({ onOpenApp, loading, bootError, onRetry }: Props) {
  const desktop = useWindowDimensions().width >= 820, { colors, isDark, toggle } = useTheme(), { signIn } = useSession(), insets = useSafeAreaInsets();
  const emailInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const passwordInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), disabled = busy || loading || Boolean(bootError);
  const [forgot, setForgot] = useState(false);
  const [remember, setRemember] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState('');
  const emailError = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Informe o e-mail cadastrado pelo clube.' : '';
  const passwordError = password ? '' : 'Informe sua senha.';
  function recovered(message: string) { setError(''); setConnectionError(false); setConnectionNotice(message); }
  async function submit() {
    if (lock.current || loading || bootError) return;
    setSubmitted(true);
    if (emailError || passwordError) {
      (emailError ? emailInput : passwordInput).current?.focus();
      return;
    }
    Keyboard.dismiss();
    lock.current = true; setBusy(true); setError(''); setConnectionError(false); setConnectionNotice('');
    try { await signIn(email.trim().toLowerCase(), password, undefined, 'STAFF', remember); }
    catch (err) { setError(messageOf(err)); setConnectionError(err instanceof ApiError && ['API_TIMEOUT', 'API_UNREACHABLE', 'DATABASE_UNAVAILABLE', 'DATABASE_SCHEMA_OUTDATED'].includes(err.code)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: desktop ? 48 : 16 }}>
        <AdminButton label="Área do torcedor" icon={ArrowLeft} variant="ghost" disabled={busy} onPress={onOpenApp} />
        <AdminButton label={isDark ? 'Usar tema claro' : 'Usar tema escuro'} icon={isDark ? Sun : Moon} iconOnly variant="ghost" onPress={toggle} />
      </View>
      <KeyboardAwareScrollView bottomOffset={20} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: desktop ? 32 : 12, paddingVertical: 12, paddingBottom: Math.max(insets.bottom, 24) }}>
        <View style={[styles.card, { maxWidth: desktop ? 920 : 460, flexDirection: desktop ? 'row' : 'column', backgroundColor: colors.surface, borderColor: colors.border }]}>
          <LinearGradient colors={['#77192a', '#41101d']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[styles.brandPanel, desktop ? { flex: 0.9, padding: 36 } : { padding: 18 }]}>
            <View style={styles.brandRow}>
              <Crest size={desktop ? 48 : 36} height={desktop ? 48 : 36} />
              <Text style={styles.clubName}>{club.name}</Text>
            </View>
            {desktop && <View style={{ gap: 22 }}>
              {stations.map(({ name, action, icon: Icon }) => <View key={name} style={styles.station}>
                <Icon size={23} color="#fff" />
                <View style={{ flex: 1, gap: 3 }}><Text style={styles.stationName}>{name}</Text><Text style={styles.stationAction}>{action}</Text></View>
              </View>)}
            </View>}
          </LinearGradient>
          <View style={{ flex: desktop ? 1 : undefined, padding: desktop ? 36 : 20, gap: 22 }}>
          <View style={{ gap: 5 }}>
            <Text heading accessibilityRole="header" style={{ color: colors.text, fontSize: 27, lineHeight: 34, fontWeight: '700' }}>{loading ? 'Restaurando acesso' : 'Acesso da equipe'}</Text>
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>Entre com sua conta do clube. Seu cargo abre a área certa.</Text>
          </View>
          {loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Conferindo sua sessão" />
            : bootError ? <View style={{ gap: 12 }}>
              <AdminNotice tone="error">{bootError}</AdminNotice>
              <ApiConnectionHelp disabled={busy} />
              <AdminButton primary label="Tentar novamente" onPress={onRetry} />
            </View> : <View style={{ gap: 14 }}>
              <AuthField ref={emailInput} label="E-mail da equipe" value={email} onChangeText={setEmail} icon={Mail} placeholder="voce@clube.com.br"
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="username"
                textContentType="username" maxLength={254} editable={!disabled} error={submitted ? emailError : undefined} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()} />
              <AuthField ref={passwordInput} icon={LockKeyhole} label="Senha" value={password} onChangeText={setPassword} placeholder="Digite sua senha" password error={submitted ? passwordError : undefined}
                autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password"
                returnKeyType="go" maxLength={128} editable={!disabled} onSubmitEditing={() => void submit()} />
              {canRememberStaff && <AdminToggle checkbox label="Manter conectado neste aparelho"
                hint="Use em um aparelho da equipe." value={remember} onChange={setRemember} disabled={disabled} />}
              {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
              {connectionError && <ApiConnectionHelp disabled={busy} onRecovered={recovered} />}
              {!!connectionNotice && <AdminNotice tone="success">{connectionNotice}</AdminNotice>}
              <AdminButton primary size="large" label="Entrar na minha área" icon={ArrowRight} loading={busy} disabled={disabled} onPress={() => void submit()} />
              <AdminButton label="Esqueci minha senha" variant="ghost" disabled={busy} onPress={() => setForgot(true)} />
            </View>}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
    {forgot && <Sheet visible title="Recuperar acesso" onClose={() => setForgot(false)}>
      <PasswordRecoveryForm initialEmail={email} portal="ADMIN" onDone={() => setForgot(false)} />
    </Sheet>}
  </View>;
}
const styles = StyleSheet.create({
  card: { width: '100%', borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  brandPanel: { justifyContent: 'space-between', gap: 24 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clubName: { color: '#fff', flexShrink: 1, fontSize: 16, fontWeight: '700' },
  station: { flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderColor: '#ffffff38', paddingTop: 18 },
  stationName: { color: '#fff', fontSize: 19, lineHeight: 25, fontWeight: '700' },
  stationAction: { color: '#ffe4e6', fontSize: 13, lineHeight: 19 },
});
