import { club } from '../config/club';
import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { GraduationCap, ChevronRight, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Page, Panel, Button, DemoFooter } from '../components/ui';
import { Text } from '../components/Typography';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { useClub } from '../providers/ClubProvider';
import { messageOf } from '../utils/format';
export function SchoolScreen({ onBack }: { onBack: () => void }) {
  const { colors, isDark, tone } = useTheme();
  const { member, demoMode } = useSession();
  const { school } = useClub();
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() { setBusy(true); setError(''); try { await school(!member?.schoolInterested); } catch (err) { setError(messageOf(err)); } finally { setBusy(false); } }
  return <Page><Pressable onPress={onBack} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: colors.muted, fontSize: 14 }}>‹ Voltar</Text></Pressable>
    <LinearGradient colors={isDark ? ['#3f361b', tone('#12251b')] : ['#fae1a8', '#fcf9f1']} style={{ paddingVertical: 28, paddingHorizontal: 16, borderWidth: 1, borderColor: '#c1944240', borderRadius: 24, alignItems: 'center' }}><View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: '#f1b9441c', borderWidth: 1, borderColor: '#eac37960', alignItems: 'center', justifyContent: 'center', marginBottom: 22, transform: [{ rotate: '-5deg' }] }}><GraduationCap size={36} color={isDark ? '#efc16b' : '#93611e'} /></View><Text style={{ color: isDark ? '#dac18f' : '#816219', fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textAlign: 'center' }}>{`${club.schoolSubtitle.toUpperCase()} · PROPOSTA`}</Text><Text heading style={{ color: isDark ? '#fff9ef' : tone('#1b3526'), fontSize: 30, lineHeight: 37, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center', marginTop: 12, marginBottom: 8 }}>{club.schoolName}</Text><Text style={{ color: isDark ? tone('#cfddd1') : tone('#556f5c'), textAlign: 'center' }}>Grandes sonhos começam aqui.</Text></LinearGradient>
    <Panel style={{ paddingVertical: 0, paddingHorizontal: 16, borderRadius: 18 }}>{[['Turmas e horários', 'Faixas etárias, local e dias de treino serão definidos pelo clube.'], ['Como participar', 'As inscrições reais ainda não estão disponíveis.'], ['Vantagem para sócios', `Condições e descontos dependem de definição do ${club.shortName}.`]].map(([title, body], index) => <View key={title} style={{ borderTopWidth: index ? 1 : 0, borderTopColor: colors.border }}><Pressable onPress={() => setOpen(open === index ? null : index)} accessibilityRole="button" accessibilityState={{ expanded: open === index }} style={{ paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: colors.text }}>{title}</Text><ChevronRight size={18} color={colors.muted} style={{ transform: [{ rotate: open === index ? '90deg' : '0deg' }] }} /></Pressable>{open === index && <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 23, marginBottom: 16 }}>{body}</Text>}</View>)}</Panel>
    {member?.schoolInterested && <Panel style={{ backgroundColor: colors.primarySoft, borderColor: tone('#68be8144'), borderRadius: 16, padding: 15, gap: 6 }}><Check size={24} color={colors.primary} /><Text style={{ color: colors.text, fontWeight: '700' }}>{demoMode ? 'Interesse salvo nesta demonstração' : 'Interesse registrado'}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{demoMode ? 'Não enviado ao clube.' : 'Isso não representa uma matrícula ou reserva de vaga.'}</Text></Panel>}
    {error ? <Text style={{ color: colors.danger }} accessibilityRole="alert">{error}</Text> : null}<Button secondary={member?.schoolInterested} label={member?.schoolInterested ? 'Remover interesse' : 'Tenho interesse'} loading={busy} onPress={() => void save()} /><Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>{demoMode ? 'Demonstração · sem matrícula real' : 'Seu interesse será salvo para acompanhamento.'}</Text><DemoFooter demo={demoMode} />
  </Page>;
}
