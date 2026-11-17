import React from 'react';
import { View } from 'react-native';
import { useClub } from '../providers/ClubProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Typography';
import { Panel, Button } from './ui';

export function PointsMissions({ busy, onCheckIn, onRewards }: { busy: boolean; onCheckIn: () => void; onRewards: () => void }) {
  const { data } = useClub(), { colors } = useTheme();
  const engagement = data?.engagement;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const done = !!engagement?.checkedIn && engagement.day === day;
  const points = data?.member.points || 0;
  const next = engagement?.rewards.filter(reward => reward.stock > 0 && !engagement.redemptions.some(row => row.rewardId === reward.id)).sort((a, b) => a.cost - b.cost)[0];
  const remaining = next ? Math.max(0, next.cost - points) : 0;
  return <Panel style={{ gap: 14 }}>
    <Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>Sua missão de hoje</Text>
    <Text style={{ color: colors.muted, fontSize: 14 }}>Faça o check-in, acumule pontos e troque pelos prêmios publicados pelo clube. Pontos não são dinheiro nem desconto automático na loja.</Text>
    <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.primarySoft, gap: 6 }}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{done ? 'Check-in concluído' : 'Marque presença na torcida'}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{done ? 'Os pontos de hoje já foram registrados. Volte amanhã.' : engagement?.checkInEnabled ? `+${engagement.checkInPoints} pontos · uma vez por dia` : 'O clube pausou o check-in por enquanto.'}</Text>
      <Button label={done ? 'Concluído hoje' : 'Fazer check-in'} disabled={done || !engagement?.checkInEnabled || busy} onPress={onCheckIn} />
    </View>
    {next ? <>
      <Text style={{ color: colors.text, fontWeight: '600' }}>Seu próximo objetivo: {next.title}</Text>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: next.cost, now: Math.min(points, next.cost) }} style={{ height: 7, borderRadius: 4, backgroundColor: colors.soft, overflow: 'hidden' }}><View style={{ height: '100%', width: `${Math.min(100, next.cost ? points / next.cost * 100 : 100)}%`, backgroundColor: colors.primary }} /></View>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{remaining ? `Faltam ${remaining.toLocaleString('pt-BR')} pontos para esse resgate.` : 'Você já tem pontos suficientes para resgatar.'} Sujeito ao estoque disponível.</Text>
      <Button secondary label="Ver prêmios e resgatar" onPress={onRewards} />
    </> : <Text style={{ color: colors.muted, fontSize: 13 }}>Nenhum prêmio disponível para um novo resgate agora. Seu saldo permanece na conta.</Text>}
    <Text style={{ color: colors.muted, fontSize: 11 }}>O dia vira à meia-noite no horário de Patos. Consulte os resgates em Carteira → Experiências.</Text>
  </Panel>;
}
