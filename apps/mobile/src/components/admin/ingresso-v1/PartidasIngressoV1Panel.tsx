import type { Match } from '@nacional/shared/types';
import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Pencil, Ticket, Trash2 } from 'lucide-react-native';
import { Button } from '../../ui';
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
import { AdminBadge, AdminTable } from '../AdminLayout';
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

type Props = {
  appMatches: Match[];
  onEditApp: (match: Match) => void;
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

export function PartidasIngressoV1Panel({
  token,
  busy,
  onBusy,
  onNotice,
  onError,
  createOpen = false,
  onConsumeCreate,
  onOpenIngressos, appMatches, onEditApp, refreshKey, onSaved,
}: Props) {
  const { colors } = useTheme();
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

  async function load() {
    setLoading(true);
    try {
      const [listaPartidas, listaEstadios, listaTemplatesVenda] = await Promise.all([
        ingressoV1Api.partidas(token),
        ingressoV1Api.estadios(token),
        ingressoV1Api.templatesVenda(token),
      ]);
      setRows(listaPartidas);
      setEstadios(listaEstadios);
      setTemplatesVenda(listaTemplatesVenda);
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
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

  const appRows = appMatches.filter(match => !match.partidaV1Id).map(match => ({
    id: match.id, startsAt: match.startsAt,
    cells: [
      <View style={{ gap: 3 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>{match.homeTeam} × {match.awayTeam}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{match.stadium} · {matchDate(match.startsAt)}</Text>
        <AdminBadge label="Cadastro anterior · App" />
      </View>,
      <Text style={{ color: colors.text, fontSize: 12 }}>{match.sectors.map(sector => sector.name).join(', ') || 'Sem setores'}</Text>,
      <AdminBadge label={match.published ? 'Publicada' : 'Rascunho'} />,
      <AdminButton label="Editar" icon={Pencil} size="small" disabled={busy} onPress={() => onEditApp(match)} />,
    ],
  }));
  return (
    <View style={{ gap: 18 }}>
      <AdminTable
        loading={loading}
        minWidth={740}
        empty="Nenhuma partida cadastrada."
        columns={[
          { label: 'Partida / Estádio', flex: 2 },
          { label: 'Setores e Lotes', flex: 1.8 },
          { label: 'Ocupação / situação', width: 120 },
          { label: 'Ações', width: 210 },
        ]}
        rows={[...appRows, ...rows.map((row) => {
          const totalLiberada = row.alocacoesSetor.reduce((s, a) => s + a.capacidadeLiberada, 0);
          const ocupados = row.alocacoesSetor.reduce((s, a) => s + a.quantidadeVendida + a.quantidadeReservada + (a.ocupadosApp || 0), 0);

          return {
            id: row.id, startsAt: row.dataPartida,
            cells: [
              <Pressable
                accessibilityRole="button"
                onPress={() => openEdit(row)}
                disabled={busy}
                style={{ gap: 2 }}
              >
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                  {row.timeMandante} × {row.timeVisitante}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>
                  {row.estadio.nomePopular || row.estadio.nome} ·{' '}
                  {matchDate(row.dataPartida)}
                </Text>
                <AdminBadge label={row.appMatch ? 'App e bilheteria' : 'Bilheteria'} />
              </Pressable>,
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                {row.alocacoesSetor.map((a) => {
                  const lotePrincipal = a.lotes.find(lote => lote.ativo && lote.tipoCategoria === 'INTEIRA') || a.lotes.find(lote => lote.ativo);
                  return (
                    <AdminBadge
                      key={a.id}
                      label={`${a.setor.nome}${lotePrincipal ? ` (${money(lotePrincipal.precoCentavos)})` : ''}`}
                      tone={a.setor.numerado ? 'warning' : 'neutral'}
                    />
                  );
                })}
              </View>,
              <View style={{ gap: 2 }}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
                  {ocupados} / {totalLiberada.toLocaleString('pt-BR')}
                </Text>
                <AdminBadge
                  label={STATUS_OPTIONS.find(option => option.value === row.status)?.label ?? row.status}
                  tone={row.status === 'PUBLICADA' ? 'success' : 'neutral'}
                />
              </View>,
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {onOpenIngressos && (
                  <AdminButton
                    label="Emitir ingressos"
                    icon={Ticket}
                    iconOnly
                    size="small"
                    disabled={busy}
                    onPress={() => onOpenIngressos(row.id)}
                  />
                )}
                <AdminButton
                  label="Editar"
                  icon={Pencil}
                  size="small"
                  disabled={busy}
                  onPress={() => openEdit(row)}
                />
                <AdminButton
                  label="Excluir"
                  icon={Trash2}
                  iconOnly
                  variant="danger"
                  size="small"
                  disabled={busy}
                  onPress={() => setConfirmDelete(row)}
                />
              </View>,
            ],
          };
        })].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))}
      />

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

