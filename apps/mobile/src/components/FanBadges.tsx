import React from 'react';
import { View } from 'react-native';
import { Check, Crown, Flag, Flame, LockKeyhole, Shield, Trophy } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Typography';
import { Panel } from './ui';

const badges = [
  { name: 'Estreia na Torcida', points: 30, icon: Flag },
  { name: 'Torcedor Fiel', points: 150, icon: Shield },
  { name: 'Voz da Arquibancada', points: 400, icon: Flame },
  { name: 'Craque da Torcida', points: 800, icon: Trophy },
  { name: 'Lenda do Clube', points: 1500, icon: Crown },
];

const pointsLabel = (points: number) => points.toLocaleString('pt-BR');

export function FanBadges({ points }: { points: number }) {
  const { colors } = useTheme();
  const unlocked = badges.filter((badge) => points >= badge.points);
  const next = badges[unlocked.length];
  const previousTarget = unlocked.at(-1)?.points ?? 0;
  const progress = next ? points - previousTarget : 0;
  const goal = next ? next.points - previousTarget : 0;

  return <View style={{ gap: 12 }}>
    <Panel style={{ gap: 9, borderColor: `${colors.gold}55` }}>
      <Text heading style={{ color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '800' }}>{unlocked.length} de {badges.length} emblemas</Text>
      <Text style={{ color: colors.gold, fontSize: 14, fontWeight: '700' }}>{pointsLabel(points)} pontos acumulados</Text>
      {next ? <>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Faltam {pointsLabel(next.points - points)} pontos para {next.name}.</Text>
        <View accessibilityRole="progressbar" accessibilityLabel={`Progresso para ${next.name}`} accessibilityValue={{ min: 0, max: goal, now: progress }} style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: `${colors.gold}25` }}>
          <View style={{ width: `${progress / goal * 100}%`, height: '100%', backgroundColor: colors.gold }} />
        </View>
      </> : <Text style={{ color: colors.muted, fontSize: 13 }}>Você conquistou toda a coleção.</Text>}
    </Panel>
    {badges.map(({ name, points: target, icon: Icon }) => {
      const earned = points >= target;
      const statusColor = earned ? colors.gold : colors.muted;
      const StatusIcon = earned ? Check : LockKeyhole;
      return <Panel key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderColor: earned ? `${colors.gold}55` : colors.border }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: earned ? `${colors.gold}20` : colors.soft }}>
          <Icon size={23} color={statusColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' }}>{name}</Text>
          <Text style={{ color: statusColor, fontSize: 12, lineHeight: 18 }}>{pointsLabel(target)} pontos · {earned ? 'Conquistado' : 'Bloqueado'}</Text>
        </View>
        <StatusIcon size={17} color={statusColor} />
      </Panel>;
    })}
  </View>;
}
