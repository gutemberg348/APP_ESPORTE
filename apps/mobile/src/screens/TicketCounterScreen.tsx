import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { validTaxId } from '@nacional/shared/forms';
import QRCode from 'react-native-qrcode-svg';
import { AdminButton, AdminField, AdminNotice, AdminSelect } from '../components/admin/AdminControls';
import { Text } from '../components/Typography';
import { Page, Panel, Title } from '../components/ui';
import { PixCheckout } from '../components/PixCheckout';
import { TicketBarcode } from '../components/TicketBarcode';
import { useSession } from '../providers/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { ApiError } from '../services/api';
import { counterApi, deliverTickets, type CounterLot, type CounterOrder, type CounterReceipt } from '../services/ticket-counter';
import { money, matchDate, messageOf } from '../utils/format';
import { requestKey } from '../utils/payments';
import { SecurityScreen } from './SecurityScreen';

export function TicketCounterScreen() {
  const { token, member, signOut } = useSession();
  const { colors } = useTheme();
  const [lots, setLots] = useState<CounterLot[]>([]), [recent, setRecent] = useState<CounterOrder[]>([]);
  const [match, setMatch] = useState(''), [lotId, setLotId] = useState(''), [cpf, setCpf] = useState('');
  const [quantity, setQuantity] = useState('1'), [method, setMethod] = useState('CASH');
  const [block, setBlock] = useState(''), [row, setRow] = useState(''), [first, setFirst] = useState('');
  const [receipt, setReceipt] = useState<CounterReceipt | null>(null), [security, setSecurity] = useState(false);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [pending, setPending] = useState(''), key = useRef(''), lock = useRef(false);
  const storage = 'nacional.counter.' + member!.id, lot = lots.find(l => l.id === lotId);
  const games = [...new Map(lots.map(l => [l.match.id, l.match])).values()];
  const n = Number(quantity), document = cpf.replace(/\D/g, '');
  const valid = !!lot && document.length === 11 && validTaxId(document) && Number.isInteger(n) && n >= 1 && n <= Math.min(10, lot.available) && (method !== 'PIX' || (lot.pixAvailable !== false && lot.unitCents > 0))
    && (!lot.sector.numerado || (Number(block) > 0 && /^[A-Z]{1,10}$/.test(row) && Number(first) > 0));
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) { setError(messageOf(e)); } finally { lock.current = false; setBusy(false); }
  }
  async function reload() {
    const [options, sales] = await Promise.all([counterApi.lots(token!), counterApi.recent(token!)]);
    setLots(options); setRecent(sales);
  }
  async function initialize() {
    const saved = await AsyncStorage.getItem(storage);
    key.current = saved || ''; setPending(saved || '');
    await reload(); setReady(true);
  }
  useEffect(() => { void run(initialize); }, [storage]);
  const awaitingTerminal = receipt?.metodoBalcao === 'PAGBANK' && receipt.statusPagamento === 'PENDENTE' ? receipt.chaveBalcao : null;
  useEffect(() => {
    if (!token || !awaitingTerminal) return;
    let active = true, reading = false;
    const timer = setInterval(async () => {
      if (reading || lock.current || (AppState.currentState && AppState.currentState !== 'active')) return;
      reading = true;
      try {
        const fresh = await counterApi.receipt(token, awaitingTerminal);
        if (active && (fresh.statusPagamento !== 'PENDENTE' || fresh.expiraEm === null)) {
          setReceipt(current => current?.chaveBalcao === awaitingTerminal && current.statusPagamento === 'PENDENTE' &&
            (current.expiraEm !== fresh.expiraEm || current.statusPagamento !== fresh.statusPagamento) ? fresh : current);
          if (fresh.statusPagamento !== 'PENDENTE') setRecent(list => list.map(item => item.id === fresh.id ? fresh : item));
        }
      } catch { /* The manual status button reports connectivity failures. */ }
      finally { reading = false; }
    }, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [token, awaitingTerminal]);
  async function finish(result: CounterReceipt) {
    setReceipt(result); setCpf(''); setQuantity('1'); setBlock(''); setRow(''); setFirst('');
    await AsyncStorage.removeItem(storage); key.current = ''; setPending('');
    await reload();
  }
  async function recover() {
    try { await finish(await counterApi.receipt(token!, pending)); }
    catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'COUNTER_NOT_FOUND') throw e;
      setPending('');
      setError('Ainda não há venda com essa referência. Confira os dados e repita o registro com a mesma referência, sem cobrar outra vez.');
    }
  }
  async function sell() {
    if (!ready || !valid || !lot) return;
    const ref = key.current || requestKey();
    await AsyncStorage.setItem(storage, ref); key.current = ref; setPending(ref);
    try {
      const result = await counterApi.sell(token!, { key: ref, cpf: document, lotId, quantity: n, method, unitCents: lot.unitCents,
        ...(lot.sector.numerado && { seat: { block: Number(block), row, first: Number(first) } }) });
      await finish(result);
    } catch (e) {
      if (e instanceof ApiError && ([409,422].includes(e.status) || e.code === 'SICREDI_DISABLED') && e.code !== 'COUNTER_KEY_CONFLICT') {
        await AsyncStorage.removeItem(storage); key.current = ''; setPending(''); await reload();
      }
      throw e;
    }
  }
  async function settle(pay: boolean) {
    if (!receipt) return;
    await AsyncStorage.setItem(storage, receipt.chaveBalcao);
    key.current = receipt.chaveBalcao; setPending(receipt.chaveBalcao);
    await finish(await counterApi.settle(token!, receipt.chaveBalcao, pay));
  }
  if (security) return <SecurityScreen onBack={() => setSecurity(false)} />;
  return <Page><View style={{ gap: 16, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
    <Title title="Bilheteria" subtitle={member?.name} />
    {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
    {!!pending && <Panel><AdminNotice>Confira o resultado da última operação antes de cobrar novamente.</AdminNotice>
      <AdminButton label="Consultar venda" onPress={() => void run(recover)} loading={busy} /></Panel>}
    {!ready && <AdminButton label="Carregar bilheteria" loading={busy} onPress={() => void run(initialize)} />}
    {ready && !pending && !receipt && <Panel style={{ gap: 14 }}>
        <AdminField label="CPF do comprador" value={cpf} onChange={setCpf} mask="document" maxLength={14} keyboardType="number-pad" />
        <AdminSelect label="Jogo" value={match} options={games.map(g => ({ value: g.id, label: g.timeMandante + ' × ' + g.timeVisitante, description: matchDate(g.dataPartida) }))} onChange={v => { setMatch(v); setLotId(''); }} />
        <AdminSelect label="Setor e ingresso" value={lotId} options={lots.filter(l => l.match.id === match).map(l => ({ value: l.id, label: l.sector.nome + ' · ' + l.name + ' · ' + money(l.unitCents), description: l.available + ' disponíveis' }))} onChange={setLotId} />
        {!lots.length && <AdminNotice>Nenhum lote disponível. Confira a publicação e as datas de venda da partida no admin.</AdminNotice>}
        <AdminSelect label="Quantidade" value={quantity} options={Array.from({ length: Math.min(10, lot?.available || 1) }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} onChange={setQuantity} />
        {lot?.sector.numerado && <>
          <AdminField label="Bloco" value={block} onChange={setBlock} keyboardType="number-pad" />
          <AdminField label="Fileira" value={row} onChange={s => setRow(s.toUpperCase())} maxLength={10} />
          <AdminField label={n > 1 ? 'Primeiro assento da sequência' : 'Assento'} value={first} onChange={setFirst} keyboardType="number-pad" />
        </>}
        <AdminSelect label="Recebimento" value={method} options={[{ value: 'CASH', label: 'Dinheiro' }, { value: 'CARD', label: 'Cartão físico no balcão' }, ...(lot?.pixAvailable === false ? [] : [{ value: 'PIX', label: 'Pix Sicredi' }])]} onChange={setMethod} />
        <AdminButton label={'Reservar ingressos' + (lot ? ' · ' + money(n * lot.unitCents) : '')} disabled={!valid || busy} primary onPress={() => void run(sell)} />
    </Panel>}
    {receipt && !pending && <Panel style={{ gap: 14 }}>
      <Title title={receipt.statusPagamento === 'PENDENTE' ? 'Receber ' + money(receipt.valorTotalCentavos) : receipt.statusPagamento === 'PAGO' ? 'Bilhetes da venda' : 'Reserva encerrada'} subtitle={receipt.partida.timeMandante + ' × ' + receipt.partida.timeVisitante + ' · ' + money(receipt.valorTotalCentavos)} />
      {receipt.statusPagamento === 'PENDENTE' && <>
        <Text style={{ color: colors.text }}>{receipt.ingressos.length} ingresso(s) · {receipt.ingressos[0]?.alocacao.setor.nome} · {receipt.ingressos[0]?.nomeTitular}</Text>
        {receipt.metodoBalcao === 'PAGBANK' ? <>
          <AdminNotice>Abra o pedido {receipt.id.slice(-6)} no app da Moderninha com sua conta de vendedor.</AdminNotice>
          <AdminButton label="Consultar pagamento" loading={busy} onPress={() => void run(async () => { await finish(await counterApi.receipt(token!, receipt.chaveBalcao)); })} />
        </> : receipt.metodoBalcao === 'PIX' ? <PixCheckout key={receipt.chaveBalcao} counterKey={receipt.chaveBalcao}
          reservation={{ expiresAt: receipt.expiraEm, instructions: 'Aguarde a confirmação do Sicredi.' }}
          onChanged={async () => {
            const fresh = await counterApi.receipt(token!, receipt.chaveBalcao);
            setReceipt(current => current?.id === fresh.id ? fresh : current);
            await reload();
          }} /> : <>
        <AdminNotice>{receipt.metodoBalcao === 'CARD' ? 'Confirme a aprovação na maquineta.' : 'Confira o dinheiro recebido.'} Reserva até {receipt.expiraEm && matchDate(receipt.expiraEm)}.</AdminNotice>
        <AdminButton label={receipt.metodoBalcao === 'CARD' ? 'Cartão aprovado · emitir ingressos' : 'Recebi em dinheiro · emitir ingressos'} primary loading={busy} onPress={() => void run(() => settle(true))} />
        </>}
        <AdminButton label="Cancelar reserva" disabled={busy || (receipt.metodoBalcao === 'PAGBANK' && !receipt.expiraEm)} onPress={() => void run(() => settle(false))} />
      </>}
      {['ESTORNADO','ESTORNADO_PARCIALMENTE'].includes(receipt.statusPagamento) && <AdminNotice>Pagamento estornado. Bilhetes bloqueados para novas entradas.</AdminNotice>}
      {['EXPIRADO','CANCELADO'].includes(receipt.statusPagamento) && <AdminNotice>Reserva {receipt.statusPagamento === 'EXPIRADO' ? 'expirada' : 'cancelada'}. Os lugares foram devolvidos ao estoque.</AdminNotice>}
      {receipt.statusPagamento === 'PAGO' && <>{receipt.ingressos.map((t, i) => <View key={t.id} style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <Text style={{ color: colors.text }}>Ingresso {i + 1} · {t.alocacao.setor.nome} · {t.nomeTitular}</Text>
        {t.status === 'VENDIDO' && receipt.statusPagamento === 'PAGO' && t.chaveQr && t.codigoPortaria ? <><View style={{ padding: 14, backgroundColor: '#fff' }}><QRCode size={160} value={t.chaveQr} /></View><View style={{ width: '100%' }}><TicketBarcode code={t.codigoPortaria} /></View></> : <Text style={{ color: colors.muted }}>{t.status}</Text>}
      </View>)}
      <AdminButton primary label="Imprimir ingressos" disabled={busy} onPress={() => void run(() => deliverTickets(token!, receipt.chaveBalcao, true))} />
      <AdminButton label={Platform.OS === 'web' ? 'Baixar PDF para enviar' : 'Enviar PDF'} disabled={busy} onPress={() => void run(() => deliverTickets(token!, receipt.chaveBalcao, false))} />
      </>}
      <AdminButton label="Nova venda" disabled={busy || !!pending} onPress={() => setReceipt(null)} />
    </Panel>}
    {!pending && <Panel style={{ gap: 8 }}>
      <Title title="Minhas vendas" />
      <AdminButton label="Atualizar" disabled={busy} onPress={() => void run(reload)} />
      {recent.map(o => <AdminButton key={o.id} label={matchDate(o.criadoEm) + ' · ' + money(o.valorTotalCentavos) + ' · ' + o.statusPagamento + ' · ' + o.id.slice(-6)} disabled={busy} onPress={() => void run(async () => { setReceipt(await counterApi.receipt(token!, o.chaveBalcao)); })} />)}
    </Panel>}
    <AdminButton label="Senha e sessões" disabled={busy} onPress={() => setSecurity(true)} />
    <AdminButton label="Sair" disabled={busy} onPress={() => void run(signOut)} />
  </View></Page>;
}
