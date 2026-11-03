import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import type { Employee, Match } from '@nacional/shared/types';
import { Panel, Button } from './ui';
import { Text, TextInput } from './Typography';
import { Sheet } from './Sheet';
import { AdminField } from './AdminForms';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { employeeApi } from '../services/gate';
import { matchDate, messageOf } from '../utils/format';

export function EmployeePanel({ matches }: { matches: Match[] }) {
  const { token } = useSession();
  const { colors } = useTheme();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<'create' | 'password' | 'assignments' | null>(null);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [sectors, setSectors] = useState<string[]>([]);
  const lock = useRef(false), revision = useRef(0);
  async function refresh() {
    if (!token) return;
    const current = ++revision.current; setLoading(true);
    try { const value = await employeeApi.list(token); if (current === revision.current) setEmployees(value); }
    catch (err) { if (current === revision.current) setError(messageOf(err)); }
    finally { if (current === revision.current) setLoading(false); }
  }
  useEffect(() => { void refresh(); return () => { revision.current++; }; }, [token]);
  function close() { if (lock.current) return; setForm(null); setPassword(''); setConfirmation(''); setError(''); }
  function open(kind: 'create' | 'password' | 'assignments', employee: Employee | null = null) {
    setError(''); setNotice(''); setSelected(employee); setPassword(''); setConfirmation(''); setName(''); setEmail('');
    setSectors(employee?.assignments.filter((item) => item.active).map((item) => item.sectorId) || []); setForm(kind);
  }
  async function perform(work: () => Promise<unknown>, message: string) {
    if (lock.current || !token) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); setForm(null); setPassword(''); setConfirmation(''); setNotice(message); await refresh(); }
    catch (err) { setError(messageOf(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  function savePassword(create: boolean) {
    if (password.length < 12 || password.length > 128 || password !== confirmation) { setError('Use uma senha de 12 a 128 caracteres e confirme com a mesma senha.'); return; }
    if (create && (name.trim().length < 2 || !email.trim())) { setError('Informe nome e e-mail do funcionário.'); return; }
    void perform(() => create ? employeeApi.create(token!, { name: name.trim(), email: email.trim().toLowerCase(), password }) : employeeApi.password(token!, selected!.id, password), create ? 'Funcionário cadastrado. Agora libere seus setores em Definir escala.' : 'Senha redefinida e sessões anteriores revogadas.');
  }
  const passwordField = { color: colors.text, backgroundColor: colors.soft, borderWidth: 1, borderColor: colors.border, padding: 14, borderRadius: 12 };
  return <View style={{ gap: 16 }}>
    <Text style={{ color: colors.muted }}>Contas exclusivas para conferir ingressos. O funcionário usa o mesmo login do app e é direcionado à portaria, operando somente nos setores liberados na escala.</Text>
    <Button label="Cadastrar funcionário de portaria" disabled={busy} onPress={() => open('create')} />
    <Button secondary label="Atualizar funcionários" loading={loading} disabled={busy} onPress={() => void refresh()} />
    {!!notice && <Text accessibilityRole="alert" style={{ color: colors.primary }}>{notice}</Text>}
    {!!error && !form && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    {employees.map((employee) => <Panel key={employee.id} style={{ gap: 12 }}>
      <Text heading style={{ color: colors.text, fontSize: 20, fontWeight: '700' }}>{employee.name}</Text>
      <Text style={{ color: colors.muted }}>{employee.email}</Text>
      <Text style={{ color: employee.active ? colors.primary : colors.danger }}>{employee.active ? 'Portaria · conta ativa' : 'Conta desativada'}</Text>
      <Text style={{ color: colors.muted, fontSize: 14 }}>{employee.assignments.filter((item) => item.active).map((item) => `${item.matchLabel} · ${item.sectorName}`).join('\n') || 'Sem setores liberados'}</Text>
      <Button secondary label="Definir escala de jogos e setores" disabled={busy} onPress={() => open('assignments', employee)} />
      <Button secondary label="Redefinir senha" disabled={busy} onPress={() => open('password', employee)} />
      <Button secondary label={employee.active ? 'Desativar e encerrar sessões' : 'Reativar funcionário'} disabled={busy} onPress={() => void perform(() => employeeApi.update(token!, employee.id, !employee.active), employee.active ? 'Acesso desativado e sessões encerradas.' : 'Funcionário reativado.')} />
    </Panel>)}
    {!loading && !employees.length && <Text style={{ color: colors.muted }}>Cadastre a equipe antes de abrir a portaria.</Text>}
    {form && <Sheet visible title={form === 'create' ? 'Novo funcionário' : form === 'password' ? `Senha · ${selected?.name}` : `Escala · ${selected?.name}`} onClose={close}>
      {form === 'create' && <><AdminField label="Nome completo" value={name} onChange={setName} /><AdminField label="E-mail de acesso" value={email} onChange={setEmail} /></>}
      {form !== 'assignments' ? <>
        <Text style={{ color: colors.muted }}>Senha com pelo menos 12 caracteres. Entregue as credenciais ao funcionário por um canal privado.</Text>
        <TextInput accessibilityLabel="Senha do funcionário" placeholder="Senha" placeholderTextColor={colors.muted} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" maxLength={128} editable={!busy} style={passwordField} />
        <TextInput accessibilityLabel="Confirmar senha do funcionário" placeholder="Confirmar senha" placeholderTextColor={colors.muted} value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" maxLength={128} editable={!busy} style={passwordField} />
        <Button label={form === 'create' ? 'Criar conta de portaria' : 'Salvar senha e encerrar sessões'} loading={busy} onPress={() => savePassword(form === 'create')} />
      </> : <>
        <Text style={{ color: colors.muted }}>Marque cada setor permitido. Salvar sem marcações remove todas as liberações. A alteração vale nas próximas consultas e confirmações.</Text>
        {matches.map((match) => <View key={match.id} style={{ gap: 10 }}><Text style={{ color: colors.text, fontWeight: '700' }}>{match.homeTeam} × {match.awayTeam}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{matchDate(match.startsAt)}</Text>{match.sectors.map((sector) => <Pressable key={sector.id} disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: sectors.includes(sector.id) }} onPress={() => setSectors((previous) => previous.includes(sector.id) ? previous.filter((id) => id !== sector.id) : [...previous, sector.id])} style={{ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: sectors.includes(sector.id) ? colors.primary : colors.border }}><Text style={{ color: sectors.includes(sector.id) ? colors.primary : colors.muted }}>{sectors.includes(sector.id) ? '✓ ' : '○ '}{sector.name}</Text></Pressable>)}</View>)}
        <Button label={`Salvar escala · ${sectors.length} setor(es)`} loading={busy} onPress={() => void perform(() => employeeApi.assignments(token!, selected!.id, sectors), 'Escala de portaria atualizada.')} />
      </>}
      {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    </Sheet>}
  </View>;
}
