import type { Match } from '@nacional/shared/types';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Pressable } from 'react-native';
import { CalendarDays, Eye, MapPin, Pencil, ScanLine, Ticket, Trash2 } from 'lucide-react-native';
import { Button, Panel } from '../../ui';
import { Text } from '../../Typography';
import { Sheet } from '../../Sheet';
import {
  AdminButton,
  AdminDateTimeField,
  AdminField,
  AdminFormGrid,
  AdminNotice,
  AdminSection,
  AdminSelect,
  AdminToggle,
} from '../AdminControls';
import { AdminBadge } from '../AdminLayout';
import { useTheme } from '../../../theme/ThemeProvider';
import {
  ingressoV1Api,
  type EstadioIngressoV1,
  type LoteIngressoPartidaV1,
  type PartidaIngressoV1,
  type StatusPartidaIngressoV1,
  type TemplateVendaIngressoV1,
} from '../../../services/ingresso-v1';
import { matchDate, messageOf, money } from '../../../utils/format';
import { parseAmount } from '../../../utils/payments';
import { formDate, parseClubDate } from '../../../utils/admin';
import { ticketGateState } from '../../../utils/ticket-state';

type Props = {
  appMatches: Match[];
  onEditApp: (match: Match) => void;
  onAppGate: (match: Match, open: boolean) => void;
  onSaved: () => void;
  refreshKey: number;
  token: string;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
  createOpen?: boolean;
  onConsumeCreate?: () => void;
  onOpenIngressos?: (partidaId: string) => void;
};

type AlocacaoDraft = {
  setorId: string;
  nomeSetor: string;
  corSetorHex: string;
  numerado: boolean;
  capacidadeMaximaSetor: number;
  capacidadeLiberada: string;
  lotes: LoteDraft[];
};

type LoteDraft = Pick<LoteIngressoPartidaV1, 'id' | 'nome' | 'tipoCategoria' | 'ativo'> & { preco: string; cota: string };

function draftLot(lot: LoteIngressoPartidaV1): LoteDraft {
  return { id: lot.id, nome: lot.nome, tipoCategoria: lot.tipoCategoria, ativo: lot.ativo,
    preco: (lot.precoCentavos / 100).toFixed(2).replace('.', ','), cota: String(lot.quantidadeMaxima) };
}

const STATUS_OPTIONS: { value: StatusPartidaIngressoV1; label: string }[] = [
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'PUBLICADA', label: 'Publicada' },
  { value: 'ESGOTADA', label: 'Esgotada' },
  { value: 'ENCERRADA', label: 'Encerrada' },
  { value: 'CANCELADA', label: 'Cancelada' },
];

function matchGate(row: PartidaIngressoV1) {
  return ticketGateState({ startsAt: row.dataPartida, entryEnabled: row.portariaAtiva, gateOpenAt: row.portariaAbreEm, gateCloseAt: row.portariaFechaEm });
}

function CalendarActions({ gate, eligible, busy, onGate, onDetails, onIssue }: {
  gate: string; eligible: boolean; busy: boolean; onGate: (open: boolean) => void; onDetails: () => void; onIssue?: () => void;
}) {
  const open = gate === 'OPEN';
  return <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
    {eligible && gate !== 'CLOSED' && <AdminButton label={open ? 'Fechar portaria' : 'Abrir portaria agora'} icon={ScanLine}
      size="small" disabled={busy} onPress={() => onGate(!open)} />}
    {onIssue && <AdminButton label="Emitir ingresso" icon={Ticket} size="small" disabled={busy} onPress={onIssue} />}
    <AdminButton label="Ver mais" icon={Eye} size="small" variant="ghost" disabled={busy} onPress={onDetails} />
  </View>;
}

export function PartidasIngressoV1Panel({
  token,
  busy,
  onBusy,
  onNotice,
  onError,
  createOpen = false,
  onConsumeCreate,
  onOpenIngressos, appMatches, onEditApp, onAppGate, refreshKey, onSaved,
}: Props) {
  const { colors } = useTheme();
  const [gridWidth, setGridWidth] = useState(0);
  const [rows, setRows] = useState<PartidaIngressoV1[]>([]);
  const [estadios, setEstadios] = useState<EstadioIngressoV1[]>([]);
  const [templatesVenda, setTemplatesVenda] = useState<TemplateVendaIngressoV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PartidaIngressoV1 | null>(null);
  const [estadioId, setEstadioId] = useState('');
  const [templateVendaId, setTemplateVendaId] = useState('');
  const [timeMandante, setTimeMandante] = useState('');
  const [timeVisitante, setTimeVisitante] = useState('');
  const [dataPartida, setDataPartida] = useState('');
  const [status, setStatus] = useState<StatusPartidaIngressoV1>('PUBLICADA');
  const [inicioVendas, setInicioVendas] = useState(''), [fimVendas, setFimVendas] = useState('');
  const [vendasAtivas, setVendasAtivas] = useState(true);
  const [portariaAtiva, setPortariaAtiva] = useState(false), [portariaAbreEm, setPortariaAbreEm] = useState(''), [portariaFechaEm, setPortariaFechaEm] = useState('');
  const [alocacoesDraft, setAlocacoesDraft] = useState<AlocacaoDraft[]>([]);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<PartidaIngressoV1 | null>(null);
  const [detailId, setDetailId] = useState('');
  const detail = rows.find(row => row.id === detailId);
  const detailGate = detail && matchGate(detail);
  const [actionError, setActionError] = useState('');
  const actionLock = useRef(false);
  const loadSequence = useRef(0);

  async function load() {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const [listaPartidas, listaEstadios, listaTemplatesVenda] = await Promise.all([
        ingressoV1Api.partidas(token),
        ingressoV1Api.estadios(token),
        ingressoV1Api.templatesVenda(token),
      ]);
      if (sequence !== loadSequence.current) return;
      setRows(listaPartidas);
      setEstadios(listaEstadios);
      setTemplatesVenda(listaTemplatesVenda);
    } catch (error) {
      if (sequence === loadSequence.current) onError(messageOf(error));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => { loadSequence.current++; };
  }, [token, refreshKey]);

  useEffect(() => {
    if (createOpen) {
      openCreate();
      onConsumeCreate?.();
    }
  }, [createOpen]);

  function buildAlocacoesFromStadium(
    targetEstadioId: string,
    targetTemplateVendaId?: string,
    existingPartida?: PartidaIngressoV1 | null
  ): AlocacaoDraft[] {
    const est = estadios.find((e) => e.id === targetEstadioId);
    const tpl = targetTemplateVendaId
      ? templatesVenda.find((t) => t.id === targetTemplateVendaId)
      : null;

    if (existingPartida) {
      return existingPartida.alocacoesSetor.map(a => ({
        setorId: a.setorId, nomeSetor: a.setor.nome, corSetorHex: a.setor.corSetorHex || '#002244',
        numerado: a.setor.numerado, capacidadeMaximaSetor: a.setor.capacidadeFisica,
        capacidadeLiberada: String(a.capacidadeLiberada), lotes: a.lotes.map(draftLot),
      }));
    }
    return (est?.setores || []).filter(s => s.ativo).flatMap(s => {
      const rule = tpl?.regrasSetor.find(r => r.ativo && r.setorId === s.id);
      if (tpl && !rule) return [];
      const cap = rule?.capacidadeLiberadaPadrao ?? s.capacidadeVendaPadrao ?? s.capacidadeFisica;
      const price = rule?.precoBaseCentavos ?? 6000;
      const categories = rule?.categorias.filter(c => c.ativo);
      const lots: LoteIngressoPartidaV1[] = categories?.length ? categories.map(c => ({
        nome: c.nome, tipoCategoria: c.tipoCategoria, ativo: true, quantidadeMaxima: c.limiteCota ?? cap,
        precoCentavos: Math.round(price * (100 - c.percentualDesconto) / 100),
      })) : [{ nome: 'Inteira', tipoCategoria: 'INTEIRA', ativo: true, precoCentavos: price, quantidadeMaxima: cap }];
      if (!rule) lots.push({ nome: 'Meia-Entrada', tipoCategoria: 'MEIA', ativo: true, precoCentavos: Math.round(price / 2), quantidadeMaxima: Math.max(1, Math.floor(cap * 0.4)) });
      return [{ setorId: s.id, nomeSetor: s.nome, corSetorHex: s.corSetorHex || '#002244', numerado: s.numerado,
        capacidadeMaximaSetor: s.capacidadeFisica, capacidadeLiberada: String(cap), lotes: lots.map(draftLot) }];
    });
  }

  function openCreate() {
    setEditing(null);
    setEstadioId('');
    setTemplateVendaId('');
    setTimeMandante('');
    setTimeVisitante('');
    setDataPartida(''); setInicioVendas(''); setFimVendas('');
    setStatus('PUBLICADA');
    setVendasAtivas(true);
    setPortariaAtiva(false); setPortariaAbreEm(''); setPortariaFechaEm('');
    setAlocacoesDraft([]);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(row: PartidaIngressoV1) {
    setDetailId('');
    setEditing(row);
    setEstadioId(row.estadioId);
    setTemplateVendaId(row.templateVendaId || '');
    setTimeMandante(row.timeMandante);
    setTimeVisitante(row.timeVisitante);
    setDataPartida(formDate(row.dataPartida));
    setInicioVendas(row.inicioVendas ? formDate(row.inicioVendas) : ''); setFimVendas(row.fimVendas ? formDate(row.fimVendas) : '');
    setStatus(row.status);
    setVendasAtivas(row.vendasAtivas);
    setPortariaAtiva(row.portariaAtiva); setPortariaAbreEm(row.portariaAbreEm ? formDate(row.portariaAbreEm) : ''); setPortariaFechaEm(row.portariaFechaEm ? formDate(row.portariaFechaEm) : '');
    setAlocacoesDraft(buildAlocacoesFromStadium(row.estadioId, row.templateVendaId || '', row));
    setFormError('');
    setModalOpen(true);
  }

  function showDetails(row: PartidaIngressoV1) {
    setActionError('');
    setDetailId(row.id);
  }

  async function quickUpdate(row: PartidaIngressoV1, patch: { abrirPortariaAgora: true } | { portariaAtiva: false } | { vendasAtivas: boolean }, notice: string) {
    if (busy || actionLock.current) return;
    actionLock.current = true;
    onBusy(true);
    setActionError(''); onError('');
    try {
      const saved = await ingressoV1Api.atualizarPartida(token, { id: row.id, ...patch });
      loadSequence.current++;
      setLoading(false);
      setRows(current => current.map(item => item.id === row.id ? {
        ...item, status: saved.status, vendasAtivas: saved.vendasAtivas, portariaAtiva: saved.portariaAtiva,
        portariaAbreEm: saved.portariaAbreEm, portariaFechaEm: saved.portariaFechaEm, atualizadoEm: saved.atualizadoEm,
      } : item));
      onNotice(notice);
      onSaved();
    } catch (error) {
      if (detailId) setActionError(messageOf(error));
      else onError(messageOf(error));
    } finally {
      actionLock.current = false;
      onBusy(false);
    }
  }

  function handleChangeEstadio(nextEstadioId: string) {
    setEstadioId(nextEstadioId);
    setTemplateVendaId('');
    setAlocacoesDraft(buildAlocacoesFromStadium(nextEstadioId, '', null));
  }

  function handleChangeTemplateVenda(nextTplId: string) {
    setTemplateVendaId(nextTplId);
    setAlocacoesDraft(buildAlocacoesFromStadium(estadioId, nextTplId, null));
  }

  function updateAlocacao(setorId: string, patch: Partial<AlocacaoDraft>) {
    setAlocacoesDraft((curr) =>
      curr.map((a) => (a.setorId === setorId ? { ...a, ...patch } : a))
    );
  }

  function updateLot(allocation: AlocacaoDraft, index: number, patch: Partial<LoteDraft>) {
    updateAlocacao(allocation.setorId, { lotes: allocation.lotes.map((lot, i) => i === index ? { ...lot, ...patch } : lot) });
  }

  async function save() {
    if (!estadioId) {
      setFormError('Selecione o estádio da partida.');
      return;
    }
    if (!timeMandante.trim() || !timeVisitante.trim()) {
      setFormError('Informe o time mandante e o time visitante.');
      return;
    }

    let isoDate: string, open: string | null, close: string | null;
    try {
      isoDate = parseClubDate(dataPartida);
      open = portariaAbreEm.trim() ? parseClubDate(portariaAbreEm) : null; close = portariaFechaEm.trim() ? parseClubDate(portariaFechaEm) : null;
      if (new Date(close || new Date(new Date(isoDate).getTime() + 4 * 3600000)) <= new Date(open || new Date(new Date(isoDate).getTime() - 2 * 3600000))) throw new Error('O fechamento da portaria deve ser posterior à abertura.');
    } catch (err) {
      setFormError(messageOf(err));
      return;
    }

    onBusy(true);
    setFormError('');
    try {
      if (!alocacoesDraft.length) throw new Error('Selecione pelo menos um setor ativo.');
      const salesWindow = { inicioVendas: inicioVendas ? parseClubDate(inicioVendas) : null, fimVendas: fimVendas ? parseClubDate(fimVendas) : null };
      const alocacoesSetor = alocacoesDraft.map(a => {
        const cap = Number(a.capacidadeLiberada);
        if (!Number.isInteger(cap) || cap < 1 || cap > a.capacidadeMaximaSetor) throw new Error(`Confira a capacidade de ${a.nomeSetor}.`);
        return { setorId: a.setorId, capacidadeLiberada: cap, lotes: a.lotes.map(l => {
          const cota = Number(l.cota);
          if (!Number.isInteger(cota) || cota < 1) throw new Error(`Confira a cota de ${l.nome}.`);
          return { id: l.id, nome: l.nome, tipoCategoria: l.tipoCategoria, ativo: l.ativo, precoCentavos: parseAmount(l.preco, true), quantidadeMaxima: cota };
        }) };
      });
      if (editing) {
        await ingressoV1Api.atualizarPartida(token, {
          id: editing.id,
          timeMandante: timeMandante.trim(),
          timeVisitante: timeVisitante.trim(),
          ...(dataPartida !== formDate(editing.dataPartida) ? { dataPartida: isoDate } : {}),
          status,
          vendasAtivas, ...salesWindow,
          portariaAtiva, portariaAbreEm: open, portariaFechaEm: close,
          ...(JSON.stringify(alocacoesDraft) !== JSON.stringify(buildAlocacoesFromStadium(editing.estadioId, editing.templateVendaId || '', editing)) ? { alocacoesSetor } : {}),
        });
      } else {
        await ingressoV1Api.criarPartida(token, {
          estadioId,
          templateVendaId: templateVendaId || null,
          timeMandante: timeMandante.trim(),
          timeVisitante: timeVisitante.trim(),
          dataPartida: isoDate,
          status,
          vendasAtivas, ...salesWindow,
          portariaAtiva, portariaAbreEm: open, portariaFechaEm: close,
          ...(templateVendaId && JSON.stringify(alocacoesDraft) === JSON.stringify(buildAlocacoesFromStadium(estadioId, templateVendaId)) ? {} : { alocacoesSetor }),
        });
      }
      setModalOpen(false);
      await load();
      onSaved();
      onNotice(editing ? 'Partida atualizada.' : 'Partida criada e setores alocados.');
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  async function remove(row: PartidaIngressoV1) {
    onBusy(true);
    try {
      await ingressoV1Api.excluirPartida(token, row.id);
      setConfirmDelete(null);
      await load();
      onSaved();
      onNotice('Partida excluída.');
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  const templatesDoEstadio = templatesVenda.filter(t => t.estadioId === estadioId && (t.ativo || t.id === editing?.templateVendaId));

  const cards = [
    ...appMatches.filter(match => !match.partidaV1Id).map(match => ({
      id: match.id, startsAt: match.startsAt, title: `${match.homeTeam} × ${match.awayTeam}`, stadium: match.stadium,
      channel: 'Cadastro anterior · App', status: match.published ? 'PUBLICADA' : 'RASCUNHO',
      sectors: match.sectors.map(s => ({ id: s.id, name: s.name, price: s.priceCents, numbered: false })),
      occupancy: null, gate: ticketGateState(match).state, eligible: Boolean(match.published),
      onGate: (open: boolean) => onAppGate(match, open), onDetails: () => onEditApp(match), onIssue: undefined,
    })),
    ...rows.map(row => ({
      id: row.id, startsAt: row.dataPartida, title: `${row.timeMandante} × ${row.timeVisitante}`,
      stadium: row.estadio.nomePopular || row.estadio.nome, channel: row.appMatch ? 'App e bilheteria' : 'Bilheteria', status: row.status,
      sectors: row.alocacoesSetor.map(a => {
        const lot = a.lotes.find(l => l.ativo && l.tipoCategoria === 'INTEIRA') || a.lotes.find(l => l.ativo);
        return { id: a.id, name: a.setor.nome, price: lot?.precoCentavos, numbered: a.setor.numerado };
      }),
      occupancy: row.alocacoesSetor.reduce((sum, a) => ({
        used: sum.used + a.quantidadeVendida + a.quantidadeReservada + (a.ocupadosApp || 0),
        capacity: sum.capacity + a.capacidadeLiberada,
      }), { used: 0, capacity: 0 }),
      gate: matchGate(row).state, eligible: row.estadio.ativo !== false && ['PUBLICADA', 'ESGOTADA'].includes(row.status),
      onGate: (open: boolean) => void quickUpdate(row, open ? { abrirPortariaAgora: true } : { portariaAtiva: false },
        open ? 'Portaria aberta para leitura dos ingressos.' : 'Portaria fechada.'),
      onDetails: () => showDetails(row), onIssue: onOpenIngressos ? () => onOpenIngressos(row.id) : undefined,
    })),
  ].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const gap = 16;
  const columns = Math.max(1, Math.min(3, Math.floor((gridWidth + gap) / (360 + gap))));
  const cardWidth = gridWidth ? Math.floor((gridWidth - gap * (columns - 1)) / columns) : '100%';
  return (
    <View style={{ gap: 18 }}>
      <View onLayout={({ nativeEvent }) => setGridWidth(Math.floor(nativeEvent.layout.width))} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
        {cards.map(card => <Panel key={card.id} style={{ width: cardWidth, maxWidth: '100%', minWidth: 0, padding: 16, borderRadius: 12, gap: 14 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CalendarDays size={15} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{matchDate(card.startsAt)}</Text>
            </View>
            <AdminBadge label={STATUS_OPTIONS.find(o => o.value === card.status)?.label ?? card.status}
              tone={card.status === 'PUBLICADA' ? 'success' : card.status === 'ESGOTADA' ? 'warning' : card.status === 'CANCELADA' ? 'danger' : 'neutral'} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ver detalhes de ${card.title}`} disabled={busy} onPress={card.onDetails} style={{ gap: 5 }}>
            <Text heading style={{ color: colors.text, fontSize: 18, lineHeight: 25, fontWeight: '600' }}>{card.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MapPin size={14} color={colors.muted} />
              <Text style={{ flexShrink: 1, color: colors.muted, fontSize: 12 }}>{card.stadium}</Text>
            </View>
          </Pressable>
          <View style={{ gap: 8, flexGrow: 1 }}>
            {card.sectors.map(s => <View key={s.id} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Text style={{ flex: 1, color: colors.muted, fontSize: 12 }}>{s.name}{s.numbered ? ' · Numerado' : ''}</Text>
              {s.price !== undefined && <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>{money(s.price)}</Text>}
            </View>)}
            {!card.sectors.length && <Text style={{ color: colors.subtle, fontSize: 12 }}>Sem setores cadastrados</Text>}
          </View>
          <View style={{ gap: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
              <Text style={{ color: colors.subtle, fontSize: 11 }}>{card.channel}</Text>
              {card.occupancy && <Text style={{ color: colors.muted, fontSize: 11 }}>Ocupação · {card.occupancy.used.toLocaleString('pt-BR')} / {card.occupancy.capacity.toLocaleString('pt-BR')}</Text>}
            </View>
            {card.occupancy && <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, 100 * card.occupancy.used / Math.max(1, card.occupancy.capacity))}%`, height: '100%', backgroundColor: colors.primary }} />
            </View>}
          </View>
          <View style={{ paddingTop: 12, borderTopWidth: 1, borderColor: colors.border }}>
            <CalendarActions busy={busy} gate={card.gate} eligible={card.eligible} onGate={card.onGate} onDetails={card.onDetails} onIssue={card.onIssue} />
          </View>
        </Panel>)}
        {!cards.length && <Panel style={{ width: '100%', padding: 24, alignItems: 'center', gap: 10 }}>
          {loading && <ActivityIndicator color={colors.primary} />}
          <Text style={{ color: colors.muted }}>{loading ? 'Carregando partidas…' : 'Nenhuma partida cadastrada.'}</Text>
        </Panel>}
      </View>

      {detail && detailGate && <Sheet visible title="Detalhes da partida" onClose={() => setDetailId('')}>
        <AdminSection title={`${detail.timeMandante} × ${detail.timeVisitante}`} description={`${detail.estadio.nomePopular || detail.estadio.nome} · ${matchDate(detail.dataPartida)}`}>
          <Text style={{ color: colors.text }}>{STATUS_OPTIONS.find(option => option.value === detail.status)?.label} · {detail.vendasAtivas ? 'Vendas habilitadas' : 'Vendas pausadas'}</Text>
          {detail.templateVenda && <Text style={{ color: colors.muted }}>Modelo de venda · {detail.templateVenda.nome}</Text>}
          <Text style={{ color: colors.muted }}>{detail.portariaAtiva
            ? `Portaria habilitada · ${matchDate(new Date(detailGate.opensAt).toISOString())} até ${matchDate(new Date(detailGate.closesAt).toISOString())}`
            : 'Portaria desabilitada'}</Text>
        </AdminSection>
        <AdminSection title="Setores e lotes">
          {detail.alocacoesSetor.map(a => <View key={a.id} style={{ gap: 4 }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{a.setor.nome} · {a.capacidadeLiberada} lugares</Text>
            {a.lotes.map(l => <Text key={l.id} style={{ color: colors.muted }}>{l.nome} · {money(l.precoCentavos)}{l.ativo ? '' : ' · Inativo'}</Text>)}
          </View>)}
        </AdminSection>
        {!!actionError && <AdminNotice tone="error">{actionError}</AdminNotice>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <AdminButton primary label="Editar partida" icon={Pencil} disabled={busy} onPress={() => openEdit(detail)} />
          {detail.status === 'PUBLICADA' && <AdminButton label={detail.vendasAtivas ? 'Pausar vendas' : 'Habilitar vendas'} disabled={busy}
            onPress={() => void quickUpdate(detail, { vendasAtivas: !detail.vendasAtivas }, detail.vendasAtivas ? 'Vendas pausadas.' : 'Vendas habilitadas para o período configurado.')} />}
          <AdminButton label="Excluir partida" icon={Trash2} variant="ghost" disabled={busy} onPress={() => { setDetailId(''); setConfirmDelete(detail); }} />
        </View>
      </Sheet>}

      {modalOpen && (
        <Sheet
          visible
          title={editing ? 'Editar partida' : 'Cadastrar partida'}
          onClose={busy ? () => {} : () => setModalOpen(false)}
        >
          <AdminSection title="Dados do jogo e estádio">
            <AdminFormGrid>
              <AdminSelect
                label="Estádio"
                value={estadioId}
                placeholder="Selecione o estádio..."
                disabled={busy || Boolean(editing)}
                options={estadios.map((e) => ({
                  value: e.id,
                  label: e.nomePopular ? `${e.nomePopular} (${e.nome})` : e.nome,
                }))}
                onChange={handleChangeEstadio}
              />
              {!editing && (
                <AdminSelect
                  label="Template de venda (opcional)"
                  value={templateVendaId}
                  disabled={busy}
                  options={[
                    { value: '', label: 'Configuração direta na partida' },
                    ...templatesDoEstadio.map((t) => ({ value: t.id, label: t.nome })),
                  ]}
                  onChange={handleChangeTemplateVenda}
                />
              )}
              <AdminField
                label="Time Mandante"
                value={timeMandante}
                onChange={setTimeMandante}
                placeholder="Ex.: Cruzeiro / Nacional de Patos"
                required
                editable={!busy}
              />
              <AdminField
                label="Time Visitante"
                value={timeVisitante}
                onChange={setTimeVisitante}
                placeholder="Ex.: Atlético-MG / Treze"
                required
                editable={!busy}
              />
              <AdminDateTimeField
                label="Data e hora da partida"
                value={dataPartida}
                onChange={setDataPartida}
                disabled={busy}
              />
              <AdminSelect
                label="Status da partida"
                value={status}
                disabled={busy}
                options={STATUS_OPTIONS}
                onChange={(v) => setStatus(v as StatusPartidaIngressoV1)}
              />
            </AdminFormGrid>

            <AdminToggle
              label="Habilitar vendas quando publicada"
              value={vendasAtivas}
              onChange={setVendasAtivas}
              disabled={busy}
            />
          </AdminSection>

          <AdminSection title="Período das vendas"><AdminFormGrid>
            <AdminDateTimeField optional label="Abertura" value={inicioVendas} onChange={setInicioVendas} disabled={busy} />
            <AdminDateTimeField optional label="Encerramento" value={fimVendas} onChange={setFimVendas} disabled={busy} />
          </AdminFormGrid></AdminSection>
          <AdminSection title="Horário da portaria" description="Sem horários personalizados, permite entrada de 2 horas antes até 4 horas depois do início do jogo. A partida deve estar publicada ou esgotada.">
            <AdminToggle label="Habilitar portaria desta partida" value={portariaAtiva} onChange={setPortariaAtiva} disabled={busy} />
            <AdminFormGrid>
              <AdminDateTimeField optional label="Abertura personalizada (opcional)" value={portariaAbreEm} onChange={setPortariaAbreEm} disabled={busy} />
              <AdminDateTimeField optional label="Fechamento personalizado (opcional)" value={portariaFechaEm} onChange={setPortariaFechaEm} disabled={busy} />
            </AdminFormGrid>
          </AdminSection>
          <AdminSection title="Setores do estádio e preços dos lotes na partida">
            {!estadioId ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Selecione o estádio acima para carregar os setores da partida.
              </Text>
            ) : alocacoesDraft.length === 0 ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Nenhum setor encontrado neste estádio.
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {alocacoesDraft.map((a) => (
                  <View
                    key={a.setorId}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.soft,
                      gap: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          backgroundColor: a.corSetorHex,
                        }}
                      />
                      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                        {a.nomeSetor}
                      </Text>
                      <AdminBadge
                        label={a.numerado ? 'Assento Marcado' : 'Ordem de Chegada'}
                        tone={a.numerado ? 'warning' : 'neutral'}
                      />
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'flex-end',
                        gap: 10,
                      }}
                    >
                      <View style={{ width: 145 }}>
                        <AdminField
                          label={`Cap. liberada (máx. ${a.capacidadeMaximaSetor})`}
                          value={a.capacidadeLiberada}
                          onChange={(v) =>
                            updateAlocacao(a.setorId, { capacidadeLiberada: v })
                          }
                          keyboardType="number-pad"
                          editable={!busy}
                        />
                      </View>
                    </View>
                    {a.lotes.map((lot, index) => <View key={lot.id || index} style={{ gap: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 10 }}>
                      <AdminToggle checkbox label={lot.nome} value={lot.ativo} disabled={busy} onChange={ativo => updateLot(a, index, { ativo })} />
                      <AdminFormGrid>
                        <AdminField label="Preço (R$)" value={lot.preco} keyboardType="decimal-pad" editable={!busy} onChange={preco => updateLot(a, index, { preco })} />
                        <AdminField label="Cota do lote" value={lot.cota} keyboardType="number-pad" editable={!busy} onChange={cota => updateLot(a, index, { cota })} />
                      </AdminFormGrid>
                    </View>)}
                  </View>
                ))}
              </View>
            )}
          </AdminSection>

          {!!formError && <AdminNotice tone="error">{formError}</AdminNotice>}
          <Button label="Salvar partida" loading={busy} onPress={() => void save()} />
        </Sheet>
      )}

      {confirmDelete && (
        <Sheet
          visible
          title="Excluir partida"
          onClose={busy ? () => {} : () => setConfirmDelete(null)}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>
            Confirma a exclusão da partida "{confirmDelete.timeMandante} × {confirmDelete.timeVisitante}"?
          </Text>
          <Button
            label="Confirmar exclusão"
            loading={busy}
            onPress={() => void remove(confirmDelete)}
          />
        </Sheet>
      )}
    </View>
  );
}

