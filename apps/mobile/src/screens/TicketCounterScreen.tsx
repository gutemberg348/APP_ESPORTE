import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { ArrowRight, Banknote, ChevronRight, CreditCard, IdCard, LogOut, Minus, Plus, QrCode, RefreshCw, ShieldCheck } from 'lucide-react-native';
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
import { AdminBadge } from '../components/admin/AdminLayout';

const paymentOptions = [
  { value: 'CASH', label: 'Dinheiro', icon: Banknote },
  { value: 'CARD', label: 'Cartão físico', icon: CreditCard },
  { value: 'PIX', label: 'Pix Sicredi', icon: QrCode },
];
const statusLabels: Record<string, string> = {
  PENDENTE: 'A receber', PAGO: 'Pago', CANCELADO: 'Cancelado', EXPIRADO: 'Expirado',
  ESTORNADO: 'Estornado', ESTORNADO_PARCIALMENTE: 'Estorno parcial',
};

export function TicketCounterScreen({ onBack }: { onBack?: () => void }) {
  const { token, member, signOut } = useSession();
  const { colors } = useTheme();
  const wide = useWindowDimensions().width >= 900;
  const [history, setHistory] = useState(false);
  const [lots, setLots] = useState<CounterLot[]>([]), [recent, setRecent] = useState<CounterOrder[]>([]);
  const [match, setMatch] = useState(''), [lotId, setLotId] = useState(''), [cpf, setCpf] = useState('');
  const [quantity, setQuantity] = useState('1'), [method, setMethod] = useState('CASH');
  const [block, setBlock] = useState(''), [row, setRow] = useState(''), [first, setFirst] = useState('');
  const [receipt, setReceipt] = useState<CounterReceipt | null>(null), [security, setSecurity] = useState(false);
  const [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [pending, setPending] = useState(''), key = useRef(''), lock = useRef(false);
  const storage = 'nacional.counter.' + member!.id, lot = lots.find(l => l.id === lotId);
  const games = [...new Map(lots.map(l => [l.match.id, l.match])).values()];
  const maxQuantity = Math.min(10, lot?.available ?? 0);
  function selectLot(id: string) {
    setLotId(id); setQuantity('1'); setBlock(''); setRow(''); setFirst('');
    if (method === 'PIX') {
      const next = lots.find(item => item.id === id);
      if (!next?.unitCents || next.pixAvailable === false) setMethod('CASH');
    }
  }
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
    setReceipt(result); setHistory(false); setCpf(''); setQuantity('1'); setBlock(''); setRow(''); setFirst('');
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
  return <Page><View style={{ gap: 20, width: '100%', maxWidth: 1120, alignSelf: 'center' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderColor: colors.border }}>
      <View style={{ flex: 1, minWidth: 120 }}><Title title="Bilheteria" subtitle={member?.name} /></View>
      {onBack && <AdminButton label="Voltar ao painel" variant="ghost" disabled={busy} onPress={onBack} />}
      <AdminButton label="Senha e sessões" icon={ShieldCheck} iconOnly={!wide} variant="ghost" disabled={busy} onPress={() => setSecurity(true)} />
      <AdminButton label="Sair" icon={LogOut} variant="ghost" disabled={busy} onPress={() => void run(signOut)} />
    </View>
    {!!error && <AdminNotice tone="error">{error}</AdminNotice>}
    {!!pending && <Panel><AdminNotice>Confira o resultado da última operação antes de cobrar novamente.</AdminNotice>
      <AdminButton label="Consultar venda" onPress={() => void run(recover)} loading={busy} /></Panel>}
    {!ready && <AdminButton label="Carregar bilheteria" loading={busy} onPress={() => void run(initialize)} />}
    {!wide && ready && !pending && <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><AdminButton label={receipt ? 'Venda atual' : 'Nova venda'} primary={!history} onPress={() => setHistory(false)} /></View>
      <View style={{ flex: 1 }}><AdminButton label="Minhas vendas" primary={history} onPress={() => setHistory(true)} /></View>
    </View>}
    <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: 'stretch', gap: 18 }}>
    {(wide || !history) && <View style={{ flex: wide ? 1.55 : undefined, minWidth: 0 }}>
    {ready && !pending && !receipt && <Panel style={{ gap: 16 }}>
        <Text heading style={{ fontSize: 20, color: colors.text, fontWeight: '700' }}>Nova venda</Text>
        <AdminField label="CPF do comprador" icon={IdCard} placeholder="000.000.000-00" error={document.length === 11 && !validTaxId(document) ? 'Confira os dígitos do CPF.' : undefined} value={cpf} onChange={setCpf} mask="document" maxLength={14} keyboardType="number-pad" />
        <AdminSelect label="Jogo" placeholder="Selecione a partida" value={match} options={games.map(g => ({ value: g.id, label: g.timeMandante + ' × ' + g.timeVisitante, description: matchDate(g.dataPartida) }))} onChange={v => { setMatch(v); const options = lots.filter(l => l.match.id === v); selectLot(options.length === 1 ? options[0]!.id : ''); }} />
        <AdminSelect label="Setor e ingresso" placeholder={match ? 'Escolha o ingresso' : 'Selecione o jogo primeiro'} disabled={!match} value={lotId} options={lots.filter(l => l.match.id === match).map(l => ({ value: l.id, label: l.sector.nome + ' · ' + l.name + ' · ' + money(l.unitCents), description: l.available + ' disponíveis' }))} onChange={selectLot} />
        {!lots.length && <AdminNotice>Nenhum lote disponível. Confira a publicação e as datas de venda da partida no admin.</AdminNotice>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>Quantidade</Text>
          <AdminButton iconOnly icon={Minus} label="Remover um ingresso" disabled={!lot || n <= 1} onPress={() => setQuantity(String(n - 1))} />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700' }}>{quantity}</Text>
          <AdminButton iconOnly icon={Plus} label="Adicionar um ingresso" disabled={n >= maxQuantity} onPress={() => setQuantity(String(n + 1))} />
        </View>
        {lot?.sector.numerado && <>
          <AdminField label="Bloco" value={block} onChange={setBlock} keyboardType="number-pad" />
          <AdminField label="Fileira" value={row} onChange={s => setRow(s.toUpperCase())} maxLength={10} />
          <AdminField label={n > 1 ? 'Primeiro assento da sequência' : 'Assento'} value={first} onChange={setFirst} keyboardType="number-pad" />
        </>}
        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>Como o cliente vai pagar?</Text>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {paymentOptions.filter(p => p.value !== 'PIX' || !lot || (lot.pixAvailable !== false && lot.unitCents > 0)).map(({ value, label, icon: Icon }) => {
            const selected = method === value;
            return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setMethod(value)}
              style={{ flexGrow: 1, padding: 10, minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, borderRadius: 8, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primarySoft : colors.surface }}>
              <Icon size={17} color={selected ? colors.primary : colors.muted} /><Text style={{ color: selected ? colors.primary : colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
            </Pressable>;
          })}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderColor: colors.border }}><Text style={{ flex: 1, color: colors.muted }}>Total da venda</Text><Text heading style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>{lot ? money(n * lot.unitCents) : '—'}</Text></View>
        <AdminButton icon={ArrowRight} label="Reservar ingressos" disabled={!valid || busy} primary onPress={() => void run(sell)} />
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
        <AdminButton variant="ghost" label="Cancelar reserva" disabled={busy || (receipt.metodoBalcao === 'PAGBANK' && !receipt.expiraEm)} onPress={() => void run(() => settle(false))} />
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
    </View>}
    {ready && !pending && (wide || history) && <View style={{ flex: wide ? 1 : undefined, minWidth: 0 }}><Panel style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text heading style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' }}>Minhas vendas</Text><AdminButton label="Atualizar vendas" icon={RefreshCw} iconOnly variant="ghost" disabled={busy} onPress={() => void run(reload)} /></View>
      {!recent.length && <Text style={{ color: colors.muted, paddingVertical: 10 }}>Suas vendas aparecerão aqui.</Text>}
      {recent.map(o => <Pressable key={o.id} accessibilityRole="button" disabled={busy} onPress={() => void run(async () => { setReceipt(await counterApi.receipt(token!, o.chaveBalcao)); setHistory(false); })}
        style={({pressed}) => ({ opacity: pressed ? 0.65 : 1, paddingVertical: 12, borderTopWidth: 1, borderColor: colors.border, gap: 7 })}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{o.partida.timeMandante} × {o.partida.timeVisitante}</Text><ChevronRight size={16} color={colors.muted} /></View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{matchDate(o.criadoEm)} · #{o.id.slice(-6)}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><AdminBadge label={statusLabels[o.statusPagamento] || o.statusPagamento} tone={o.statusPagamento === 'PAGO' ? 'success' : o.statusPagamento === 'PENDENTE' ? 'warning' : 'neutral'} /><Text style={{ color: colors.text, fontWeight: '600' }}>{money(o.valorTotalCentavos)}</Text></View>
      </Pressable>)}
    </Panel></View>}
    </View>
  </View></Page>;
}
