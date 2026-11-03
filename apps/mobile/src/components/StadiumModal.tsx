import { club } from '../config/club';
import { useTheme } from '../theme/ThemeProvider';
import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Pressable, AccessibilityInfo, AppState, Animated, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { X, Zap } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Crest } from './Crest';
import { Text } from './Typography';
function StadiumLights({ onClose }: { onClose: () => void }) {
  useKeepAwake();
  const { tone } = useTheme();
  const insets = useSafeAreaInsets();
  const [effect, setEffect] = useState('together');
  const [white, setWhite] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (alive) setReduced(value); });
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const state = AppState.addEventListener('change', (value) => setForeground(value === 'active'));
    return () => { alive = false; motion.remove(); state.remove(); };
  }, []);
  useEffect(() => {
    if (!foreground || reduced || effect !== 'together') return;
    const tick = () => setWhite(Math.floor(Date.now() / 6000) % 2 === 1);
    tick(); const interval = setInterval(tick, 200); return () => clearInterval(interval);
  }, [effect, foreground, reduced]);
  useEffect(() => {
    if (effect !== 'pulse' || reduced || !foreground) { pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 3000, useNativeDriver: false }), Animated.timing(pulse, { toValue: 0, duration: 3000, useNativeDriver: false })]));
    loop.start(); return () => loop.stop();
  }, [effect, reduced, foreground, pulse]);
  const background = effect === 'white' || (effect === 'together' && white && !reduced) ? tone('#f3fff4') : tone('#43d188');
  return <Animated.View style={{ flex: 1, backgroundColor: effect === 'pulse' ? pulse.interpolate({ inputRange: [0, 1], outputRange: [tone('#43d188'), tone('#f3fff4')] }) : background }}><StatusBar style="dark" /><ScrollView contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 22 }}><Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1, color: tone('#073a24') }}>SHOW DA TORCIDA</Text><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Sair do Modo Estádio" style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 26, borderWidth: 1, borderColor: tone('#063c2650'), backgroundColor: tone('#063c2620'), flexDirection: 'row', alignItems: 'center', gap: 8 }}><X size={22} color={tone('#083b24')} /><Text style={{ color: tone('#083b24'), fontSize: 14, fontWeight: '700' }}>Sair</Text></Pressable></View>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}><Zap size={36} color={tone('#073a24')} /><Text heading style={{ fontSize: 36, lineHeight: 41, fontWeight: '800', letterSpacing: -1.5, textAlign: 'center', color: tone('#073a24') }}>Levante o{'\n'}celular!</Text><Text style={{ color: tone('#174f34'), textAlign: 'center' }}>{`As cores do ${club.shortName}`}{'\n'}na palma da sua mão.</Text><View style={{ width: 176, height: 176, borderRadius: 88, backgroundColor: '#ffffffd9', borderWidth: 2, borderColor: tone('#17683b30'), alignItems: 'center', justifyContent: 'center', padding: 24, marginVertical: 5 }}><Crest size={108} height={128} /></View></View>
    <View style={{ paddingHorizontal: 20, alignItems: 'center', gap: 14 }}><View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', padding: 6, gap: 2, borderRadius: 32, borderWidth: 1, borderColor: tone('#16543135'), backgroundColor: '#ffffff75' }}>{[['together', 'Juntos'], ['green', 'Verde'], ['white', 'Branca'], ['pulse', 'Suave']].map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: effect === value }} onPress={() => setEffect(value!)} style={{ borderRadius: 25, minHeight: 44, paddingHorizontal: 13, justifyContent: 'center', backgroundColor: effect === value ? tone('#114d30') : 'transparent' }}><Text style={{ fontSize: 14, fontWeight: '600', color: effect === value ? '#fff' : tone('#285537') }}>{label}</Text></Pressable>)}</View>{reduced && <Text style={{ color: tone('#215537'), fontSize: 12 }}>Seu aparelho está com movimento reduzido.</Text>}<Text style={{ color: tone('#215537'), fontSize: 12, textAlign: 'center' }}>Mantenha esta tela aberta</Text><Text style={{ color: tone('#215537'), fontSize: 12, textAlign: 'center' }}>Juntos: relógio automático · sequência de demonstração</Text></View>
  </ScrollView></Animated.View>;
}
export function StadiumModal({ onClose }: { onClose: () => void }) { return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}><StadiumLights onClose={onClose} /></Modal>; }
