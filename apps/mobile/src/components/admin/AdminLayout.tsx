import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Modal, useWindowDimensions, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  LayoutDashboard, CalendarDays, Ticket, Users, BadgeCheck, UserRoundCog,
  ScanLine, History, ArrowUpRight, LogOut, RefreshCw, Sun, Moon,
  ChevronRight, Building2, Menu, X, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react-native';
import { Text } from '../Typography';
import { useTheme } from '../../theme/ThemeProvider';
import { useSession } from '../../providers/SessionProvider';
import { club } from '../../config/club';

export const adminSections = [
  { name: 'Visão geral', icon: LayoutDashboard, description: 'Acompanhe os números e as atividades da operação.' },
  { name: 'Jogos', icon: CalendarDays, description: 'Organize partidas, setores, preços e disponibilidade.' },
  { name: 'Vendas', icon: Ticket, description: 'Consulte pedidos e confira os recebimentos.' },
  { name: 'Pagamentos', icon: BadgeCheck, description: 'Acompanhe Pix, conciliação e solicitações de estorno.' },
  { name: 'Torcedores', icon: Users, description: 'Gerencie contas e associações do clube.' },
  { name: 'Planos', icon: BadgeCheck, description: 'Defina os planos e os benefícios dos associados.' },
  { name: 'Funcionários', icon: UserRoundCog, description: 'Gerencie a equipe e as escalas de portaria.' },
  { name: 'Portaria', icon: ScanLine, description: 'Confira ingressos e registre as entradas.' },
  { name: 'Histórico de portaria', icon: History, description: 'Consulte entradas, recusas e protocolos por partida e funcionário.' },
  { name: 'Auditoria', icon: History, description: 'Consulte o histórico das operações administrativas.' },
];

export function useDesktopAdmin() {
  const { width } = useWindowDimensions();
  return width >= 1024;
}

type LayoutProps = React.PropsWithChildren<{
  active: string; onSelect: (section: string) => void; onBack: () => void; onSignOut: () => void;
  refreshing: boolean; onRefresh: () => void; busy: boolean; action?: React.ReactNode;
}>;

export function AdminLayout({ children, active, onSelect, onBack, onSignOut, refreshing, onRefresh, busy, action }: LayoutProps) {
  const desktop = useDesktopAdmin();
  const { width } = useWindowDimensions();
  const { colors, isDark, toggle } = useTheme();
  const { member } = useSession();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const current = adminSections.find((section) => section.name === active) || adminSections[0]!;
  const initials = member?.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
  useEffect(() => { if (desktop) setDrawerOpen(false); }, [desktop]);

  function select(section: string) { onSelect(section); setDrawerOpen(false); }
  const sidebar = (compact: boolean, drawer: boolean) => <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.header, paddingTop: drawer ? Math.max(insets.top, 16) : 22, paddingHorizontal: compact ? 12 : 20, paddingBottom: Math.max(insets.bottom, 18), gap: 22 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 38 }}>
      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center' }}><Building2 size={21} color={colors.onPrimary} strokeWidth={1.8} /></View>
      {!compact && <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '700', letterSpacing: -0.3 }}>Administração</Text><Text style={{ color: colors.subtle, fontSize: 11, lineHeight: 17 }}>Gestão do clube</Text></View>}
      {drawer && <IconButton label="Fechar menu" icon={X} onPress={() => setDrawerOpen(false)} />}
    </View>
    {!compact && <View style={{ padding: 12, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border, borderRadius: 9, gap: 3 }}>
      <Text style={{ color: colors.subtle, fontSize: 10, lineHeight: 16, fontWeight: '600', letterSpacing: 0.8 }}>CLUBE</Text>
      <Text numberOfLines={2} style={{ color: colors.text, fontSize: 12, lineHeight: 19, fontWeight: '600' }}>{club.name}</Text>
    </View>}
    <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
      {!compact && <Text style={{ color: colors.subtle, fontSize: 10, lineHeight: 18, letterSpacing: 1, fontWeight: '600', marginBottom: 7, marginLeft: 11 }}>PRINCIPAL</Text>}
      {adminSections.map(({ name, icon: Icon }, index) => <React.Fragment key={name}>
        {index === 4 && <View style={{ borderTopWidth: 1, borderColor: colors.border, marginVertical: 13 }}>{!compact && <Text style={{ color: colors.subtle, fontSize: 10, lineHeight: 18, letterSpacing: 1, fontWeight: '600', marginTop: 16, marginLeft: 11 }}>GESTÃO E CONTROLE</Text>}</View>}
        <NavItem label={name} icon={Icon} active={name === active} compact={compact} onPress={() => select(name)} />
      </React.Fragment>)}
    </ScrollView>
    <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 16, gap: 15 }}>
      <NavItem label="Abrir app do torcedor" icon={ArrowUpRight} compact={compact} onPress={() => { setDrawerOpen(false); onBack(); }} />
      <View style={{ flexDirection: compact ? 'column' : 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 33, height: 33, borderRadius: 17, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>{initials}</Text></View>
        {!compact && <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, lineHeight: 19, fontWeight: '600' }}>{member?.name}</Text><Text style={{ color: colors.subtle, fontSize: 10, lineHeight: 17 }}>Administrador</Text></View>}
        <IconButton label="Sair da conta administrativa" icon={LogOut} disabled={busy} onPress={onSignOut} />
      </View>
    </View>
  </View>;

  return <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', backgroundColor: colors.background, paddingTop: insets.top }}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    {desktop && <View style={{ width: collapsed ? 72 : 252, borderRightWidth: 1, borderColor: colors.border }}>{sidebar(collapsed, false)}</View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={{ minHeight: desktop ? 72 : 64, paddingHorizontal: desktop ? 28 : 16, backgroundColor: colors.header, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: desktop ? 16 : 9 }}>
        <IconButton label={desktop ? collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral' : 'Abrir menu de administração'} icon={desktop ? collapsed ? PanelLeftOpen : PanelLeftClose : Menu} expanded={desktop ? !collapsed : drawerOpen} onPress={() => desktop ? setCollapsed((value) => !value) : setDrawerOpen(true)} />
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {desktop && <><Text style={{ color: colors.subtle, fontSize: 12 }}>Painel administrativo</Text><ChevronRight size={13} color={colors.subtle} /></>}
          <Text numberOfLines={1} style={{ color: colors.text, fontSize: desktop ? 12 : 14, fontWeight: '600', flexShrink: 1 }}>{active}</Text>
        </View>
        <IconButton label={refreshing ? 'Atualizando dados' : 'Atualizar dados'} icon={RefreshCw} loading={refreshing} disabled={refreshing || busy} onPress={onRefresh} />
        <IconButton label={isDark ? 'Ativar tema claro do admin' : 'Ativar tema escuro do admin'} icon={isDark ? Sun : Moon} onPress={toggle} />
        {desktop && <View style={{ borderLeftWidth: 1, borderColor: colors.border, paddingLeft: 20 }}><View style={{ width: 33, height: 33, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft }}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>{initials}</Text></View></View>}
      </View>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={desktop} refreshControl={!desktop ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined} contentContainerStyle={{ padding: desktop ? 32 : 16, paddingBottom: Math.max(insets.bottom, 24) + 12, gap: desktop ? 26 : 22, width: '100%', maxWidth: 1600, alignSelf: 'center' }}>
        <View style={{ flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'stretch', justifyContent: 'space-between', gap: 18 }}>
          <View style={{ flex: desktop ? 1 : undefined, gap: 6 }}>
            <Text style={{ color: colors.subtle, fontSize: 10, fontWeight: '600', letterSpacing: 1.3, lineHeight: 17 }}>PAINEL ADMINISTRATIVO</Text>
            <Text heading accessibilityRole="header" style={{ color: colors.text, fontSize: desktop ? 28 : 25, lineHeight: desktop ? 38 : 35, fontWeight: '700', letterSpacing: -0.8 }}>{active}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>{current.description}</Text>
          </View>
          {action && <View style={{ alignSelf: desktop ? 'center' : 'flex-start' }}>{action}</View>}
        </View>
        {children}
      </ScrollView>
    </View>
    {!desktop && <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#0f172a66' }}>
        <Pressable accessibilityLabel="Fechar menu de administração" onPress={() => setDrawerOpen(false)} style={{ position: 'absolute', inset: 0 }} />
        <View accessibilityViewIsModal style={{ width: Math.min(310, width - 24), height: '100%', backgroundColor: colors.header, borderRightWidth: 1, borderColor: colors.border }}>{sidebar(false, true)}</View>
      </View>
    </Modal>}
  </View>;
}

function IconButton({ label, icon: Icon, onPress, disabled = false, loading = false, expanded }: { label: string; icon: typeof Menu; onPress: () => void; disabled?: boolean; loading?: boolean; expanded?: boolean }) {
  const { colors } = useTheme();
  const desktop = useDesktopAdmin();
  const [hovered, setHovered] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, expanded }} onPress={onPress} disabled={disabled} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={({ pressed }) => ({ width: desktop ? 38 : 44, height: desktop ? 38 : 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: hovered || pressed ? colors.soft : 'transparent', opacity: disabled && !loading ? 0.45 : 1 })}>
    {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon size={19} strokeWidth={1.8} color={colors.muted} />}
  </Pressable>;
}

function NavItem({ label, icon: Icon, onPress, active = false, compact = false }: { label: string; icon: typeof Menu; onPress: () => void; active?: boolean; compact?: boolean }) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: compact ? 'center' : undefined, gap: 12, minHeight: 43, paddingHorizontal: compact ? 0 : 12, borderRadius: 8, backgroundColor: active ? colors.primarySoft : hovered || pressed ? colors.soft : 'transparent' })}>
    <Icon size={19} color={active ? colors.primary : colors.muted} strokeWidth={active ? 2 : 1.7} />
    {!compact && <Text style={{ flex: 1, fontSize: 12, lineHeight: 20, color: active ? colors.primary : colors.muted, fontWeight: active ? '600' : '500' }}>{label}</Text>}
    {active && !compact && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary }} />}
  </Pressable>;
}

export function AdminAction({ label, onPress, disabled = false, primary = false, icon: Icon }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; icon?: typeof RefreshCw }) {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  return <Pressable onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 13, paddingVertical: 9, borderWidth: 1, borderColor: primary ? colors.primaryStrong : colors.border, borderRadius: 8, backgroundColor: primary ? colors.primaryStrong : hovered ? colors.soft : colors.surface, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}>
    {Icon && <Icon size={16} color={primary ? colors.onPrimary : colors.muted} />}<Text style={{ color: primary ? colors.onPrimary : colors.text, fontSize: 12, lineHeight: 19, fontWeight: '600', flexShrink: 1 }}>{label}</Text>
  </Pressable>;
}

export function AdminBadge({ label, tone = 'neutral' }: { label: string; tone?: 'success' | 'warning' | 'neutral' | 'danger' }) {
  const { colors, isDark } = useTheme();
  const ink = { success: isDark ? '#6ee7b7' : '#047857', warning: colors.gold, neutral: colors.muted, danger: colors.danger }[tone];
  return <View style={{ alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: `${ink}12`, flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: ink }} /><Text style={{ color: ink, fontSize: 10, lineHeight: 17, fontWeight: '500', flexShrink: 1 }}>{label}</Text></View>;
}

export function AdminTable({ columns, rows, empty, loading = false, minWidth = 760 }: { columns: { label: string; flex?: number; width?: number }[]; rows: { id: string; cells: React.ReactNode[] }[]; empty: string; loading?: boolean; minWidth?: number }) {
  const { colors } = useTheme();
  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface }}>
    <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}><View style={{ flex: 1, minWidth }}>
      <View style={{ flexDirection: 'row', gap: 18, paddingHorizontal: 20, paddingVertical: 13, backgroundColor: colors.soft, borderBottomWidth: 1, borderColor: colors.border }}>{columns.map((column, index) => <Text key={index} style={{ flex: column.width ? undefined : column.flex || 1, width: column.width, color: colors.muted, fontSize: 10, lineHeight: 18, fontWeight: '600', letterSpacing: 0.5 }}>{column.label.toUpperCase()}</Text>)}</View>
      {rows.map((row) => <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.border }}>{row.cells.map((cell, index) => <View key={index} style={{ flex: columns[index]?.width ? undefined : columns[index]?.flex || 1, width: columns[index]?.width, minWidth: 0 }}>{cell}</View>)}</View>)}
      {!rows.length && <View style={{ padding: 35, alignItems: 'center', gap: 12 }}>{loading && <ActivityIndicator color={colors.primary} />}<Text style={{ color: colors.muted, fontSize: 13 }}>{loading ? 'Carregando registros…' : empty}</Text></View>}
    </View></ScrollView>
  </View>;
}
