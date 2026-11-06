import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { Employee, Match } from '@nacional/shared/types';
import { Panel } from './ui';
import { Text } from './Typography';
import { Sheet } from './Sheet';
import { AdminField, AdminFormGrid, AdminToggle, AdminNotice, AdminButton, AdminSection, AdminMenu } from './admin/AdminControls';
import { AdminTable, AdminBadge } from './admin/AdminLayout';
import { Search, Plus, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { employeeApi } from '../services/gate';
import { matchDate, messageOf } from '../utils/format';

export function EmployeePanel({ matches, desktop = false }: { matches: Match[]; desktop?: boolean }) {
  const { token } = useSession();
  const { colors } = useTheme();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
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
  const visible = employees.filter((employee) => (employee.name + ' ' + employee.email).toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')));
  const actions = (employee: Employee) => <AdminMenu disabled={busy} items={[
    { label: 'Definir escala', onPress: () => open('assignments', employee) },
    { label: 'Redefinir senha', onPress: () => open('password', employee) },
    { label: employee.active ? 'Desativar acesso' : 'Reativar acesso', danger: employee.active, onPress: () => void perform(() => employeeApi.update(token!, employee.id, !employee.active), employee.active ? 'Acesso desativado e sessões encerradas.' : 'Funcionário reativado.') },
  ]} />;
  return <View style={{ gap: 20 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}><View style={{ flexGrow: 1, flexBasis: 240 }}><AdminField label="Buscar funcionário" icon={Search} placeholder="Nome ou e-mail" value={search} onChange={setSearch} /></View><AdminButton primary label="Novo funcionário" icon={Plus} disabled={busy} onPress={() => open('create')} /><AdminButton label="Atualizar" icon={RefreshCw} loading={loading} disabled={busy} onPress={() => void refresh()} /></View>
    {!!notice && <AdminNotice tone="success">{notice}</AdminNotice>}{!!error && !form && <AdminNotice tone="error">{error}</AdminNotice>}
    {desktop ? <AdminTable loading={loading} columns={[{ label: 'Funcionário', flex: 1.4 }, { label: 'Acesso', width: 120 }, { label: 'Escala', flex: 1.5 }, { label: 'Ações', width: 170 }]} rows={visible.map((employee) => ({ id: employee.id, cells: [<View style={{ gap: 4 }}><Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>{employee.name}</Text><Text style={{ color: colors.muted, fontSize: 12 }}>{employee.email}</Text></View>, <AdminBadge label={employee.active ? 'Ativo' : 'Desativado'} tone={employee.active ? 'success' : 'neutral'} />, <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 21 }}>{employee.assignments.filter((item) => item.active).map((item) => item.matchLabel + ' · ' + item.sectorName).join('\n') || 'Sem setores liberados'}</Text>, actions(employee)] }))} empty="Nenhum funcionário encontrado." /> : <View style={{ gap: 12 }}>{visible.map((employee) => <Panel key={employee.id} style={{ gap: 12 }}><View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}><Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>{employee.name}</Text><AdminBadge label={employee.active ? 'Ativo' : 'Desativado'} tone={employee.active ? 'success' : 'neutral'} /></View><Text style={{ color: colors.muted, fontSize: 12 }}>{employee.email}</Text><Text style={{ color: colors.subtle, fontSize: 12 }}>{employee.assignments.filter((item) => item.active).length} setor(es) na escala</Text>{actions(employee)}</Panel>)}{!loading && !visible.length && <AdminNotice>Nenhum funcionário encontrado. Cadastre a equipe para organizar a portaria.</AdminNotice>}</View>}
    {form && <Sheet visible title={form === 'create' ? 'Novo funcionário' : form === 'password' ? 'Redefinir senha' : 'Escala de portaria'} onClose={close}>
      {selected && <Text style={{ color: colors.muted, fontSize: 13 }}>{selected.name} · {selected.email}</Text>}
      {form === 'create' && <AdminFormGrid><AdminField label="Nome completo" value={name} onChange={setName} required editable={!busy} /><AdminField label="E-mail de acesso" value={email} onChange={setEmail} required autoCapitalize="none" keyboardType="email-address" editable={!busy} /></AdminFormGrid>}
      {form !== 'assignments' ? <><AdminNotice>Use uma senha de pelo menos 12 caracteres. Envie as credenciais ao funcionário por um canal privado.</AdminNotice><AdminFormGrid><AdminField label="Senha" value={password} onChange={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" maxLength={128} editable={!busy} /><AdminField label="Confirmar senha" value={confirmation} onChange={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="newPassword" maxLength={128} editable={!busy} /></AdminFormGrid><AdminButton primary label={form === 'create' ? 'Criar conta de portaria' : 'Salvar nova senha'} loading={busy} onPress={() => savePassword(form === 'create')} /></> : <><AdminNotice>Selecione os setores que este funcionário pode operar. Salvar sem marcações remove todas as liberações.</AdminNotice>{matches.map((match) => <AdminSection key={match.id} title={match.homeTeam + ' × ' + match.awayTeam} description={matchDate(match.startsAt)}>{match.sectors.map((sector) => <AdminToggle key={sector.id} checkbox disabled={busy} label={sector.name} value={sectors.includes(sector.id)} onChange={(checked) => setSectors((previous) => checked ? [...previous, sector.id] : previous.filter((id) => id !== sector.id))} />)}</AdminSection>)}<AdminButton primary label={'Salvar escala · ' + sectors.length + ' setor(es)'} loading={busy} onPress={() => void perform(() => employeeApi.assignments(token!, selected!.id, sectors), 'Escala atualizada.')} /></>}
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
    </Sheet>}
  </View>;
}
