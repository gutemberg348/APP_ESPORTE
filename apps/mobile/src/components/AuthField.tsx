import React, { forwardRef, useState } from 'react';
import { View, Pressable, TextInput as NativeInput, type TextInputProps } from 'react-native';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { Text, TextInput } from './Typography';
import { useTheme } from '../theme/ThemeProvider';

export const AuthField = forwardRef<React.ComponentRef<typeof NativeInput>, TextInputProps & { label: string; icon: LucideIcon; password?: boolean; hint?: string; error?: string }>(function AuthField({ label, icon: Icon, password = false, hint, error, onFocus, onBlur, ...props }, ref) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false), [visible, setVisible] = useState(false);
  return <View style={{ gap: 7 }}>
    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13, lineHeight: 18 }}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: error ? colors.danger : focused ? colors.primary : colors.border, backgroundColor: colors.surface }}>
      <View style={{ paddingLeft: 15 }}><Icon size={19} color={focused ? colors.primary : colors.muted} strokeWidth={1.7} /></View>
      <TextInput ref={ref} {...props} accessibilityLabel={label} placeholderTextColor={colors.muted} secureTextEntry={password && !visible} onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }} style={{ flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 14, color: colors.text, fontSize: 16 }} />
      {password && <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'} accessibilityState={{ checked: visible }} disabled={props.editable === false} onPress={() => setVisible(value => !value)} style={{ width: 48, minHeight: 54, alignItems: 'center', justifyContent: 'center' }}>{visible ? <EyeOff size={20} color={colors.muted} /> : <Eye size={20} color={colors.muted} />}</Pressable>}
    </View>
    {!!(error || hint) && <Text accessibilityRole={error ? 'alert' : undefined} style={{ fontSize: 12, lineHeight: 18, color: error ? colors.danger : colors.muted }}>{error || hint}</Text>}
  </View>;
});
