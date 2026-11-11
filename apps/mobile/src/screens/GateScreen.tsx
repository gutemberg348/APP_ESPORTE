import React, { useState } from 'react';
import { View } from 'react-native';
import { Page, Title, Button } from '../components/ui';
import { Text } from '../components/Typography';
import { GateV1Panel } from '../components/GateV1Panel';
import { SecurityScreen } from './SecurityScreen';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { messageOf } from '../utils/format';
export function GateScreen() {
  const { member, signOut } = useSession(), { colors } = useTheme();
  const [security, setSecurity] = useState(false), [error, setError] = useState('');
  if (security) return <SecurityScreen onBack={() => setSecurity(false)} />;
  return <Page><Title title="Portaria" subtitle={`Olá, ${member?.name}. Confira cada entrada.`} /><GateV1Panel />
    <View style={{ gap: 12 }}><Button secondary label="Senha e sessões da minha conta" onPress={() => setSecurity(true)} /><Button secondary label="Sair da portaria" onPress={() => void signOut().catch((err) => setError(messageOf(err)))} /></View>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
  </Page>;
}
