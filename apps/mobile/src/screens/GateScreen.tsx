import { MembershipCardCheck } from '../components/MembershipCardCheck';
import React, { useState } from 'react';
import { View } from 'react-native';
import { LogOut, ShieldCheck } from 'lucide-react-native';
import { Page, Title } from '../components/ui';
import { Text } from '../components/Typography';
import { GateV1Panel } from '../components/GateV1Panel';
import { AdminButton } from '../components/admin/AdminControls';
import { SecurityScreen } from './SecurityScreen';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { messageOf } from '../utils/format';
export function GateScreen() {
  const { member, signOut } = useSession(), { colors } = useTheme();
  const [security, setSecurity] = useState(false), [error, setError] = useState(''), [leaving, setLeaving] = useState(false);
  if (security) return <SecurityScreen onBack={() => setSecurity(false)} />;
  return <View style={{ flex: 1, alignSelf: 'center', width: '100%', maxWidth: 760 }}><Page compact keyboardAware>
    <Title title="Portaria" subtitle={member?.name} />
    <GateV1Panel key={member?.id} />
    <MembershipCardCheck />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.border, paddingTop: 10 }}>
      <AdminButton label="Segurança da conta" icon={ShieldCheck} variant="ghost" disabled={leaving} onPress={() => setSecurity(true)} />
      <AdminButton label="Sair" icon={LogOut} variant="ghost" loading={leaving} onPress={() => {
        setLeaving(true); setError('');
        void signOut().catch(err => setError(messageOf(err))).finally(() => setLeaving(false));
      }} />
    </View>
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
  </Page></View>;
}
