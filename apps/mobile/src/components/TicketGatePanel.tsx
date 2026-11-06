import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Match, TicketReview, AdmissionResult, GateCredential } from '@nacional/shared/types';
import { useTheme } from '../theme/ThemeProvider';
import { useSession } from '../providers/SessionProvider';
import { gateApi } from '../services/gate';
import { gateCredential } from '../utils/gate-input';
import { ApiError } from '../services/api';
import { Text } from './Typography';
import { Panel, Button } from './ui';
import { AdminField } from './AdminForms';
import { AdminSelect } from './admin/AdminControls';
import { PaymentQrScanner } from './PaymentQrScanner';
import { matchDate, messageOf } from '../utils/format';
import { requestKey } from '../utils/payments';
interface Pending { ticketId: string; matchId: string; sectorId: string; token?: string; code?: string; quantity: number; requestKey: string }
export function TicketGatePanel({ matches, onChanged }: { matches: Match[]; onChanged: () => Promise<void> }) {
  const { colors } = useTheme();
  const { token, member } = useSession();
  const [matchId, setMatch] = useState('');
  const [sectorId, setSector] = useState('');
  const [scanner, setScanner] = useState(false);
  const [input, setInput] = useState('');
  const [review, setReview] = useState<TicketReview | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AdmissionResult | null>(null);
  const [now, setNow] = useState(performance.now());
  const [deadline, setDeadline] = useState(0);
  const [storageReady, setStorageReady] = useState(false);
  const storageKey = `nacional.pending-entry.${member!.id}`;
  const lock = useRef(false);
  const selected = matches.find((item) => item.id === matchId);
  const live = Boolean(review && deadline > now);
  useEffect(() => { const interval = setInterval(() => setNow(performance.now()), 500); return () => clearInterval(interval); }, []);
  useEffect(() => {
    if (result?.decision !== 'ALLOW' || result.duplicate) return;
    const timer = setTimeout(() => setResult(null), 6000);
    return () => clearTimeout(timer);
  }, [result]);
  async function restorePending() {
    setStorageReady(false);
    try {
      const saved = await AsyncStorage.getItem(storageKey);
      if (saved) {
        const operation = JSON.parse(saved) as Pending;
        if (![operation.ticketId, operation.matchId, operation.sectorId, operation.requestKey].every((value) => typeof value === 'string' && value.length >= 16)) throw new Error('Registro local de portaria inválido. Consulte o histórico com o responsável antes de continuar neste aparelho.');
        setPending({ ...operation, token: undefined, code: undefined }); setMatch(operation.matchId); setSector(operation.sectorId);
        setError('Há uma operação anterior sem resposta conferida. Consulte a confirmação antes de liberar outra entrada.');
      }
      setStorageReady(true);
    } catch (err) { setError(messageOf(err)); }
  }
  useEffect(() => { void restorePending(); }, [storageKey]);
  function reset() { setReview(null); setInput(''); setError(''); setResult(null); }
  async function inspect(value: string) {
    if (!storageReady || lock.current || pending) throw new Error('Conclua a consulta da operação anterior.');
    if (!matchId || !sectorId) throw new Error('Selecione a partida e o setor desta portaria.');
    const credential = gateCredential(value);
    lock.current = true; setBusy(true); setReview(null); setResult(null); setError('');
    try { const inspected = await gateApi.inspect(token!, credential, matchId, sectorId); setReview(inspected); setDeadline(performance.now() + Math.max(0, Date.parse(inspected.qrExpiresAt) - Date.parse(inspected.serverTime) - 1500)); setInput(credential.token || credential.code!); setQuantity('1'); setScanner(false); }
    catch (err) { setError(messageOf(err)); throw err; }
    finally { setBusy(false); lock.current = false; }
  }
  async function show(value: AdmissionResult) { await AsyncStorage.removeItem(storageKey); setResult(value); setReview(null); setInput(''); setPending(null); setError(''); }
  async function receipt(op: Pending) {
    try { const value = await gateApi.receipt(token!, op.ticketId, op.matchId, op.sectorId, op.requestKey); await show(value); await onChanged(); return true; }
    catch { return false; }
  }
  async function confirm(op?: Pending) {
    if (!storageReady || lock.current) return;
    if (!op && (!review || !live || !/^\d+$/.test(quantity))) { setError('Confira a quantidade e leia um QR atualizado.'); return; }
    const operation = op || { ticketId: review!.id, matchId, sectorId, ...gateCredential(input), quantity: Number(quantity), requestKey: requestKey() };
    if (operation.quantity < 1 || operation.quantity > (review?.remainingQuantity ?? 4)) { setError('Quantidade acima dos acessos restantes.'); return; }
    lock.current = true; setBusy(true); setError(''); setResult(null); setPending(operation);
    try {
      // Persist receipt identifiers before sending. The short-lived QR itself
      // is never saved. Reopening the panel requires checking any pending op.
      const { token: secretToken, code: secretCode, ...identifiers } = operation;
      await AsyncStorage.setItem(storageKey, JSON.stringify(identifiers));
      const credential: GateCredential = operation.token ? { token: operation.token } : { code: operation.code };
      const value = await gateApi.admit(token!, credential, operation.matchId, operation.sectorId, operation.quantity, operation.requestKey);
      await show(value); await onChanged();
    } catch (err) {
      if (!await receipt(operation)) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          try { await AsyncStorage.removeItem(storageKey); setPending(null); setReview(null); setInput(''); }
          catch { setError('Não foi possível atualizar o registro local. Mantenha o acesso bloqueado e consulte a operação.'); return; }
        }
        setError(`${messageOf(err)} Sem autorização de entrada. Não libere acesso sem confirmação.`);
      }
    } finally { lock.current = false; setBusy(false); }
  }
  async function consult() {
    if (!pending || lock.current) return;
    lock.current = true; setBusy(true);
    if (!await receipt(pending)) setError('Ainda não há confirmação disponível. Mantenha o acesso bloqueado e tente consultar novamente.');
    setBusy(false); lock.current = false;
  }
  return <View style={{ gap: 16 }}>
    {!storageReady && <Button secondary label="Recuperar estado da portaria" onPress={() => void restorePending()} />}
    <AdminSelect label="Partida" value={matchId} disabled={busy || Boolean(pending)} placeholder="Selecione a partida" options={matches.map((match) => ({ value: match.id, label: match.homeTeam + ' × ' + match.awayTeam, description: matchDate(match.startsAt) + (match.entryEnabled ? ' · Portaria aberta' : ' · Portaria desativada') }))} onChange={(id) => { setMatch(id); setSector(''); reset(); }} />
    <AdminSelect label="Setor da portaria" value={sectorId} disabled={!selected || busy || Boolean(pending)} placeholder="Selecione o setor físico" options={(selected?.sectors || []).map((sector) => ({ value: sector.id, label: sector.name }))} onChange={(id) => { setSector(id); reset(); }} />
    <Button label="Ler QR atualizado do ingresso" disabled={!storageReady || !sectorId || !selected?.entryEnabled || busy || Boolean(pending)} onPress={() => { reset(); setScanner(true); }} />
    <AdminField label="Código do ingresso" hint="Digite os 10 caracteres ou cole o conteúdo do QR." autoCapitalize="characters" autoCorrect={false} value={input} onChange={(value) => { if (!busy && !pending) { setInput(value); setReview(null); setResult(null); } }} />
    <Button secondary label="Consultar titular e acessos" disabled={!storageReady || !sectorId || busy || Boolean(pending)} onPress={() => void inspect(input).catch((err) => setError(messageOf(err)))} />
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text>}
    {review && <Panel style={{ gap: 12, borderColor: colors.gold }}><Text style={{ color: colors.gold, fontWeight: '700' }}>CONFERÊNCIA · ENTRADA AINDA NÃO AUTORIZADA</Text><Text style={{ color: colors.text, fontWeight: '700' }}>{review.holder}</Text><Text style={{ color: colors.muted }}>{review.match.homeTeam} × {review.match.awayTeam} · {review.sector.name}</Text><Text style={{ color: colors.text }}>{review.remainingQuantity} entrada(s) restantes</Text><Text style={{ color: live ? colors.gold : colors.danger }}>{live ? `QR/código válido por ${Math.max(0, Math.floor((deadline - now) / 1000))}s` : 'Código expirado. Peça o QR ou código atualizado ao titular.'}</Text><AdminSelect label="Pessoas entrando agora" value={quantity} onChange={setQuantity} disabled={busy || Boolean(pending)} options={[1, 2, 3, 4].map((value) => ({ value: String(value), label: value + ' pessoa(s)', disabled: value > review.remainingQuantity! }))} /><Text style={{ color: colors.muted, fontSize: 14 }}>Confira o titular no app e a quantidade de pessoas presentes antes de confirmar.</Text><Button label="Confirmar e registrar entrada" loading={busy} disabled={!live || Boolean(pending)} onPress={() => void confirm()} /></Panel>}
    {pending && <Panel style={{ gap: 12, borderColor: colors.gold }}><Text style={{ color: colors.gold, fontWeight: '700' }}>OPERAÇÃO SEM RESPOSTA CONFIRMADA</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Não faça outra liberação. Consulte o registro ou repita esta mesma operação sem consumir entradas duas vezes.</Text><Button secondary label="Consultar confirmação no servidor" loading={busy} onPress={() => void consult()} /><Button secondary label="Repetir a mesma operação" disabled={busy || !(pending.token || pending.code)} onPress={() => void confirm(pending)} /></Panel>}
    {result && <Panel style={{ gap: 12, borderColor: result.decision === 'ALLOW' && !result.duplicate ? colors.primary : colors.gold }}><Text accessibilityRole="alert" heading style={{ fontSize: 22, lineHeight: 30, fontWeight: '800', color: result.decision === 'ALLOW' && !result.duplicate ? colors.primary : colors.gold }}>{result.decision === 'ALLOW' && !result.duplicate ? `ENTRADA CONFIRMADA · ${result.admission.quantity} PESSOA(S)` : 'ENTRADA JÁ REGISTRADA · CONFERIR'}</Text><Text style={{ color: colors.text }}>{result.ticket.holder} · {result.ticket.sector.name}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>{result.duplicate ? 'Não libere outra entrada automaticamente. Confira se as pessoas desta operação já passaram.' : 'Esta confirmação consumiu os acessos informados. O QR anterior não funciona novamente.'}</Text><Text style={{ color: colors.muted, fontSize: 14 }}>Restantes: {result.ticket.remainingQuantity} · {new Date(result.admission.createdAt).toLocaleTimeString('pt-BR')}</Text><Text selectable style={{ color: colors.muted, fontSize: 12 }}>Protocolo: {result.admission.id}</Text></Panel>}
    <Text style={{ color: colors.muted, fontSize: 14 }}>A portaria precisa de conexão com o servidor. Consultar o QR não libera acesso; somente uma confirmação registrada autoriza a quantidade indicada.</Text>
    {scanner && <PaymentQrScanner title="Ler ingresso na portaria" manualLabel="Consultar ingresso" instructions="Leia o QR atualizado no app do titular. A leitura só faz a conferência; confirme a entrada em seguida." placeholder="nacional://ticket/…" onRead={inspect} onClose={() => setScanner(false)} />}
  </View>;
}
