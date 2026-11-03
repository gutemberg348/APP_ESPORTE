import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import type { Match } from '@nacional/shared/types';
import { Page, Title, Button } from '../components/ui';
import { Text } from '../components/Typography';
import { TicketGatePanel } from '../components/TicketGatePanel';
import { SecurityScreen } from './SecurityScreen';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { gateApi } from '../services/gate';
import { messageOf } from '../utils/format';

export function GateScreen() {
  const { token, member, signOut } = useSession();
  const { colors } = useTheme();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [security, setSecurity] = useState(false);
  const revision = useRef(0);
  async function refresh() {
    if (!token) return;
    const current = ++revision.current;
    setLoading(true); setError('');
    try { const value = await gateApi.matches(token); if (current === revision.current) setMatches(value); }
    catch (err) { if (current === revision.current) { setError(messageOf(err)); setMatches([]); } }
    finally { if (current === revision.current) setLoading(false); }
  }
  useEffect(() => { void refresh(); return () => { revision.current++; }; }, [token]);
  if (security) return <SecurityScreen onBack={() => setSecurity(false)} />;
  return <Page refreshing={loading} onRefresh={() => void refresh()}>
    <Title title="Portaria" subtitle={`Olá, ${member?.name}. Confira cada entrada.`} action={<ShieldCheck size={28} color={colors.primary} />} />
    <Text style={{ color: colors.muted }}>Selecione o jogo e o setor da sua escala. Leia o QR pela câmera ou digite o código exibido pelo titular.</Text>
    <Button secondary label="Atualizar minha escala" loading={loading} onPress={() => void refresh()} />
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    {!loading && !error && !matches.length && <Text style={{ color: colors.gold }}>Nenhum setor liberado para sua conta. Peça ao administrador para cadastrar sua escala.</Text>}
    <TicketGatePanel matches={matches} onChanged={refresh} />
    <View style={{ gap: 12, marginTop: 16 }}><Button secondary label="Senha e sessões da minha conta" onPress={() => setSecurity(true)} /><Button secondary label="Sair da portaria" onPress={() => void signOut().catch((err) => setError(messageOf(err)))} /></View>
  </Page>;
}
