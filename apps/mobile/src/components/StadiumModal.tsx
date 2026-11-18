import { club } from '../config/club';
import { useTheme } from '../theme/ThemeProvider';
import React, { useState, useEffect } from 'react';
import { Modal, View, Pressable, AccessibilityInfo, AppState, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { X, Zap } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Crest } from './Crest';
import { Text } from './Typography';
import { request } from '../services/api';
import { stadiumClock, stadiumPhase } from '../hooks/stadium-clock';

function StadiumLights({ onClose }: { onClose: () => void }) {
  useKeepAwake();
  const { tone } = useTheme();
  const insets = useSafeAreaInsets();
  const [white, setWhite] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [sync, setSync] = useState<'waiting' | 'ready' | 'retry'>('waiting');
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduced(value); }).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const state = AppState.addEventListener('change', (value) => setForeground(value === 'active'));
    return () => { alive = false; motion.remove(); state.remove(); };
  }, []);
  useEffect(() => {
    if (!foreground || reduced) return;
    let alive = true;
    let phaseTimer: ReturnType<typeof setTimeout>;
    let syncTimer: ReturnType<typeof setTimeout>;
    let anchor: ReturnType<typeof stadiumClock> = null;
    setSync('waiting');
    function updateColor() {
      if (!anchor || !alive) return;
      const phase = stadiumPhase(anchor, performance.now());
      setWhite(phase.white);
      phaseTimer = setTimeout(updateColor, phase.nextIn);
    }
    async function synchronize() {
      const start = performance.now();
      let delay = 5000;
      try {
        const { epochMs } = await request<{ epochMs: number }>('/stadium/clock', { timeoutMs: 4000 });
        if (!alive) return;
        const sample = stadiumClock(epochMs, start, performance.now());
        if (sample) {
          anchor = sample;
          clearTimeout(phaseTimer);
          updateColor();
          setSync('ready');
          delay = 60000;
        } else if (!anchor) setSync('retry');
      } catch { if (alive && !anchor) setSync('retry'); }
      if (alive) syncTimer = setTimeout(synchronize, delay + Math.random() * 2000);
    }
    void synchronize();
    return () => { alive = false; clearTimeout(phaseTimer); clearTimeout(syncTimer); };
  }, [foreground, reduced]);
  const background = !reduced && sync === 'ready' && white ? club.stadiumWhite : club.stadiumColor;
  return <View style={{ flex: 1, backgroundColor: background }}><StatusBar style="dark" /><ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 22 }}><Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: tone('#073a24') }}>SHOW DA TORCIDA</Text><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Sair do Modo Estádio" style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 26, borderWidth: 1, borderColor: tone('#063c2650'), backgroundColor: tone('#063c2620'), flexDirection: 'row', alignItems: 'center', gap: 8 }}><X size={22} color={tone('#083b24')} /><Text style={{ color: tone('#083b24'), fontSize: 14, fontWeight: '700' }}>Sair</Text></Pressable></View>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}><Zap size={36} color={tone('#073a24')} /><Text heading style={{ fontSize: 36, lineHeight: 41, fontWeight: '800', letterSpacing: -1.5, textAlign: 'center', color: tone('#073a24') }}>Levante o{'\n'}celular!</Text><Text style={{ color: tone('#174f34'), textAlign: 'center' }}>{`As cores do ${club.shortName}`}{'\n'}na palma da sua mão.</Text><View style={{ width: 176, height: 176, borderRadius: 88, backgroundColor: '#ffffffd9', borderWidth: 2, borderColor: tone('#17683b30'), alignItems: 'center', justifyContent: 'center', padding: 24, marginVertical: 5 }}><Crest size={108} height={128} /></View></View>
    <Text style={{ color: tone('#215537'), textAlign: 'center', fontSize: 13 }}>
      {reduced ? 'Movimento reduzido · luz fixa' : sync === 'waiting' ? 'Sincronizando com a torcida…' : sync === 'retry' ? 'Aguardando conexão para sincronizar…' : 'Mantenha esta tela aberta'}
    </Text>
  </ScrollView></View>;
}
export function StadiumModal({ onClose }: { onClose: () => void }) { return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}><StadiumLights onClose={onClose} /></Modal>; }
