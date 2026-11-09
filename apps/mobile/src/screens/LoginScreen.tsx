import React, { useState } from 'react';
import { View, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { Text, TextInput } from '../components/Typography';
import { Crest } from '../components/Crest';
import { Button } from '../components/ui';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { messageOf } from '../utils/format';
import { club } from '../config/club';
import { Sheet } from '../components/Sheet';
import { PasswordRecoveryForm } from '../components/PasswordRecoveryForm';
import { ApiConnectionHelp } from '../components/ApiConnectionHelp';
import { ApiError } from '../services/api';
export function LoginScreen({ onAdminLogin }: { onAdminLogin?: () => void }) {
  const { colors } = useTheme();
  const { signIn } = useSession();
  const [register, setRegister] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  async function submit() {
    if (busy) return;
    if (!email.trim() || !password || (register && (name.trim().length < 2 || password.length < 10))) { setError(register ? 'Informe seu nome, e-mail e uma senha de pelo menos 10 caracteres.' : 'Informe seu e-mail e senha.'); return; }
    setBusy(true); setError(''); setConnectionError(false);
    try { await signIn(email.trim().toLowerCase(), password, register ? name.trim() : undefined); }
    catch (err) { setError(messageOf(err)); setConnectionError(err instanceof ApiError && ['API_TIMEOUT', 'API_UNREACHABLE', 'DATABASE_UNAVAILABLE', 'DATABASE_SCHEMA_OUTDATED'].includes(err.code)); }
    finally { setBusy(false); }
  }
  const input = { padding: 16, borderRadius: 12, backgroundColor: colors.surface, color: colors.text, borderWidth: 1, borderColor: colors.border };
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 24, flexGrow: 1, justifyContent: 'center', gap: 16 }}>
    <View style={{ alignItems: 'center', gap: 14, marginBottom: 16 }}><Crest size={96} /><Text heading accessibilityRole="header" style={{ color: colors.text, fontSize: 28, lineHeight: 40, paddingVertical: 2, fontWeight: '800', textAlign: 'center', alignSelf: 'stretch' }}>{club.programName.toUpperCase()}</Text><Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' }}>{register ? 'Faça parte da nossa torcida.' : `${club.name}, sempre com você.`}</Text></View>
    {register && <TextInput value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor={colors.muted} textContentType="name" maxLength={100} editable={!busy} style={input} accessibilityLabel="Nome completo" />}
    <TextInput value={email} onChangeText={setEmail} placeholder="E-mail" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" maxLength={254} editable={!busy} style={input} accessibilityLabel="E-mail" />
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
      <TextInput value={password} onChangeText={setPassword} placeholder="Senha" placeholderTextColor={colors.muted} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType={register ? 'newPassword' : 'password'} maxLength={128} editable={!busy} style={{ flex: 1, minWidth: 0, color: colors.text, padding: 16 }} accessibilityLabel="Senha" />
      <Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'} disabled={busy} onPress={() => setShowPassword((value) => !value)} hitSlop={4} style={{ width: 48, minHeight: 52, alignItems: 'center', justifyContent: 'center' }}>{showPassword ? <EyeOff size={21} color={colors.muted} /> : <Eye size={21} color={colors.muted} />}</Pressable>
    </View>
    {register && <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>Use uma senha com pelo menos 10 caracteres.</Text>}
    {error ? <Text style={{ color: colors.danger }} accessibilityRole="alert">{error}</Text> : null}
    {connectionError && <ApiConnectionHelp disabled={busy} />}
    <Button label={register ? 'Criar conta' : 'Entrar'} loading={busy} onPress={() => void submit()} />
    {!register && <Pressable disabled={busy} onPress={() => setForgot(true)} accessibilityRole="button" style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: colors.muted, fontSize: 13 }}>Esqueci minha senha</Text></Pressable>}
    {forgot && <Sheet visible title="Recuperar senha" onClose={() => setForgot(false)}><PasswordRecoveryForm initialEmail={email} onDone={() => setForgot(false)} /></Sheet>}
    <Pressable disabled={busy} onPress={() => { setRegister((value) => !value); setPassword(''); setShowPassword(false); setError(''); setConnectionError(false); }} style={{ padding: 16, alignItems: 'center' }} accessibilityRole="button"><Text style={{ color: colors.primary }}>{register ? 'Já tenho uma conta' : 'Quero me cadastrar'}</Text></Pressable>
    {onAdminLogin && <Pressable disabled={busy} onPress={onAdminLogin} style={{ padding: 12, alignItems: 'center' }} accessibilityRole="link"><Text style={{ color: colors.muted, fontSize: 12 }}>Acessar painel administrativo</Text></Pressable>}
  </ScrollView></KeyboardAvoidingView>;
}
