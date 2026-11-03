import React from 'react';
import { Text as NativeText, TextInput as NativeInput, StyleSheet, type TextProps, type TextInputProps } from 'react-native';
export const fonts = {
  body: { regular: 'DMSans_400Regular', medium: 'DMSans_500Medium', semibold: 'DMSans_600SemiBold', bold: 'DMSans_700Bold' },
  heading: { regular: 'Manrope_400Regular', medium: 'Manrope_500Medium', semibold: 'Manrope_600SemiBold', bold: 'Manrope_700Bold', extra: 'Manrope_800ExtraBold' },
};
export function Text({ style, heading = false, ...props }: TextProps & { heading?: boolean }) {
  const weight = Number(StyleSheet.flatten(style)?.fontWeight || 400);
  const family = heading ? fonts.heading : fonts.body;
  const fontFamily = heading && weight >= 800 ? fonts.heading.extra : weight >= 700 ? family.bold : weight >= 600 ? family.semibold : weight >= 500 ? family.medium : family.regular;
  return <NativeText {...props} style={[{ fontSize: 16, lineHeight: 24 }, style, { fontFamily, fontWeight: 'normal' }]} />;
}
export function TextInput({ style, ...props }: TextInputProps) {
  return <NativeInput {...props} style={[{ fontFamily: fonts.body.regular, fontSize: 16 }, style]} />;
}
