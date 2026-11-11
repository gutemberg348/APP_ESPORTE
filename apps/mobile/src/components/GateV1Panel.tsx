import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Camera, ImagePlus, ScanLine } from 'lucide-react-native';
import type { GateV1Match, GateV1Ticket, GateV1Operation, GateV1Receipt } from '@nacional/shared/gate-v1';
import { gateV1Api } from '../services/gate-v1';
import { readGateImage } from '../services/gate-image';
import { gateV1Input } from '../utils/gate-v1-input';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { messageOf } from '../utils/format';
import { requestKey } from '../utils/payments';
import { ApiError } from '../services/api';
import { Text } from './Typography';
import { Panel } from './ui';
import { AdminButton, AdminField, AdminSelect, AdminNotice, AdminSection } from './admin/AdminControls';
import { PaymentQrScanner } from './PaymentQrScanner';
import { GateV1History } from './GateV1History';

export function GateV1Panel() {
  const { token, member } = useSession(), { colors } = useTheme();
  const [matches, setMatches] = useState<GateV1Match[]>([]), [matchId, setMatch] = useState(''), [allocationId, setAllocation] = useState(''), [gate, setGate] = useState('PORTAO-01');
  const [input, setInput] = useState(''), [review, setReview] = useState<GateV1Ticket | null>(null), [credential, setCredential] = useState(''), [result, setResult] = useState<GateV1Receipt | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [readingImage, setReadingImage] = useState(false), [error, setError] = useState(''), [scanner, setScanner] = useState(false);
  const [pending, setPending] = useState<GateV1Operation | null>(null), [storageReady, setStorageReady] = useState(false), [resetAllowed, setResetAllowed] = useState(false), [history, setHistory] = useState(false), [revision, setRevision] = useState(0);
  const lock = useRef(false), mounted = useRef(true), storageKey = `nacional.gate-v1.pending.${member!.id}`;
  const selected = matches.find((row) => row.id === matchId), blocked = busy || readingImage || !!pending || !storageReady;
  async function load() { setLoading(true); try { const value = await gateV1Api.matches(token!); if (mounted.current) setMatches(value); } catch (err) { if (mounted.current) setError(messageOf(err)); } finally { if (mounted.current) setLoading(false); } }
  async function restore() {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) { const op = JSON.parse(raw) as GateV1Operation;
        if (![op.partidaId, op.alocacaoId, op.requestKey].every((v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(v)) || typeof op.catracaId !== 'string') throw new Error('Registro local inválido. Solicite conferência do administrador.');
        if (mounted.current) { setPending(op); setMatch(op.partidaId); setAllocation(op.alocacaoId); }
      }
      if (mounted.current) setStorageReady(true);
    } catch (err) { if (mounted.current) setError(messageOf(err)); }
  }
  useEffect(() => { mounted.current = true; void load(); void restore(); return () => { mounted.current = false; }; }, [token, storageKey]);
  function clearReview() { setReview(null); setCredential(''); setResult(null); setError(''); }
  async function inspect(raw: string) {
    if (lock.current || pending || !storageReady) return;
    if (!matchId || !allocationId) throw new Error('Selecione a partida e o setor físico da portaria.');
    const value = gateV1Input(raw);
    lock.current = true; setBusy(true); clearReview();
    try {
      const ticket = await gateV1Api.inspect(token!, { partidaId: matchId, alocacaoId: allocationId, chaveQr: value });
      if (mounted.current) { setReview(ticket); setCredential(value); setInput(value); setScanner(false); }
    } catch (err) { if (mounted.current) setError(messageOf(err)); throw err; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function display(receipt: GateV1Receipt) {
    await AsyncStorage.removeItem(storageKey);
    if (mounted.current) { setPending(null); setReview(null); setCredential(''); setInput(''); setResult(receipt); setError(''); setResetAllowed(false); setRevision((n) => n + 1); }
  }
  async function consult(operation: GateV1Operation) {
    try { await display(await gateV1Api.receipt(token!, operation)); return true; }
    catch (err) { if (mounted.current) { setResetAllowed(err instanceof ApiError && err.code === 'ADMISSION_NOT_FOUND'); setError(`${messageOf(err)} Mantenha o acesso bloqueado enquanto não houver confirmação.`); } return false; }
  }
  async function admit() {
    if (lock.current || pending || !review || !credential || !storageReady) return;
    const operation = { partidaId: matchId, alocacaoId: allocationId, catracaId: gate.trim(), requestKey: requestKey() };
    if (!operation.catracaId) { setError('Identifique o portão ou a catraca.'); return; }
    lock.current = true; setBusy(true); setError(''); setResult(null);
    try {
      // Save identifiers only. QR and manual credentials never enter local storage.
      await AsyncStorage.setItem(storageKey, JSON.stringify(operation)); setPending(operation);
      await display(await gateV1Api.admit(token!, { ...operation, chaveQr: credential }));
    } catch (err) {
      if (!await consult(operation) && err instanceof ApiError && err.status >= 400 && err.status < 500) {
        await AsyncStorage.removeItem(storageKey); if (mounted.current) { setPending(null); setReview(null); setError(messageOf(err)); }
      }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function image() {
    if (blocked) return; setReadingImage(true); setError('');
    try { const value = await readGateImage(); if (value && mounted.current) await inspect(value); }
    catch (err) { if (mounted.current) setError(messageOf(err)); }
    finally { if (mounted.current) setReadingImage(false); }
  }
  return <View style={{ gap: 18 }}>
    <Panel><AdminSection title="Conferir ingresso" description="Selecione a partida e o setor. A leitura consulta o ingresso; a entrada só é autorizada após confirmar no servidor.">
      <AdminButton label="Atualizar escala" loading={loading} disabled={blocked} onPress={() => void load()} />
      {!loading && !matches.length && <AdminNotice>Nenhuma escala disponível. O administrador deve liberar a partida e o setor em Funcionários.</AdminNotice>}
      <AdminSelect label="Partida" value={matchId} disabled={blocked} options={matches.map((row) => ({ value: row.id, label: `${row.timeMandante} × ${row.timeVisitante}`, description: row.portariaAtiva ? 'Portaria habilitada · conferir horário' : 'Portaria desativada' }))} onChange={(id) => { setMatch(id); setAllocation(''); clearReview(); }} placeholder="Selecione a partida" />
      <AdminSelect label="Setor desta portaria" value={allocationId} disabled={blocked || !selected} options={(selected?.alocacoesSetor || []).map((row) => ({ value: row.id, label: row.setor.nome }))} onChange={(id) => { setAllocation(id); setGate(selected?.alocacoesSetor.find((row) => row.id === id)?.setor.portaoEntrada?.slice(0, 50) || 'PORTAO-01'); clearReview(); }} placeholder="Selecione o setor" />
      <AdminField label="Portão / catraca" value={gate} onChange={setGate} maxLength={50} editable={!blocked} required />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <AdminButton label="Ler com câmera" icon={Camera} disabled={blocked || !allocationId} onPress={() => setScanner(true)} />
        <AdminButton label="Ler imagem do QR" icon={ImagePlus} loading={readingImage} disabled={blocked || !allocationId} onPress={() => void image()} />
      </View>
      <AdminField label="Código do ingresso ou leitor USB" value={input} onChange={(value) => { setInput(value); clearReview(); }} autoCapitalize="none" autoCorrect={false} maxLength={1024} editable={!blocked} returnKeyType="go" onSubmitEditing={() => void inspect(input).catch((err) => setError(messageOf(err)))} hint="Digite o código impresso ou deixe este campo focado para usar o leitor USB em modo teclado com Enter." />
      <AdminButton label="Consultar ingresso" icon={ScanLine} primary loading={busy && !pending} disabled={blocked || !allocationId || !input.trim()} onPress={() => void inspect(input).catch((err) => setError(messageOf(err)))} />
      {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
      {!storageReady && <AdminButton label="Recuperar estado da portaria" onPress={() => void restore()} />}
    </AdminSection></Panel>
    {review && !pending && <Panel><AdminSection title="Confira antes de liberar" description="Entrada ainda não autorizada.">
      <Text style={{ color: colors.text, fontSize: 19, fontWeight: '700' }}>{review.nomeTitular}</Text>
      <Text style={{ color: colors.muted }}>{review.alocacao.setor.nome} · {review.blocoEscolhido ? `Bloco ${review.blocoEscolhido} · Fileira ${review.fileiraEscolhida} · Assento ${review.assentoEscolhido}` : 'Assento livre'}</Text>
      <Text selectable style={{ color: colors.muted }}>{review.codigoPortaria}</Text>
      {!!review.alocacao.setor.instrucaoAcomodacao && <Text style={{ color: colors.muted }}>{review.alocacao.setor.instrucaoAcomodacao}</Text>}
      <AdminButton label="Confirmar e registrar uma entrada" primary disabled={busy} loading={busy} onPress={() => void admit()} />
    </AdminSection></Panel>}
    {pending && <Panel><AdminSection title="Operação sem resposta confirmada" description="Mantenha o acesso bloqueado. Consultar o protocolo não libera outra entrada.">
      <AdminButton label="Consultar confirmação no servidor" loading={busy} onPress={() => { if (lock.current) return; lock.current = true; setBusy(true); void consult(pending).finally(() => { lock.current = false; setBusy(false); }); }} />
      {resetAllowed && <AdminButton label="Nova leitura — ninguém foi liberado" disabled={busy} onPress={() => { void AsyncStorage.removeItem(storageKey).then(() => { setPending(null); setResetAllowed(false); setInput(''); clearReview(); }).catch((err) => setError(messageOf(err))); }} />}
    </AdminSection></Panel>}
    {!!result && <AdminNotice tone={result.duplicate ? 'warning' : 'success'}><View style={{ gap: 8 }}><Text style={{ color: result.duplicate ? colors.gold : colors.primary, fontSize: 20, fontWeight: '700' }}>{result.duplicate ? 'Entrada já registrada — conferir' : 'Entrada confirmada — 1 pessoa'}</Text><Text style={{ color: colors.text }}>{result.ticket.nomeTitular} · {result.ticket.alocacao.setor.nome}</Text><Text style={{ color: colors.muted }}>{result.duplicate ? 'Confira se a pessoa desta operação já passou. Não autorize outra passagem.' : 'O ingresso foi consumido e não permite nova entrada.'}</Text><Text selectable style={{ color: colors.muted, fontSize: 12 }}>Protocolo: {result.admission.id}</Text></View></AdminNotice>}
    <AdminButton label={history ? 'Ocultar histórico' : 'Histórico de entradas'} onPress={() => setHistory(!history)} />
    {history && <GateV1History refreshKey={revision} partidaId={matchId || undefined} alocacaoId={allocationId || undefined} />}
    {scanner && <PaymentQrScanner ticketMode title="Ler ingresso" instructions="Leia o QR ou código de barras do ingresso V1. A leitura não autoriza entrada automaticamente." placeholder="QR INGV1… ou código impresso" manualLabel="Consultar ingresso" onRead={inspect} onClose={() => setScanner(false)} />}
  </View>;
}
