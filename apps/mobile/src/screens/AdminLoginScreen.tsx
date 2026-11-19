import React, { useRef, useState } from 'react';
import { View, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowLeft, ArrowRight, Mail, Moon, ShieldCheck, Sun } from 'lucide-react-native';
import { Text } from '../components/Typography';
import { Crest } from '../components/Crest';
import { AdminButton, AdminField, AdminNotice, AdminToggle } from '../components/admin/AdminControls';
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
export function AdminLoginScreen(props: Props) { return <AdminThemeProvider><AdminLoginPage {...props} /></AdminThemeProvider>; }
function AdminLoginPage({ onOpenApp, loading, bootError, onRetry }: Props) {
  const desktop = useWindowDimensions().width >= 1000, { colors, isDark, toggle } = useTheme(), { signIn } = useSession(), insets = useSafeAreaInsets();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), disabled = busy || loading || Boolean(bootError);
  const [forgot, setForgot] = useState(false);
  const [remember, setRemember] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState('');
  function recovered(message: string) { setError(''); setConnectionError(false); setConnectionNotice(message); }
  async function submit() {
    if (lock.current || loading || bootError) return;
    if (!email.trim() || !password) { setError('Preencha seu e-mail e sua senha.'); return; }
    lock.current = true; setBusy(true); setError(''); setConnectionError(false); setConnectionNotice('');
    try { await signIn(email.trim().toLowerCase(), password, undefined, 'STAFF', remember); }
    catch (err) { setError(messageOf(err)); setConnectionError(err instanceof ApiError && ['API_TIMEOUT', 'API_UNREACHABLE', 'DATABASE_UNAVAILABLE', 'DATABASE_SCHEMA_OUTDATED'].includes(err.code)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.background }}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <View style={{ flex: 1, paddingTop: insets.top }}>
      <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: desktop ? 48 : 16 }}>
        <AdminButton label="Área do torcedor" icon={ArrowLeft} variant="ghost" disabled={busy} onPress={onOpenApp} />
        <AdminButton label={isDark ? 'Usar tema claro' : 'Usar tema escuro'} icon={isDark ? Sun : Moon} iconOnly variant="ghost" onPress={toggle} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 24) }}>
        <View style={{ width: '100%', maxWidth: 460, gap: 22, padding: desktop ? 32 : 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Crest size={46} height={46} />
            <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 13, fontWeight: '600', flex: 1 }}>{club.name}</Text>
            <ShieldCheck size={21} color={colors.primary} />
          </View>
          <View style={{ gap: 5 }}>
            <Text heading accessibilityRole="header" style={{ color: colors.text, fontSize: 27, lineHeight: 34, fontWeight: '700' }}>{loading ? 'Restaurando acesso' : 'Acesso da equipe'}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20 }}>Use a mesma conta da portaria, bilheteria ou administração.</Text>
          </View>
          {loading ? <ActivityIndicator color={colors.primary} accessibilityLabel="Conferindo sua sessão" />
            : bootError ? <View style={{ gap: 12 }}>
              <AdminNotice tone="error">{bootError}</AdminNotice>
              <ApiConnectionHelp disabled={busy} />
              <AdminButton primary label="Tentar novamente" onPress={onRetry} />
            </View> : <View style={{ gap: 14 }}>
              <AdminField label="E-mail" value={email} onChange={setEmail} icon={Mail} placeholder="voce@clube.com.br"
                keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="username"
                textContentType="username" maxLength={254} editable={!disabled} onSubmitEditing={() => void submit()} />
              <AdminField label="Senha" value={password} onChange={setPassword} placeholder="Digite sua senha" secureTextEntry
                autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password"
                returnKeyType="go" maxLength={128} editable={!disabled} onSubmitEditing={() => void submit()} />
              {canRememberStaff && <AdminToggle checkbox label="Manter conectado neste aparelho"
                hint="Use em um aparelho da equipe." value={remember} onChange={setRemember} disabled={disabled} />}
              {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
              {connectionError && <ApiConnectionHelp disabled={busy} onRecovered={recovered} />}
              {!!connectionNotice && <AdminNotice tone="success">{connectionNotice}</AdminNotice>}
              <AdminButton primary label="Entrar" icon={ArrowRight} loading={busy} disabled={disabled} onPress={() => void submit()} />
              <AdminButton label="Esqueci minha senha" variant="ghost" disabled={busy} onPress={() => setForgot(true)} />
            </View>}
        </View>
      </ScrollView>
    </View>
    {forgot && <Sheet visible title="Recuperar acesso" onClose={() => setForgot(false)}>
      <PasswordRecoveryForm initialEmail={email} portal="ADMIN" onDone={() => setForgot(false)} />
    </Sheet>}
  </KeyboardAvoidingView>;
}
