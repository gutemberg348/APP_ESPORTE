import React from 'react';
import { View, Pressable, ActivityIndicator, ScrollView, RefreshControl, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Typography';
export function Button({ label, onPress, loading, gold = false, disabled = false, secondary = false }: { label: string; onPress: () => void; loading?: boolean; gold?: boolean; disabled?: boolean; secondary?: boolean }) {
  const { colors, isDark } = useTheme();
  const gradient: [string, string] = secondary ? [colors.soft, colors.soft] : gold ? ['#f1ce75', '#c79939'] : [colors.primaryStrong, colors.primaryEnd];
  const ink = secondary ? colors.primary : gold ? colors.ink : colors.onPrimary;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: loading || disabled }} onPress={onPress} disabled={loading || disabled} style={({ pressed }) => ({ opacity: loading || disabled ? 0.48 : pressed ? 0.8 : 1 })}>
    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.button, secondary && { borderWidth: 1, borderColor: colors.border }]}>{loading ? <ActivityIndicator color={ink} /> : <Text style={{ color: ink, fontWeight: '700', textAlign: 'center' }}>{label}</Text>}</LinearGradient>
  </Pressable>;
}
export function Panel({ children, style }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { colors } = useTheme();
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}
export function Page({ children, refreshing = false, onRefresh, compact = false }: React.PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void; compact?: boolean }>) {
  const { colors } = useTheme();
  return <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, compact && { paddingTop: 10, paddingBottom: 16 }]} refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}>{children}</ScrollView>;
}
export function Title({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ gap: 12 }}><View style={[styles.row, { justifyContent: 'space-between' }]}><Text heading style={{ fontSize: 28, lineHeight: 35, fontWeight: '800', letterSpacing: -0.7, color: colors.text, flexShrink: 1 }}>{title}</Text>{action}</View>{subtitle && <Text style={{ fontSize: 14, color: colors.muted, lineHeight: 21 }}>{subtitle}</Text>}</View>;
}
export function Label({ children, color }: React.PropsWithChildren<{ color?: string }>) {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 12, lineHeight: 18, fontWeight: '700', letterSpacing: 0.6, color: color || colors.muted, textTransform: 'uppercase' }}>{children}</Text>;
}
export function ActionTile({ icon: Icon, title, subtitle, color, onPress }: { icon: LucideIcon; title: string; subtitle: string; color: string; onPress: () => void }) {
  const { colors } = useTheme();
  return <Pressable onPress={onPress} accessibilityRole="button" style={{ flex: 1 }}><Panel style={{ gap: 12, padding: 16, borderRadius: 20, backgroundColor: colors.soft }}><View style={{ width: 43, height: 43, borderRadius: 22, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center' }}><Icon color={color} size={22} strokeWidth={1.7} /></View><Text style={{ color: colors.text, fontWeight: '600' }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>{subtitle}</Text></Panel></Pressable>;
}
export function DemoFooter({ demo }: { demo: boolean }) {
  const { colors } = useTheme();
  return demo ? <Text style={{ fontSize: 12, textAlign: 'center', color: colors.muted, paddingVertical: 12 }}>Protótipo · dados fictícios</Text> : null;
}
export const styles = StyleSheet.create({
  page: { padding: 22, paddingTop: 18, paddingBottom: 24, gap: 22, flexGrow: 1 },
  panel: { borderRadius: 22, borderWidth: 1, padding: 23, overflow: 'hidden' },
  button: { borderRadius: 12, minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
