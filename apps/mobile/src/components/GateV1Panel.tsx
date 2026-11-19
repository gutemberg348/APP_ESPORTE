import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Camera, Check, CircleAlert, DoorOpen, History, ImagePlus, Keyboard as KeyboardIcon, MapPin, RefreshCw, ScanLine } from 'lucide-react-native';
import type { GateV1Match, GateV1Ticket, GateV1Operation, GateV1Receipt } from '@nacional/shared/gate-v1';
import { gateV1Api } from '../services/gate-v1';
import { readGateImage } from '../services/gate-image';
import { gateCredential } from '../utils/gate-input';
import { gateV1Input } from '../utils/gate-v1-input';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { matchDate, messageOf } from '../utils/format';
import { requestKey } from '../utils/payments';
import { ApiError } from '../services/api';
import { Text } from './Typography';
import { Panel } from './ui';
import { AdminButton, AdminField, AdminSelect, AdminNotice, AdminSection } from './admin/AdminControls';
import { QrScannerContent } from './PaymentQrScanner';
import { Sheet } from './Sheet';
import { config } from '../config/env';
import { defaultGate, parseStation, resolveStation, type Station } from '../utils/gate-station';
import { GateV1History } from './GateV1History';

export function GateV1Panel() {
  const { token, member } = useSession(), { colors } = useTheme();
  const [matches, setMatches] = useState<GateV1Match[]>([]), [matchId, setMatch] = useState(''), [allocationId, setAllocation] = useState(''), [gate, setGate] = useState('PORTAO-01');
  const [input, setInput] = useState(''), [review, setReview] = useState<GateV1Ticket | null>(null), [credential, setCredential] = useState(''), [result, setResult] = useState<GateV1Receipt | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [readingImage, setReadingImage] = useState(false), [error, setError] = useState(''), [scanner, setScanner] = useState(false);
  const [pending, setPending] = useState<GateV1Operation | null>(null), [storageReady, setStorageReady] = useState(false), [resetAllowed, setResetAllowed] = useState(false), [history, setHistory] = useState(false), [revision, setRevision] = useState(0);
  const [showStation, setShowStation] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualRevision, setManualRevision] = useState(0);
  const [readingMode, setReadingMode] = useState<'camera' | 'manual' | 'image'>('camera');
  const [registrationError, setRegistrationError] = useState('');
  const [lastStation, setLastStation] = useState<Station | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const lock = useRef(false), mounted = useRef(true), catalogRequest = useRef(0);
  const storageKey = `nacional.gate-v1.pending.${member!.id}`;
  const stationKey = `nacional.gate.station.${encodeURIComponent(config.apiUrl)}.${config.tenantSlug}.${member!.id}`;
  const selected = matches.find((row) => row.id === matchId), blocked = loading || busy || readingImage || !!pending || !storageReady;
  const sector = selected?.alocacoesSetor.find(row => row.id === allocationId);
  const [historyApp, setHistoryApp] = useState(false);
  const appScope = selected?.source ? { partidaId: matchId, alocacaoId: allocationId } : sector?.appScope;
  const showAppHistory = !!selected?.source || !!sector?.appOnly || (!!appScope && historyApp);
  async function load() {
    const sequence = ++catalogRequest.current;
    setLoading(true);
    try {
      const value = await gateV1Api.matches(token!, true);
      if (mounted.current && sequence === catalogRequest.current) { setMatches(value); setCatalogReady(true); }
    } catch (err) {
      if (mounted.current && sequence === catalogRequest.current) setError(messageOf(err));
    } finally {
      if (mounted.current && sequence === catalogRequest.current) setLoading(false);
    }
  }
  async function restore() {
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      if (raw) { const op = JSON.parse(raw) as GateV1Operation;
        if (![op.partidaId, op.alocacaoId, op.requestKey].every((v) => typeof v === 'string' && /^[a-zA-Z0-9_-]{16,80}$/.test(v)) || (op.source !== undefined && (op.source !== 'app' || !op.ticketId)) || typeof op.catracaId !== 'string') throw new Error('Registro local inválido. Solicite conferência do administrador.');
        if (mounted.current) { setPending(op); }
      }
      const station = await AsyncStorage.getItem(stationKey).then(parseStation).catch(() => null);
      if (mounted.current) { setLastStation(station); setStorageReady(true); }
    } catch (err) { if (mounted.current) setError(messageOf(err)); }
  }
  useEffect(() => {
    mounted.current = true;
    void restore();
    return () => { mounted.current = false; };
  }, [storageKey, stationKey]);
  useEffect(() => { void load(); return () => { catalogRequest.current++; }; }, [token]);

  const restored = useRef(false);
  useEffect(() => {
    if (!catalogReady || loading || !storageReady || restored.current) return;
    restored.current = true;
    const station = resolveStation(matches, lastStation);
    if (!station) { setShowStation(true); return; }
    setMatch(station.partidaId); setAllocation(station.alocacaoId); setGate(station.catracaId);
  }, [matches, lastStation, catalogReady, loading, storageReady]);

  useEffect(() => {
    if (!sector || !storageReady || !gate.trim()) return;
    const station: Station = { partidaId: matchId, alocacaoId: allocationId, catracaId: gate.trim() };
    void AsyncStorage.setItem(stationKey, JSON.stringify(station)).catch(() => {});
  }, [sector, matchId, allocationId, gate, storageReady, stationKey]);
  function clearReview() { setReview(null); setCredential(''); setResult(null); setError(''); setRegistrationError(''); }
  async function inspect(raw: string) {
    if (lock.current || pending || !storageReady) return;
    Keyboard.dismiss();
    clearReview();
    if (!selected || !allocationId || !selected.alocacoesSetor.some(row => row.id === allocationId)) throw new Error('Selecione a partida e o setor físico da portaria.');
    const counterCode = /^INGV1\./.test(raw.trim()) || /^[A-Fa-f0-9]{16}$/.test(raw.replace(/[\s-]/g, ''));
    const useApp = !!selected.source || !!sector?.appOnly || (!!appScope && !counterCode);
    const scope = useApp && appScope ? { ...appScope, source: 'app' as const } : { partidaId: matchId, alocacaoId: allocationId };
    const appCredential = useApp ? gateCredential(raw) : null;
    const value = appCredential ? (appCredential.token || appCredential.code)! : gateV1Input(raw);
    lock.current = true; setBusy(true);
    try {
      const ticket = await gateV1Api.inspect(token!, { ...scope, catracaId: gate.trim() || undefined, chaveQr: value });
      if (mounted.current) { setReview(ticket); setCredential(value); setInput(''); setScanner(false); }
    } catch (err) { if (mounted.current) setError(messageOf(err)); throw err; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function display(receipt: GateV1Receipt) {
    await AsyncStorage.removeItem(storageKey);
    if (mounted.current) { setPending(null); setReview(null); setCredential(''); setInput(''); setResult(receipt); setError(''); setResetAllowed(false); setRevision((n) => n + 1); }
  }
  async function consult(operation: GateV1Operation) {
    try { await display(await gateV1Api.receipt(token!, operation)); return 'recorded'; }
    catch (err) { const absent = err instanceof ApiError && err.code === 'ADMISSION_NOT_FOUND'; if (mounted.current) { setResetAllowed(absent); setError(`${messageOf(err)} Mantenha o acesso bloqueado enquanto não houver confirmação.`); } return absent ? 'missing' : 'unknown'; }
  }
  async function admit() {
    if (lock.current || pending || !review || !credential || !storageReady || loading) return;
    if (!selected?.alocacoesSetor.some(row => row.id === allocationId)) {
      clearReview(); setError('A escala mudou. Selecione novamente a partida e o setor.'); return;
    }
    const operation = { partidaId: review.partida.id, alocacaoId: review.alocacao.id, catracaId: gate.trim(), requestKey: requestKey(), source: review.remainingQuantity !== undefined ? 'app' as const : undefined, ticketId: review.id };
    if (!operation.catracaId) { setError('Identifique o portão ou a catraca.'); return; }
    lock.current = true; setBusy(true); setError(''); setResult(null); setResetAllowed(false);
    try {
      // Save identifiers only. QR and manual credentials never enter local storage.
      try { await AsyncStorage.setItem(storageKey, JSON.stringify(operation)); }
      catch { setError('Não foi possível guardar a operação neste dispositivo. Nenhuma entrada foi enviada.'); return; }
      setPending(operation);
      await display(await gateV1Api.admit(token!, { ...operation, chaveQr: credential }));
    } catch (err) {
      // A scope refusal on this first submission occurs before any admission is written.
      const refusedScope = err instanceof ApiError && err.status === 403 && ['GATE_SCOPE_DENIED', 'GATE_REQUIRED'].includes(err.code);
      if (refusedScope || (await consult(operation) === 'missing' && err instanceof ApiError && err.status >= 400 && err.status < 500)) {
        try { await AsyncStorage.removeItem(storageKey); }
        catch { if (mounted.current) setError('Não foi possível limpar a operação pendente. Consulte o protocolo novamente.'); return; }
        if (mounted.current) {
          setPending(null); setReview(null); setCredential(''); setInput(''); setResetAllowed(false);
          setError(''); setRegistrationError(messageOf(err));
        }
      }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function openScanner() { clearReview(); setReadingMode('camera'); setScanner(true); }
  function openManual() {
    clearReview(); setReadingMode('manual'); setShowManual(true);
    setManualRevision(current => current + 1);
  }
  function readManual() {
    if (!input.trim()) return;
    setReadingMode('manual');
    void inspect(input).catch(err => setError(messageOf(err)));
  }
  async function image() {
    if (blocked) return; clearReview(); setReadingImage(true); setError('');
    setReadingMode('image');
    try { const value = await readGateImage(); if (value && mounted.current) await inspect(value); }
    catch (err) { if (mounted.current) setError(messageOf(err)); }
    finally { if (mounted.current) setReadingImage(false); }
  }
  const editingStation = showStation || !sector || !gate.trim();
  const canScan = !blocked && !!sector && !!gate.trim();
  const confirming = Boolean(review) && !pending;
  const popupOpen = scanner || confirming || !!pending || !!result || !!registrationError;
  const title = pending ? (busy ? 'Registrando entrada' : 'Conferir registro')
    : result ? (result.duplicate ? 'Entrada já registrada' : 'Entrada confirmada')
    : registrationError ? 'Entrada não registrada' : review ? 'Conferir ingresso' : 'Ler ingresso';
  const protocol = result?.admission.id;
  const popupFooter = pending ? <View style={{ gap: 8 }}>
    <AdminButton primary label="Consultar confirmação" icon={RefreshCw} loading={busy} onPress={() => {
      if (lock.current) return;
      lock.current = true; setBusy(true);
      void consult(pending).finally(() => { lock.current = false; if (mounted.current) setBusy(false); });
    }} />
    {resetAllowed && <AdminButton label="Ninguém passou · nova leitura" disabled={busy} onPress={() => {
      if (lock.current) return;
      lock.current = true; setBusy(true);
      void AsyncStorage.removeItem(storageKey).then(() => {
        setPending(null); setResetAllowed(false); setInput(''); clearReview();
      }).catch(err => setError(messageOf(err))).finally(() => { lock.current = false; setBusy(false); });
    }} />}
  </View> : confirming ? <View style={{ gap: 8 }}>
    <AdminButton primary icon={Check} label="Registrar entrada" loading={busy} onPress={() => void admit()} />
    <AdminButton variant="ghost" label="Cancelar leitura" disabled={busy} onPress={clearReview} />
  </View> : result || registrationError ? <View style={{ gap: 8 }}>
    <AdminButton primary icon={readingMode === 'manual' ? KeyboardIcon : readingMode === 'image' ? ImagePlus : Camera}
      label={readingMode === 'manual' ? 'Consultar próximo código' : readingMode === 'image' ? 'Ler outra imagem' : 'Ler próximo ingresso'} disabled={!canScan}
      onPress={readingMode === 'manual' ? openManual : readingMode === 'image' ? () => void image() : openScanner} />
    <AdminButton variant="ghost" label="Voltar à portaria" onPress={clearReview} />
  </View> : undefined;
  return <View style={{ gap: 14 }}>
    <Panel style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ backgroundColor: colors.primarySoft, padding: 10, borderRadius: 10 }}><DoorOpen color={colors.primary} size={20} /></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text heading style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>Posto de entrada</Text>
          {!!selected && <Text style={{ color: colors.muted, fontSize: 13 }}>{selected.timeMandante} × {selected.timeVisitante}</Text>}
        </View>
        {sector && <AdminButton size="small" variant="ghost" label={showStation ? 'Fechar' : 'Trocar'} disabled={blocked} onPress={() => setShowStation(!showStation)} />}
      </View>
      {loading && !selected && <Text style={{ color: colors.muted }}>Carregando sua escala…</Text>}
      {catalogReady && !loading && !matches.length && <AdminNotice>Você está sem jogos na escala. Solicite ao administrador o acesso ao setor.</AdminNotice>}
      {!editingStation && sector && <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <MapPin size={14} color={colors.muted} /><Text style={{ flex: 1, color: colors.muted, fontSize: 13 }}>{sector.setor.nome} · {gate}</Text>
      </View>}
      {editingStation && !!matches.length && <View style={{ gap: 12 }}>
        <AdminSelect label="Partida" value={matchId} disabled={blocked}
          options={matches.map(row => ({ value: row.id, label: `${row.timeMandante} × ${row.timeVisitante}`, description: matchDate(row.dataPartida) }))}
          placeholder="Selecione a partida" onChange={id => {
            const next = matches.find(row => row.id === id)?.alocacoesSetor ?? [];
            const only = next.length === 1 ? next[0] : undefined;
            setMatch(id); setAllocation(only?.id || ''); setGate(defaultGate(only?.setor.portaoEntrada)); clearReview();
          }} />
        <AdminSelect label="Setor" value={allocationId} disabled={blocked || !selected}
          options={(selected?.alocacoesSetor || []).map(row => ({ value: row.id, label: row.setor.nome }))}
          placeholder="Selecione o setor" onChange={id => {
            setAllocation(id); setGate(defaultGate(selected?.alocacoesSetor.find(row => row.id === id)?.setor.portaoEntrada)); clearReview();
          }} />
        <AdminField label="Portão / catraca" value={gate} onChange={setGate} maxLength={50} editable={!blocked} required />
        {sector && <AdminButton label="Usar este posto" icon={Check} disabled={!canScan} onPress={() => setShowStation(false)} />}
      </View>}
      {(editingStation || !catalogReady) && <AdminButton label="Atualizar escala" icon={RefreshCw} variant="ghost"
        loading={loading} disabled={busy || readingImage || !!pending} onPress={() => { clearReview(); void load(); }} />}
    </Panel>
    <Panel style={{ gap: 12 }}>
      <AdminButton label="Ler ingresso com a câmera" icon={Camera} primary disabled={!canScan} onPress={openScanner} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexGrow: 1 }}><AdminButton label="Ler imagem" icon={ImagePlus} loading={readingImage} disabled={!canScan} onPress={() => void image()} /></View>
        <View style={{ flexGrow: 1 }}><AdminButton label={showManual ? 'Ocultar código' : 'Código ou USB'} icon={KeyboardIcon} disabled={!canScan}
          onPress={() => showManual ? setShowManual(false) : openManual()} /></View>
      </View>
      {showManual && <View style={{ gap: 10 }}>
        <AdminField key={manualRevision} label="Código do ingresso" value={input} onChange={setInput} autoFocus autoCapitalize="none" autoCorrect={false}
          maxLength={2070} editable={canScan} returnKeyType="go" onSubmitEditing={readManual}
          hint="Digite ou use o leitor USB em modo teclado." />
        <AdminButton label="Consultar ingresso" icon={ScanLine} primary loading={busy && !pending}
          disabled={!canScan || !input.trim()} onPress={readManual} />
      </View>}
      {!!error && !popupOpen && <AdminNotice tone="error">{error}</AdminNotice>}
      {!storageReady && !loading && <AdminButton label="Recuperar estado da portaria" onPress={() => void restore()} />}
    </Panel>

    <AdminButton label={history ? 'Ocultar histórico' : 'Histórico de entradas'} icon={History} variant="ghost" onPress={() => setHistory(!history)} />
    {history && sector?.appScope && !sector.appOnly && <AdminSelect label="Histórico de entradas" value={showAppHistory ? 'app' : 'counter'}
      options={[{ value: 'app', label: 'Ingressos do app' }, { value: 'counter', label: 'Bilheteria e emissão manual' }]} onChange={v => setHistoryApp(v === 'app')} />}
    {history && <GateV1History refreshKey={revision} source={showAppHistory ? 'app' : undefined}
      partidaId={(showAppHistory ? appScope?.partidaId : matchId) || undefined} alocacaoId={(showAppHistory ? appScope?.alocacaoId : allocationId) || undefined} />}

    {popupOpen && <Sheet visible title={title} footer={popupFooter} closeDisabled={busy || !!pending}
      onClose={() => { setScanner(false); clearReview(); }}>
      {scanner && <QrScannerContent ticketMode instructions="Enquadre o QR ou o código de barras." placeholder="QR ou código do ingresso" manualLabel="Consultar ingresso" onRead={inspect} />}
      {confirming && review && <Panel style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontSize: 21, fontWeight: '700' }}>{review.nomeTitular || 'Ingresso válido para conferência'}</Text>
        {!!review.cpfFinal && review.nomeTitular !== `CPF final ${review.cpfFinal}` && <Text style={{ color: colors.muted }}>CPF final {review.cpfFinal}</Text>}
        <Text style={{ color: colors.muted }}>{review.alocacao.setor.nome} · {review.remainingQuantity !== undefined
          ? `${review.remainingQuantity} entrada(s) disponível(is)` : review.blocoEscolhido ? `Bloco ${review.blocoEscolhido} · Fileira ${review.fileiraEscolhida} · Assento ${review.assentoEscolhido}` : 'Assento livre'}</Text>
        {!!review.alocacao.setor.instrucaoAcomodacao && <Text style={{ color: colors.muted }}>{review.alocacao.setor.instrucaoAcomodacao}</Text>}
        <Text style={{ color: colors.subtle, fontSize: 12 }}>Confira o titular e registre a entrada.</Text>
      </Panel>}
      {pending && <AdminNotice tone="warning">Aguarde a confirmação para liberar a passagem.</AdminNotice>}
      {result && <View accessibilityLiveRegion="polite" style={{ gap: 10 }}>
        {result.duplicate ? <CircleAlert size={29} color={colors.gold} /> : <Check size={29} color={colors.primary} />}
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 17 }}>{result.ticket.nomeTitular} · {result.ticket.alocacao.setor.nome}</Text>
        <Text style={{ color: colors.muted }}>{result.duplicate
          ? 'Confira se a pessoa desta operação já passou. O protocolo corresponde à mesma entrada.'
          : result.ticket.remainingQuantity ? `1 entrada registrada. Faltam ${result.ticket.remainingQuantity} do grupo. Leia o novo código para a próxima.` : '1 entrada registrada.'}</Text>
        <Text selectable style={{ color: colors.subtle, fontSize: 12 }}>Protocolo {protocol}</Text>
      </View>}
      {!!error && !scanner && <AdminNotice tone="error">{error}</AdminNotice>}
      {!!registrationError && <AdminNotice tone="error">{registrationError}</AdminNotice>}
    </Sheet>}
  </View>;
}
