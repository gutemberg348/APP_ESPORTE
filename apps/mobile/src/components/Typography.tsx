import React, { createContext, useContext } from 'react';
import { Text as NativeText, TextInput as NativeInput, StyleSheet, type TextProps, type TextInputProps } from 'react-native';
import { maskInput, type InputMask } from '@nacional/shared/forms';
export const fonts = {
  body: { regular: 'DMSans_400Regular', medium: 'DMSans_500Medium', semibold: 'DMSans_600SemiBold', bold: 'DMSans_700Bold' },
  heading: { regular: 'Manrope_400Regular', medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold', extra: 'Manrope_800ExtraBold' },
};
type FontFamily = { regular: string; medium: string; semibold: string; bold: string; extra?: string };
type FontSet = { body: FontFamily; heading: FontFamily };
const TypographyContext = createContext<{ families: FontSet; compact: boolean }>({ families: fonts, compact: false });
export function TypographyProvider({ children, families }: React.PropsWithChildren<{ families: FontSet }>) {
  return <TypographyContext.Provider value={{ families, compact: true }}>{children}</TypographyContext.Provider>;
}
export function Text({ style, heading = false, ...props }: TextProps & { heading?: boolean }) {
  const { families, compact } = useContext(TypographyContext);
  const weight = Number(StyleSheet.flatten(style)?.fontWeight || 400);
  const family = heading ? families.heading : families.body;
  const fontFamily = weight >= 800 && family.extra ? family.extra : weight >= 700 ? family.bold : weight >= 600 ? family.semibold : weight >= 500 ? family.medium : family.regular;
  return <NativeText {...props} style={[{ fontSize: compact ? 14 : 16, lineHeight: compact ? 22 : 24 }, style, { fontFamily, fontWeight: 'normal' }]} />;
}
export function TextInput({ style, mask, onChangeText, value, ...props }: TextInputProps & { mask?: InputMask }) {
  const { families, compact } = useContext(TypographyContext);
  const label = `${props.accessibilityLabel || ''} ${props.placeholder || ''}`;
  const kind = mask || (/CPF|CNPJ/i.test(label) ? 'document' : /\bCEP\b/i.test(label) ? 'postalCode' : props.keyboardType === 'phone-pad' ? 'phone' : undefined);
  return <NativeInput {...props} value={value === undefined ? undefined : kind ? maskInput(value, kind) : value} onChangeText={(text) => onChangeText?.(maskInput(text, kind))} style={[{ fontFamily: families.body.regular, fontSize: compact ? 14 : 16 }, style]} />;
}
