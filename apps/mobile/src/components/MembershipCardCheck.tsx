import React, { useEffect, useState } from 'react';
import { Text } from './Typography';
import { Button, Panel } from './ui';
import { PaymentQrScanner } from './PaymentQrScanner';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { request } from '../services/api';
export function MembershipCardCheck() {
  const { token } = useSession(), { colors } = useTheme();
  const [scanner, setScanner] = useState(false), [result, setResult] = useState<{ name: string; memberId: string; plan: string; checkedAt: string } | null>(null);
  useEffect(() => { if (!result) return; const timer = setTimeout(() => setResult(null), 30000); return () => clearTimeout(timer); }, [result]);
  return <Panel style={{ gap: 10 }}><Text style={{ color: colors.text, fontWeight: '700' }}>Consultar associação</Text><Text style={{ color: colors.muted, fontSize: 13 }}>A carteirinha confirma o plano. Para liberar a entrada, leia o ingresso.</Text><Button secondary label="Ler carteirinha" onPress={() => { setResult(null); setScanner(true); }} />
    {result && <Text style={{ color: colors.primary }}>{result.name} · {result.plan}{'\n'}{result.memberId} · conferido às {new Date(result.checkedAt).toLocaleTimeString('pt-BR')}. Consulte novamente a cada apresentação.</Text>}
    {scanner && <PaymentQrScanner title="Validar carteirinha" instructions="Leia o QR temporário na aba Carteira do aplicativo do sócio." placeholder="Cole o código completo da carteirinha" manualLabel="Consultar carteirinha" onClose={() => setScanner(false)} onRead={async value => { setResult(null); const fresh = await request<{ name: string; memberId: string; plan: string; checkedAt: string }>('/membership/verify', { token: token!, method: 'POST', body: { token: value.trim() } }); setResult(fresh); setScanner(false); }} />}
  </Panel>;
}
