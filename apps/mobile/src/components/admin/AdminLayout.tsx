import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, Modal, useWindowDimensions, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LayoutDashboard, CalendarDays, Ticket, Users, BadgeCheck, UserRoundCog, ScanLine, History, ArrowUpRight, LogOut, RefreshCw, Sun, Moon, ChevronRight, Building2, Menu, X, PanelLeftClose, PanelLeftOpen, ShoppingBag } from 'lucide-react-native';
import { Text } from '../Typography';
import { useTheme } from '../../theme/ThemeProvider';
import { useSession } from '../../providers/SessionProvider';
import { club } from '../../config/club';
import { AdminButton } from './AdminControls';
export { AdminButton as AdminAction } from './AdminControls';

export const adminSections = [
  { name: 'Visão geral', icon: LayoutDashboard, group: 'Operação', description: 'Os números e as próximas ações do clube.' },
  { name: 'Jogos', icon: CalendarDays, group: 'Operação', description: 'Partidas, setores e disponibilidade de ingressos.' },
  { name: 'Vendas', icon: Ticket, group: 'Operação', description: 'Encontre pedidos e acompanhe os resultados.' },
  { name: 'Loja', icon: ShoppingBag, group: 'Operação', description: 'Produtos, pedidos, estoque e opções de entrega.' },
  { name: 'Pagamentos', icon: BadgeCheck, group: 'Operação', description: 'Pix, conciliação e devoluções.' },
  { name: 'Saques', icon: BadgeCheck, group: 'Operação', description: 'Pedidos de saque, envios realizados e comprovantes do time.' },
  { name: 'Financeiro', icon: BadgeCheck, group: 'Operação', description: 'Comissão da empresa, taxas e conciliação dos recebimentos.' },
  { name: 'Torcedores', icon: Users, group: 'Gestão', description: 'Contas e associações da sua torcida.' },
  { name: 'Planos', icon: BadgeCheck, group: 'Gestão', description: 'Mensalidades e benefícios de cada plano.' },
  { name: 'Parceiros', icon: Building2, group: 'Gestão', description: 'Estabelecimentos, ofertas, cashback e acessos de caixa.' },
  { name: 'Email e acesso', icon: UserRoundCog, group: 'Gestão', description: 'Recuperação de senha, configuração SMTP e acompanhamento dos envios.' },
  { name: 'Funcionários', icon: UserRoundCog, group: 'Gestão', description: 'Equipe, acessos e escalas de portaria.' },
  { name: 'Portaria', icon: ScanLine, group: 'Controle', description: 'Confira o ingresso e registre a entrada.' },
  { name: 'Histórico de portaria', icon: History, group: 'Controle', description: 'Entradas, recusas e protocolos de validação.' },
  { name: 'Auditoria', icon: History, group: 'Controle', description: 'Consulte as ações realizadas pela administração.' },
];
export function useDesktopAdmin() { return useWindowDimensions().width >= 1024; }
type LayoutProps = React.PropsWithChildren<{ active: string; onSelect: (section: string) => void; onBack: () => void; onSignOut: () => void; refreshing: boolean; onRefresh: () => void; busy: boolean; action?: React.ReactNode }>;
export function AdminLayout({ children, active, onSelect, onBack, onSignOut, refreshing, onRefresh, busy, action }: LayoutProps) {
  const desktop = useDesktopAdmin(), { width } = useWindowDimensions(), { colors, isDark, toggle } = useTheme(), { member } = useSession(), insets = useSafeAreaInsets();
  const [drawer, setDrawer] = useState(false), [collapsed, setCollapsed] = useState(false);
  const current = adminSections.find((section) => section.name === active) || adminSections[0]!;
  const initials = member?.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
  useEffect(() => { if (desktop) setDrawer(false); }, [desktop]);
  const select = (name: string) => { onSelect(name); setDrawer(false); };
  const sidebar = (compact: boolean) => <View style={{ flex: 1, backgroundColor: colors.header, paddingHorizontal: compact ? 12 : 16, paddingTop: desktop ? 26 : Math.max(insets.top, 22), paddingBottom: Math.max(insets.bottom, 16), gap: 24 }}>
    <View style={{ flexDirection: 'row', gap: 11, alignItems: 'center', paddingHorizontal: compact ? 0 : 6 }}><View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center' }}><Building2 size={18} color={colors.onPrimary} strokeWidth={1.7} /></View>{!compact && <View style={{ flex: 1, gap: 1 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>{club.shortName}</Text><Text style={{ color: colors.subtle, fontSize: 11 }}>Administração</Text></View>}{!desktop && <AdminButton label="Fechar menu" icon={X} iconOnly variant="ghost" onPress={() => setDrawer(false)} />}</View>
    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: 3 }}>{adminSections.map((section, index) => <React.Fragment key={section.name}>{!compact && section.group !== adminSections[index - 1]?.group && <Text style={{ color: colors.subtle, fontSize: 10, fontWeight: '500', paddingHorizontal: 12, marginTop: index ? 22 : 1, marginBottom: 8 }}>{section.group}</Text>}<NavItem label={section.name} icon={section.icon} active={active === section.name} compact={compact} onPress={() => select(section.name)} /></React.Fragment>)}</ScrollView>
    <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 14, gap: 14 }}><NavItem label="Área do torcedor" icon={ArrowUpRight} compact={compact} onPress={() => { setDrawer(false); onBack(); }} /><View style={{ flexDirection: compact ? 'column' : 'row', alignItems: 'center', gap: 9 }}><View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.soft }}><Text style={{ color: colors.muted, fontSize: 10, fontWeight: '600' }}>{initials}</Text></View>{!compact && <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ color: colors.text, fontSize: 11, fontWeight: '500' }}>{member?.name}</Text><Text style={{ color: colors.subtle, fontSize: 10 }}>Administrador</Text></View>}<AdminButton label="Sair da conta" icon={LogOut} iconOnly variant="ghost" disabled={busy} onPress={onSignOut} /></View></View>
  </View>;
  return <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', backgroundColor: colors.background, paddingTop: insets.top }}><StatusBar style={isDark ? 'light' : 'dark'} />
    {desktop && <View style={{ width: collapsed ? 68 : 226, borderRightWidth: 1, borderColor: colors.border }}>{sidebar(collapsed)}</View>}
    <View style={{ flex: 1, minWidth: 0 }}><View style={{ minHeight: 62, paddingHorizontal: desktop ? 24 : 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}><AdminButton label={desktop ? collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral' : 'Abrir menu'} icon={desktop ? collapsed ? PanelLeftOpen : PanelLeftClose : Menu} iconOnly variant="ghost" onPress={() => desktop ? setCollapsed(!collapsed) : setDrawer(true)} /><View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}>{desktop && <><Text style={{ color: colors.subtle, fontSize: 12 }}>Administração</Text><ChevronRight size={13} color={colors.subtle} /></>}<Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '500', flexShrink: 1 }}>{active}</Text></View><AdminButton label="Atualizar dados" icon={RefreshCw} iconOnly variant="ghost" loading={refreshing} disabled={busy} onPress={onRefresh} /><AdminButton label={isDark ? 'Usar tema claro' : 'Usar tema escuro'} icon={isDark ? Sun : Moon} iconOnly variant="ghost" onPress={toggle} /></View>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />} contentContainerStyle={{ width: '100%', maxWidth: 1500, alignSelf: 'center', paddingHorizontal: desktop ? 32 : 16, paddingTop: desktop ? 30 : 22, paddingBottom: Math.max(insets.bottom, 32), gap: 24 }}><View style={{ flexDirection: desktop ? 'row' : 'column', justifyContent: 'space-between', alignItems: desktop ? 'center' : undefined, gap: 16 }}><View style={{ flex: desktop ? 1 : undefined, gap: 4 }}><Text heading accessibilityRole="header" style={{ color: colors.text, fontSize: desktop ? 27 : 24, lineHeight: 36, fontWeight: '600', letterSpacing: -0.8 }}>{active}</Text><Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>{current.description}</Text></View>{action && <View style={{ alignSelf: desktop ? 'center' : 'flex-start' }}>{action}</View>}</View>{children}</ScrollView>
    </View>
    {!desktop && <Modal visible={drawer} transparent animationType="fade" onRequestClose={() => setDrawer(false)}><View style={{ flex: 1, flexDirection: 'row' }}><Pressable accessibilityLabel="Fechar menu" onPress={() => setDrawer(false)} style={{ position: 'absolute', inset: 0, backgroundColor: '#00000050' }} /><View accessibilityViewIsModal style={{ width: Math.min(290, width - 40), height: '100%', borderRightWidth: 1, borderColor: colors.border }}>{sidebar(false)}</View></View></Modal>}
  </View>;
}
function NavItem({ label, icon: Icon, onPress, active = false, compact = false }: { label: string; icon: typeof Menu; onPress: () => void; active?: boolean; compact?: boolean }) {
  const { colors } = useTheme();
  const [hover, setHover] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} style={({ pressed }) => ({ minHeight: 41, paddingHorizontal: compact ? 0 : 12, flexDirection: 'row', alignItems: 'center', justifyContent: compact ? 'center' : undefined, gap: 11, borderRadius: 7, backgroundColor: active ? colors.primarySoft : hover || pressed ? colors.soft : 'transparent' })}><Icon size={17} strokeWidth={1.7} color={active ? colors.primary : colors.muted} />{!compact && <Text style={{ flex: 1, color: active ? colors.primary : colors.muted, fontSize: 12, fontWeight: active ? '600' : '400' }}>{label}</Text>}</Pressable>;
}
export function AdminBadge({ label, tone = 'neutral' }: { label: string; tone?: 'success' | 'warning' | 'neutral' | 'danger' }) {
  const { colors, isDark } = useTheme();
  const ink = { success: isDark ? '#6ee7b7' : '#16744a', warning: colors.gold, neutral: colors.muted, danger: colors.danger }[tone];
  return <View style={{ alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: `${ink}0d`, borderWidth: 1, borderColor: `${ink}16` }}><Text style={{ color: ink, fontSize: 11, lineHeight: 17, fontWeight: '500', flexShrink: 1 }}>{label}</Text></View>;
}
export function AdminTable({ columns, rows, empty, loading = false, minWidth = 760 }: { columns: { label: string; flex?: number; width?: number }[]; rows: { id: string; cells: React.ReactNode[] }[]; empty: string; loading?: boolean; minWidth?: number }) {
  const { colors } = useTheme();
  return <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface }}><ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}><View style={{ flex: 1, minWidth }}><View style={{ flexDirection: 'row', gap: 18, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.soft, borderBottomWidth: 1, borderColor: colors.border }}>{columns.map((column, index) => <Text key={index} style={{ flex: column.width ? undefined : column.flex || 1, width: column.width, color: colors.muted, fontSize: 11, lineHeight: 18, fontWeight: '500' }}>{column.label}</Text>)}</View>{rows.map((row, index) => <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: 20, paddingVertical: 17, borderBottomWidth: index === rows.length - 1 ? 0 : 1, borderColor: colors.border }}>{row.cells.map((cell, index) => <View key={index} style={{ flex: columns[index]?.width ? undefined : columns[index]?.flex || 1, width: columns[index]?.width, minWidth: 0 }}>{cell}</View>)}</View>)}{!rows.length && <View style={{ padding: 38, alignItems: 'center', gap: 10 }}>{loading && <ActivityIndicator color={colors.primary} />}<Text style={{ color: colors.muted, fontSize: 13 }}>{loading ? 'Carregando registros…' : empty}</Text></View>}</View></ScrollView></View>;
}
