import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeContext, palettes } from './ThemeProvider';
import { TypographyProvider } from '../components/Typography';

const light = {
  ...palettes.light,
  background: '#fafafa', outer: '#fafafa', surface: '#ffffff', header: '#fdfdfd',
  text: '#202124', muted: '#65656b', subtle: '#73737c', border: '#e9e9ec', soft: '#f6f6f7',
  primary: palettes.light.primary, primaryStrong: palettes.light.primaryStrong,
  primaryEnd: palettes.light.primaryStrong, primarySoft: palettes.light.primarySoft,
  onPrimary: palettes.light.onPrimary, brandBorder: palettes.light.brandBorder, gold: '#a16207', danger: '#b42338',
  nav: '#ffffff', navActive: palettes.light.primarySoft, heroStart: palettes.light.primarySoft, heroEnd: '#ffffff',
  cardStart: '#27272a', cardMiddle: '#202024', cardEnd: '#18181b',
  onHero: '#202024', heroMuted: '#62626c', ink: '#202024',
};
const dark = {
  ...light,
  background: '#141416', outer: '#141416', surface: '#1c1c1f', header: '#18181a',
  text: '#f4f4f5', muted: '#b4b4bc', subtle: '#a1a1aa', border: '#303034', soft: '#252528',
  primary: palettes.dark.primary, primaryStrong: palettes.dark.primaryStrong,
  primaryEnd: palettes.dark.primaryStrong, primarySoft: palettes.dark.primarySoft,
  brandBorder: palettes.dark.brandBorder, gold: '#facc75', danger: '#fda4af',
  nav: '#18181b', navActive: palettes.dark.primarySoft,
  heroStart: palettes.dark.primarySoft, heroEnd: '#1b1b1f', onHero: '#f4f4f5', heroMuted: '#b4b4bc',
};
const inter = {
  regular: 'Inter_400Regular', medium: 'Inter_500Medium', semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold', extra: 'Inter_700Bold',
};
const identityTone = (color: string) => color;

export function AdminThemeProvider({ children }: React.PropsWithChildren) {
  const [isDark, setDark] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem('admin.theme').then((value) => {
      if (alive) setDark(value === 'dark');
    }).catch(() => {}).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (ready) void AsyncStorage.setItem('admin.theme', isDark ? 'dark' : 'light').catch(() => {});
  }, [ready, isDark]);
  return <ThemeContext.Provider value={{ isDark, colors: isDark ? dark : light, tone: identityTone, toggle: () => setDark((value) => !value), variant: 'admin' }}>
    <TypographyProvider families={{ body: inter, heading: inter }}>{children}</TypographyProvider>
  </ThemeContext.Provider>;
}
