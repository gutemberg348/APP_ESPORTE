import React from 'react';
import { Modal, View, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { Text } from './Typography';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
export function Sheet({ visible, title, onClose, children }: React.PropsWithChildren<{ visible: boolean; title: string; onClose: () => void }>) {
  const { colors, variant } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const desktop = width >= 768 && (Platform.OS === 'web' || variant === 'admin');
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: desktop ? 'center' : 'flex-end', padding: desktop ? 24 : 0 }}>
      <Pressable onPress={onClose} accessibilityLabel="Fechar janela" style={[StyleSheet.absoluteFill, { backgroundColor: '#000a' }]} />
      <View style={{ width: '100%', maxWidth: desktop ? 720 : 640, alignSelf: 'center', backgroundColor: variant === 'admin' ? colors.surface : colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: desktop ? variant === 'admin' ? 12 : 20 : undefined, borderTopLeftRadius: variant === 'admin' ? 12 : desktop ? 20 : 32, borderTopRightRadius: variant === 'admin' ? 12 : desktop ? 20 : 32, padding: desktop ? 28 : variant === 'admin' ? 20 : 24, paddingBottom: Math.max(insets.bottom, 24), maxHeight: desktop ? '90%' : '88%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}><Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, flex: 1 }}>{title}</Text><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={12}><X color={colors.muted} size={24} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>{children}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
