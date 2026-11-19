import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUpRight, Camera, Video } from 'lucide-react-native';
import type { ClubChannels } from '@nacional/shared/settings';
import { clubChannelUrl } from '@nacional/shared/club-channel';
import { club } from '../config/club';
import { settingsApi } from '../services/settings';
import { useTheme } from '../theme/ThemeProvider';
import { Crest } from './Crest';
import { Text } from './Typography';
import { Button } from './ui';

const destinations = [
  { key: 'instagramUrl', platform: 'instagram', label: 'Instagram oficial', icon: Camera, color: '#a02d6c' },
  { key: 'youtubeUrl', platform: 'youtube', label: 'Canal do YouTube', icon: Video, color: '#ad242c' },
] as const;

export function ClubTvChannels() {
  const { colors } = useTheme();
  const [channels, setChannels] = useState<ClubChannels | null>(null);
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  const [openError, setOpenError] = useState('');
  useEffect(() => {
    let current = true;
    setFailed(false);
    settingsApi.channels().then(value => { if (current) setChannels(value); })
      .catch(() => { if (current) setFailed(true); });
    return () => { current = false; };
  }, [attempt]);

  async function open(url: string, label: string) {
    setOpenError('');
    try { await Linking.openURL(url); }
    catch { setOpenError(`Não foi possível abrir ${label}. Tente novamente.`); }
  }
  const buttons = destinations.flatMap(({ key, platform, ...details }) => {
    const url = clubChannelUrl(platform, channels?.[key]);
    return url ? [{ ...details, url }] : [];
  });
  return <>
    <LinearGradient colors={[colors.cardStart, colors.cardEnd]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
      style={{ borderRadius: 18, overflow: 'hidden', minHeight: 102, flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 }}>
      <View pointerEvents="none" style={{ position: 'absolute', width: 134, height: 134, borderWidth: 15, borderColor: '#ffffff0d', borderRadius: 67, right: -22, top: -45 }} />
      <Crest size={48} /><View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: '#ffffffbb', fontSize: 12 }}>{club.name}</Text>
        <Text heading style={{ color: '#fff', fontSize: 24, lineHeight: 30, fontWeight: '800' }}>Canais oficiais</Text>
      </View>
    </LinearGradient>
    {failed ? <><Text accessibilityRole="alert" style={{ color: colors.muted }}>Não foi possível carregar os canais.</Text><Button secondary label="Tentar novamente" onPress={() => setAttempt(n => n + 1)} /></>
      : !channels ? <ActivityIndicator accessibilityLabel="Carregando canais" color={colors.primary} />
      : !buttons.length ? <Text style={{ color: colors.muted }}>O clube ainda não publicou seus canais oficiais.</Text>
      : buttons.map(({ label, icon: Icon, color, url }) => <Pressable key={label} accessibilityRole="link" accessibilityLabel={label} onPress={() => void open(url, label)}
        style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1, backgroundColor: colors.surface, borderRadius: 15, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 })}>
        <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: color, borderRadius: 12 }}><Icon color="#fff" size={21} /></View>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: colors.text }}>{label}</Text><ArrowUpRight size={19} color={colors.muted} />
      </Pressable>)}
    {!!openError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{openError}</Text>}
  </>;
}
