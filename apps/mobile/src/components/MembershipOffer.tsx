import React from 'react';
import { View } from 'react-native';
import { Crown } from 'lucide-react-native';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Typography';
import { Button, Panel } from './ui';
export function MembershipOffer({ onOpen }: { onOpen: () => void }) {
  const { member } = useSession(), { colors } = useTheme();
  if (member?.membership?.status === 'ACTIVE' && Date.parse(member.membership.validUntil) > Date.now()) return null;
  return <Panel style={{ borderColor: colors.primary, backgroundColor: colors.primarySoft, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Crown size={28} color={colors.gold} /><Text heading style={{ color: colors.text, fontSize: 23, fontWeight: '800', flex: 1 }}>Seja sócio do Esporte</Text></View>
    <Text style={{ color: colors.muted, fontSize: 14 }}>Sua paixão fortalece o time. Conheça os planos, confira as vantagens e ative sua carteirinha pelo Pix.</Text>
    <Button label="Quero ser sócio" onPress={onOpen} />
  </Panel>;
}
