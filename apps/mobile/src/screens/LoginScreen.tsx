import { captureInitialInvitation, readInvitation } from '../services/invitation';
import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, Platform, Keyboard, ActivityIndicator, TextInput as NativeInput } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mail, LockKeyhole, UserRound, ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '../components/Typography';
import { AuthField } from '../components/AuthField';
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
import type { SocialProvider } from '../services/social-login-core';

function ProviderMark({ provider }: { provider: SocialProvider }) {
  return provider === 'google' ? <Svg width={20} height={20} viewBox="0 0 48 48"><Path fill="#4285F4" d="M43.6 20.5H24v8h11.3C33.9 34.1 29.2 37 24 37a13 13 0 1 1 8.6-22.7l6-6A21 21 0 1 0 45 24c0-1.2-.5-2.4-1.4-3.5Z" /><Path fill="#34A853" d="M24 45c5.6 0 10.4-1.8 14-5.1l-6.8-5.3A13 13 0 0 1 11.7 28l-7 5.5A21 21 0 0 0 24 45Z" /><Path fill="#FBBC05" d="M11.7 28a13 13 0 0 1 0-8l-7-5.5a21 21 0 0 0 0 19Z" /><Path fill="#EA4335" d="M24 11c3.2 0 6.2 1.2 8.6 3.3l6-6A21 21 0 0 0 4.7 14.5l7 5.5A13 13 0 0 1 24 11Z" /></Svg> : <Svg width={20} height={23} viewBox="0 0 24 24"><Path fill="#111111" d="M17.05 12.54c.03 3.24 2.84 4.32 2.87 4.33-.02.08-.45 1.54-1.48 3.05-.9 1.3-1.83 2.6-3.3 2.63-1.44.03-1.9-.85-3.55-.85-1.64 0-2.15.82-3.51.88-1.42.05-2.5-1.42-3.4-2.72-1.85-2.67-3.26-7.55-1.36-10.85a5.27 5.27 0 0 1 4.46-2.7c1.4-.03 2.73.95 3.58.95.85 0 2.44-1.18 4.12-1.01.7.03 2.66.28 3.92 2.12-.1.06-2.34 1.36-2.31 4.17ZM14.35 3.48c.75-.9 1.26-2.15 1.12-3.4-1.08.04-2.39.72-3.17 1.62-.7.8-1.31 2.08-1.14 3.3 1.2.1 2.43-.61 3.19-1.52Z" /></Svg>;
}

export function LoginScreen({ onAdminLogin, gateOnly = false }: { onAdminLogin?: () => void; gateOnly?: boolean }) {
  const { colors } = useTheme();
  const { signIn, signInSocial } = useSession();
  const insets = useSafeAreaInsets();
  const emailRef = useRef<React.ComponentRef<typeof NativeInput>>(null), passwordRef = useRef<React.ComponentRef<typeof NativeInput>>(null);
  const [registerRequested, setRegister] = useState(false);
  const [invited, setInvited] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!gateOnly) void captureInitialInvitation().then(readInvitation).then(code => { if (alive && code) { setInvited(true); setRegister(true); } });
    return () => { alive = false; };
  }, [gateOnly]);
  const registering = registerRequested && !gateOnly;
  const [forgot, setForgot] = useState(false);
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [providerBusy, setProviderBusy] = useState<SocialProvider | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [connectionError, setConnectionError] = useState(false), [connectionNotice, setConnectionNotice] = useState('');
  const locked = busy || !!providerBusy;
  const fields = { name: registering && name.trim().length < 2 ? 'Informe seu nome completo.' : '', email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Informe um e-mail válido.' : '', password: !password ? 'Informe sua senha.' : registering && password.length < 10 ? 'Use pelo menos 10 caracteres.' : '' };
  function clearFeedback() { setError(''); setConnectionError(false); setConnectionNotice(''); }
  function showError(err: unknown) {
    setError(messageOf(err));
    setConnectionError(err instanceof ApiError && ['API_TIMEOUT', 'API_UNREACHABLE', 'INVALID_API_RESPONSE', 'API_PROXY_ERROR', 'DATABASE_UNAVAILABLE', 'DATABASE_SCHEMA_OUTDATED'].includes(err.code));
  }
  function toggleForm() { Keyboard.dismiss(); setRegister(value => !value); setPassword(''); setSubmitted(false); clearFeedback(); }
  async function submit() {
    if (locked) return;
    setSubmitted(true); clearFeedback();
    if (Object.values(fields).some(Boolean)) return;
    Keyboard.dismiss(); setBusy(true);
    try { await signIn(email.trim().toLowerCase(), password, registering ? name.trim() : undefined, gateOnly ? 'GATE' : 'APP'); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  }
  async function social(provider: SocialProvider) {
    if (locked) return;
    Keyboard.dismiss(); clearFeedback(); setProviderBusy(provider);
    try { await signInSocial(provider); } catch (err) { showError(err); } finally { setProviderBusy(null); }
  }
  return <KeyboardAwareScrollView bottomOffset={28} extraKeyboardSpace={20} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: Math.max(insets.bottom, 20) + 12 }}>
    <View style={{ width: '100%', maxWidth: 420, alignSelf: 'center', gap: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {registering && <Pressable onPress={toggleForm} disabled={locked} accessibilityRole="button" accessibilityLabel="Voltar para entrar" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 14 }}><ArrowLeft color={colors.text} size={20} /></Pressable>}
        <Crest size={48} />
        <View style={{ flex: 1 }}><Text heading style={{ fontWeight: '800', color: colors.text, fontSize: 17, lineHeight: 24 }}>{club.programName}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17 }}>{club.name}</Text></View>
      </View>
      {invited && registering && <Text style={{ color: colors.primary, fontSize: 13 }}>Você chegou por um convite. Sua indicação será registrada ao criar a conta.</Text>}
      <View style={{ gap: 8, paddingTop: 8 }}>
        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 11, letterSpacing: 1.8 }}>{gateOnly ? 'EQUIPE DE PORTARIA' : 'JUNTOS PELO TIME'}</Text>
        <Text heading accessibilityRole="header" style={{ fontSize: 30, lineHeight: 39, fontWeight: '800', letterSpacing: -0.8, color: colors.text }}>{registering ? 'Sua torcida começa aqui.' : gateOnly ? 'Entrar na portaria' : 'Bom ter você aqui.'}</Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 22 }}>{registering ? 'Crie sua conta para acompanhar o time, garantir ingressos e aproveitar os benefícios.' : gateOnly ? 'Use a conta cadastrada pela administração.' : 'Entre para acessar seus ingressos e ficar mais perto do seu time.'}</Text>
      </View>
      <View style={{ gap: 17 }}>
        {registering && <AuthField label="Nome completo" icon={UserRound} value={name} onChangeText={setName} placeholder="Como você se chama?" textContentType="name" autoComplete="name" autoCapitalize="words" maxLength={100} editable={!locked} error={submitted ? fields.name : ''} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => emailRef.current?.focus()} />}
        <AuthField ref={emailRef} label="E-mail" icon={Mail} value={email} onChangeText={setEmail} placeholder="voce@exemplo.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" maxLength={254} editable={!locked} error={submitted ? fields.email : ''} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordRef.current?.focus()} />
        <AuthField key={registering ? 'new-password' : 'password'} ref={passwordRef} label={registering ? 'Crie sua senha' : 'Senha'} icon={LockKeyhole} password value={password} onChangeText={setPassword} placeholder={registering ? 'Pelo menos 10 caracteres' : 'Digite sua senha'} autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType={registering ? 'newPassword' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} maxLength={128} editable={!locked} error={submitted ? fields.password : ''} hint={registering ? 'Use uma senha exclusiva. Toque no olho para conferir.' : undefined} returnKeyType="done" onSubmitEditing={() => void submit()} />
        {!registering && <Pressable disabled={locked} onPress={() => setForgot(true)} accessibilityRole="button" style={{ alignSelf: 'flex-end', paddingVertical: 10, paddingLeft: 16, minHeight: 44 }}><Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>Esqueci minha senha</Text></Pressable>}
        {!!error && <View accessibilityRole="alert" style={{ borderWidth: 1, borderColor: colors.danger, borderRadius: 12, padding: 13, gap: 8 }}><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><AlertCircle size={17} color={colors.danger} /><Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>Não foi possível continuar</Text></View><Text style={{ color: colors.danger, fontSize: 13, lineHeight: 20 }}>{error}</Text></View>}
        {connectionError && <ApiConnectionHelp disabled={locked} onRecovered={message => { clearFeedback(); setConnectionNotice(message); }} />}
        {!!connectionNotice && <Text style={{ color: colors.primary, fontSize: 13 }} accessibilityRole="alert">{connectionNotice}</Text>}
        <Button label={registering ? 'Criar minha conta' : 'Entrar na minha conta'} loading={busy} disabled={!!providerBusy} onPress={() => void submit()} />
      </View>
      {!gateOnly && Platform.OS !== 'web' && <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1, height: 1, backgroundColor: colors.border }} /><Text style={{ fontSize: 12, color: colors.muted }}>ou continue com</Text><View style={{ flex: 1, height: 1, backgroundColor: colors.border }} /></View>
        {(['google', 'apple'] as const).map(provider => <Pressable key={provider} disabled={locked} accessibilityRole="button" accessibilityLabel={`Continuar com ${provider === 'google' ? 'Google' : 'Apple'}`} onPress={() => void social(provider)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 52, padding: 12, backgroundColor: '#ffffff', borderColor: '#e4e4e7', borderWidth: 1, borderRadius: 14, opacity: locked ? 0.6 : pressed ? 0.85 : 1 })}>{providerBusy === provider ? <ActivityIndicator color="#111111" /> : <ProviderMark provider={provider} />}<Text style={{ color: '#171717', fontSize: 14, fontWeight: '600' }}>Continuar com {provider === 'google' ? 'Google' : 'Apple'}</Text></Pressable>)}
      </View>}
      {!gateOnly && <Pressable disabled={locked} onPress={toggleForm} accessibilityRole="button" style={{ paddingVertical: 12, minHeight: 46, alignItems: 'center' }}><Text style={{ color: colors.muted, fontSize: 14 }}>{registering ? 'Já tem uma conta? ' : 'Ainda não tem conta? '}<Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>{registering ? 'Entrar' : 'Cadastre-se'}</Text></Text></Pressable>}
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 }}><ShieldCheck color={colors.muted} size={15} /><Text style={{ fontSize: 11, color: colors.muted }}>Seu acesso ao {club.shortName}, em um só lugar.</Text></View>
      {onAdminLogin && <Pressable disabled={locked} onPress={onAdminLogin} style={{ padding: 12, alignItems: 'center' }} accessibilityRole="link"><Text style={{ color: colors.muted, fontSize: 12 }}>Acessar painel administrativo</Text></Pressable>}
    </View>
    {forgot && <Sheet visible title="Recuperar senha" onClose={() => setForgot(false)}><PasswordRecoveryForm initialEmail={email} onDone={() => setForgot(false)} /></Sheet>}
  </KeyboardAwareScrollView>;
}
