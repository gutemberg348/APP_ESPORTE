import React from 'react';
import { Modal, View, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Text } from './Typography';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
export function Sheet({ visible, title, onClose, children }: React.PropsWithChildren<{ visible: boolean; title: string; onClose: () => void }>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Pressable onPress={onClose} accessibilityLabel="Fechar janela" style={[StyleSheet.absoluteFill, { backgroundColor: '#000a' }]} />
      <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Math.max(insets.bottom, 24), maxHeight: '88%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}><Text style={{ fontSize: 22, fontWeight: '700', color: colors.text, flex: 1 }}>{title}</Text><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar" hitSlop={12}><X color={colors.muted} size={24} /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>{children}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
