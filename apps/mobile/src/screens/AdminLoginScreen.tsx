import React, { useRef, useState } from 'react';
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ArrowRight, ArrowUpRight, Building2, CalendarDays, Eye, EyeOff, LockKeyhole, Mail, Moon, ShieldCheck, Sun, Ticket, Users } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput } from '../components/Typography';
import { Crest } from '../components/Crest';
import { Button } from '../components/ui';
import { AdminThemeProvider } from '../theme/AdminThemeProvider';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { club } from '../config/club';
import { messageOf } from '../utils/format';

interface Props { onOpenApp: () => void; loading: boolean; bootError: string | null; onRetry: () => void }
export function AdminLoginScreen(props: Props) {
  return <AdminThemeProvider><AdminLoginPage {...props} /></AdminThemeProvider>;
}

function AdminLoginPage({ onOpenApp, loading, bootError, onRetry }: Props) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const { colors, isDark, toggle } = useTheme();
  const { signIn } = useSession();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function submit() {
    if (lock.current || loading || bootError) return;
    if (!email.trim() || !password) { setError('Informe seu e-mail administrativo e sua senha.'); return; }
    lock.current = true; setBusy(true); setError('');
    try { await signIn(email.trim().toLowerCase(), password, undefined, 'ADMIN'); }
    catch (err) { setError(messageOf(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  const field = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, minHeight: 52, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingLeft: 14 };
  const formDisabled = busy || loading || !!bootError;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <View style={{ flex: 1, flexDirection: desktop ? 'row' : 'column', paddingTop: insets.top }}>
      {desktop && <LinearGradient colors={[club.dark.primaryEnd, club.dark.primaryStrong]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: '45%', maxWidth: 720, overflow: 'hidden' }}>
        <View pointerEvents="none" style={{ position: 'absolute', width: 500, height: 500, borderRadius: 250, borderWidth: 1, borderColor: '#ffffff12', right: -270, top: -160 }} />
        <View pointerEvents="none" style={{ position: 'absolute', width: 650, height: 650, borderRadius: 325, borderWidth: 1, borderColor: '#ffffff12', left: -350, bottom: -350 }} />
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: width >= 1400 ? 56 : 38, gap: 42, justifyContent: 'space-between' }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 13, alignItems: 'center' }}><View style={{ padding: 7, borderRadius: 12, backgroundColor: '#ffffff' }}><Crest size={38} height={38} /></View><View style={{ flex: 1 }}><Text style={{ color: '#ffffff', fontSize: 16, lineHeight: 24, fontWeight: '600' }}>{club.name}</Text><Text style={{ color: '#ffffffb8', fontSize: 11, letterSpacing: 0.7 }}>PORTAL ADMINISTRATIVO</Text></View></View>
          <View style={{ gap: 24, paddingVertical: 12, maxWidth: 420 }}>
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 6, backgroundColor: '#ffffff14', paddingHorizontal: 10, paddingVertical: 5 }}><Building2 size={14} color="#ffffffdd" /><Text style={{ color: '#ffffffdd', fontSize: 10, letterSpacing: 0.8, fontWeight: '500' }}>GESTÃO DO CLUBE</Text></View>
            <Text heading style={{ color: '#ffffff', fontSize: width >= 1400 ? 46 : 38, lineHeight: width >= 1400 ? 57 : 49, fontWeight: '700', letterSpacing: -1.7 }}>Seu clube.{ '\n' }Sua operação.{ '\n' }Tudo em um só lugar.</Text>
            <Text style={{ color: '#ffffffc9', fontSize: 14, lineHeight: 24, maxWidth: 355 }}>Organize as partidas, acompanhe as vendas e cuide de cada detalhe da experiência da torcida.</Text>
            <View style={{ marginTop: 12, gap: 17 }}>{[
              { icon: CalendarDays, title: 'Partidas e setores', description: 'Agenda, preços e disponibilidade.' },
              { icon: Ticket, title: 'Vendas e ingressos', description: 'Pedidos e conferência de pagamentos.' },
              { icon: Users, title: 'Equipe e portaria', description: 'Funcionários, escalas e entradas.' },
            ].map(({ icon: Icon, title, description }) => <View key={title} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><View style={{ width: 38, height: 38, borderRadius: 9, backgroundColor: '#ffffff12', borderWidth: 1, borderColor: '#ffffff16', alignItems: 'center', justifyContent: 'center' }}><Icon size={18} color="#ffffffdf" strokeWidth={1.6} /></View><View style={{ flex: 1 }}><Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600', lineHeight: 20 }}>{title}</Text><Text style={{ color: '#ffffffb3', fontSize: 11, lineHeight: 19 }}>{description}</Text></View></View>)}</View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', borderTopWidth: 1, borderColor: '#ffffff24', paddingTop: 20 }}><ShieldCheck size={16} color="#ffffffba" /><Text style={{ color: '#ffffffba', fontSize: 11, lineHeight: 19 }}>Acesso exclusivo à administração do clube.</Text></View>
        </ScrollView>
      </LinearGradient>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ minHeight: 76, paddingHorizontal: desktop ? 38 : 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Building2 size={20} color={colors.primary} /><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Administração</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'} onPress={toggle} style={{ width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>{isDark ? <Sun size={18} color={colors.muted} /> : <Moon size={18} color={colors.muted} />}</Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: desktop ? 38 : 20, paddingBottom: Math.max(insets.bottom, 28) }}>
          <View style={{ width: '100%', maxWidth: 430, gap: 30 }}>
            <View style={{ gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><LockKeyhole size={22} color={colors.primary} strokeWidth={1.7} /></View>
              <Text heading accessibilityRole="header" style={{ color: colors.text, fontSize: desktop ? 30 : 27, lineHeight: 40, fontWeight: '700', letterSpacing: -0.9 }}>{loading ? 'Restaurando seu acesso' : 'Bem-vindo ao painel'}</Text>
              <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 22 }}>{desktop ? 'Entre com sua conta administrativa para continuar.' : `${club.name}. Entre com sua conta administrativa.`}</Text>
            </View>
            {loading ? <View style={{ paddingVertical: 35, gap: 14, alignItems: 'center' }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.muted, fontSize: 12 }}>Conferindo sua sessão…</Text></View> : bootError ? <View style={{ gap: 16, padding: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}><Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{bootError}</Text><Button label="Tentar restaurar o acesso" onPress={onRetry} /></View> : <View style={{ gap: 20 }}>
              <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '500' }}>E-mail administrativo</Text><View style={field}><Mail size={18} color={colors.subtle} /><TextInput accessibilityLabel="E-mail administrativo" value={email} onChangeText={setEmail} editable={!formDisabled} placeholder="voce@clube.com.br" placeholderTextColor={colors.subtle} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" maxLength={254} onSubmitEditing={() => void submit()} style={{ flex: 1, minWidth: 0, paddingVertical: 14, paddingRight: 14, color: colors.text, fontSize: 14 }} /></View></View>
              <View style={{ gap: 7 }}><Text style={{ color: colors.text, fontSize: 12, fontWeight: '500' }}>Senha</Text><View style={field}><LockKeyhole size={18} color={colors.subtle} /><TextInput accessibilityLabel="Senha administrativa" value={password} onChangeText={setPassword} editable={!formDisabled} placeholder="Digite sua senha" placeholderTextColor={colors.subtle} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" spellCheck={false} textContentType="password" maxLength={128} returnKeyType="go" onSubmitEditing={() => void submit()} style={{ flex: 1, minWidth: 0, paddingVertical: 14, color: colors.text, fontSize: 14 }} /><Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'} disabled={formDisabled} onPress={() => setShowPassword((value) => !value)} style={{ width: 46, height: 50, alignItems: 'center', justifyContent: 'center' }}>{showPassword ? <EyeOff size={18} color={colors.muted} /> : <Eye size={18} color={colors.muted} />}</Pressable></View></View>
              {!!error && <View style={{ backgroundColor: `${colors.danger}0c`, borderRadius: 8, padding: 12 }}><Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 12, lineHeight: 21 }}>{error}</Text></View>}
              <Pressable accessibilityRole="button" disabled={formDisabled} onPress={() => void submit()} style={({ pressed }) => ({ minHeight: 51, padding: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.primaryStrong, borderRadius: 9, opacity: busy ? 0.6 : pressed ? 0.85 : 1 })}>{busy ? <ActivityIndicator color={colors.onPrimary} /> : <><Text style={{ color: colors.onPrimary, fontSize: 13, fontWeight: '600' }}>Entrar no painel</Text><ArrowRight size={17} color={colors.onPrimary} /></>}</Pressable>
              <Text style={{ color: colors.subtle, fontSize: 11, lineHeight: 19 }}>Precisa de acesso? Solicite uma conta ao responsável pelo clube.</Text>
            </View>}
            <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 20, gap: 8 }}><Text style={{ color: colors.subtle, fontSize: 11 }}>Procurando ingressos e benefícios?</Text><Pressable accessibilityRole="link" onPress={onOpenApp} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 32 }}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: '500' }}>Abrir área do torcedor</Text><ArrowUpRight size={14} color={colors.primary} /></Pressable></View>
          </View>
        </ScrollView>
      </View>
    </View>
  </KeyboardAvoidingView>;
}
