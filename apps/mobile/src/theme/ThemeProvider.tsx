import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { club } from '../config/club';
import { brandTone } from './brand-tone';
export const palettes = { dark: club.dark, light: club.light };
const tone = (color: string) => brandTone(color, club.dark.primaryStrong, club.id === 'nacional');
export const ThemeContext = createContext({ isDark: true, colors: palettes.dark, tone, toggle: () => {}, variant: 'club' as 'club' | 'admin' });
export function ThemeProvider({ children }: React.PropsWithChildren) {
  const [isDark, setDark] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => { let alive = true; void AsyncStorage.getItem(`club.${club.id}.theme`).then((theme) => { if (alive) setDark(theme !== 'light'); }).catch(() => {}).finally(() => { if (alive) setReady(true); }); return () => { alive = false; }; }, []);
  useEffect(() => { if (ready) void AsyncStorage.setItem(`club.${club.id}.theme`, isDark ? 'dark' : 'light').catch(() => {}); }, [ready, isDark]);
  return <ThemeContext.Provider value={{ isDark, colors: isDark ? palettes.dark : palettes.light, tone, toggle: () => setDark((value) => !value), variant: 'club' }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
