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
  type PartidaIngressoV1,
  type StatusPartidaIngressoV1,
  type TemplateVendaIngressoV1,
} from '../../../services/ingresso-v1';
import { messageOf, money } from '../../../utils/format';
import { formDate, parseClubDate } from '../../../utils/admin';

type Props = {
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
  loteInteiraId?: string;
  precoInteiraReais: string;
  loteMeiaId?: string;
  precoMeiaReais: string;
  incluirMeia: boolean;
};

const STATUS_OPTIONS: { value: StatusPartidaIngressoV1; label: string }[] = [
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'PUBLICADA', label: 'Publicada (Venda aberta)' },
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
  onOpenIngressos,
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
  const [vendasAtivas, setVendasAtivas] = useState(true);
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
  }, [token]);

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
      return existingPartida.alocacoesSetor.map((a) => {
        const loteInteira = a.lotes.find((l) => l.tipoCategoria === 'INTEIRA') || a.lotes[0];
        const loteMeia = a.lotes.find((l) => l.tipoCategoria === 'MEIA');
        const precoInt = loteInteira ? loteInteira.precoCentavos : 6000;
        const precoMeia = loteMeia ? loteMeia.precoCentavos : Math.round(precoInt / 2);
        return {
          setorId: a.setorId,
          nomeSetor: a.setor.nome,
          corSetorHex: a.setor.corSetorHex || '#002244',
          numerado: a.setor.numerado,
          capacidadeMaximaSetor: a.setor.capacidadeVendaPadrao || a.setor.capacidadeFisica,
          capacidadeLiberada: String(a.capacidadeLiberada),
          loteInteiraId: loteInteira?.id,
          precoInteiraReais: (precoInt / 100).toFixed(2).replace('.', ','),
          loteMeiaId: loteMeia?.id,
          precoMeiaReais: (precoMeia / 100).toFixed(2).replace('.', ','),
          incluirMeia: Boolean(loteMeia ? loteMeia.ativo : true),
        };
      });
    }

    return (est?.setores || []).map((s) => {
      const regraTpl = tpl?.regrasSetor.find((r) => r.setorId === s.id);
      const capMax = s.capacidadeVendaPadrao || s.capacidadeFisica;
      const capLib = regraTpl ? regraTpl.capacidadeLiberadaPadrao : capMax;
      const precoInt = regraTpl ? regraTpl.precoBaseCentavos : 6000;
      const catMeia = regraTpl?.categorias.find((c) => c.tipoCategoria === 'MEIA');
      const precoMeia = catMeia
        ? Math.round((precoInt * (100 - catMeia.percentualDesconto)) / 100)
        : Math.round(precoInt / 2);

      return {
        setorId: s.id,
        nomeSetor: s.nome,
        corSetorHex: s.corSetorHex || '#002244',
        numerado: s.numerado,
        capacidadeMaximaSetor: capMax,
        capacidadeLiberada: String(capLib),
        precoInteiraReais: (precoInt / 100).toFixed(2).replace('.', ','),
        precoMeiaReais: (precoMeia / 100).toFixed(2).replace('.', ','),
        incluirMeia: catMeia ? catMeia.ativo : true,
      };
    });
  }

  function openCreate() {
    setEditing(null);
    setEstadioId('');
    setTemplateVendaId('');
    setTimeMandante('');
    setTimeVisitante('');
    setDataPartida('');
    setStatus('PUBLICADA');
    setVendasAtivas(true);
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
    setStatus(row.status);
    setVendasAtivas(row.vendasAtivas);
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

  function parseReaisToCentavos(val: string): number {
    const normalized = val.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) : 0;
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

    let isoDate: string;
    try {
      isoDate = parseClubDate(dataPartida);
    } catch (err) {
      setFormError(messageOf(err));
      return;
    }

    const alocacoesSetor = alocacoesDraft.map((a) => {
      const cap = Math.max(1, Number(a.capacidadeLiberada.replace(/\D/g, '') || a.capacidadeMaximaSetor));
      const precoInteira = parseReaisToCentavos(a.precoInteiraReais);
      const precoMeia = parseReaisToCentavos(a.precoMeiaReais);
      return {
        setorId: a.setorId,
        capacidadeLiberada: cap,
        lotes: [
          {
            ...(a.loteInteiraId ? { id: a.loteInteiraId } : {}),
            nome: 'Inteira',
            tipoCategoria: 'INTEIRA' as const,
            precoCentavos: precoInteira,
            quantidadeMaxima: cap,
            ativo: true,
          },
          ...(a.incluirMeia
            ? [
                {
                  ...(a.loteMeiaId ? { id: a.loteMeiaId } : {}),
                  nome: 'Meia-Entrada',
                  tipoCategoria: 'MEIA' as const,
                  precoCentavos: precoMeia,
                  quantidadeMaxima: Math.max(1, Math.floor(cap * 0.4)),
                  ativo: true,
                },
              ]
            : []),
        ],
      };
    });

    onBusy(true);
    setFormError('');
    try {
      if (editing) {
        await ingressoV1Api.atualizarPartida(token, {
          id: editing.id,
          timeMandante: timeMandante.trim(),
          timeVisitante: timeVisitante.trim(),
          dataPartida: isoDate,
          status,
          vendasAtivas,
          alocacoesSetor,
        });
      } else {
        await ingressoV1Api.criarPartida(token, {
          estadioId,
          templateVendaId: templateVendaId || null,
          timeMandante: timeMandante.trim(),
          timeVisitante: timeVisitante.trim(),
          dataPartida: isoDate,
          status,
          vendasAtivas,
          alocacoesSetor,
        });
      }
      setModalOpen(false);
      await load();
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
      onNotice('Partida excluída.');
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  const templatesDoEstadio = templatesVenda.filter((t) => t.estadioId === estadioId);

  return (
    <View style={{ gap: 18 }}>
      <AdminTable
        loading={loading}
        minWidth={0}
        empty="Nenhuma partida V1 cadastrada."
        columns={[
          { label: 'Partida / Estádio', flex: 2 },
          { label: 'Setores e Lotes', flex: 1.8 },
          { label: 'Vendidos / Cap.', width: 120 },
          { label: 'Ações', width: 118 },
        ]}
        rows={rows.map((row) => {
          const totalLiberada = row.alocacoesSetor.reduce((s, a) => s + a.capacidadeLiberada, 0);
          const totalVendida = row.alocacoesSetor.reduce((s, a) => s + a.quantidadeVendida, 0);

          return {
            id: row.id,
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
                  {new Date(row.dataPartida).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </Pressable>,
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                {row.alocacoesSetor.map((a) => {
                  const lotePrincipal = a.lotes[0];
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
                  {totalVendida} / {totalLiberada.toLocaleString('pt-BR')}
                </Text>
                <AdminBadge
                  label={row.status}
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
                  iconOnly
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
        })}
      />

      {modalOpen && (
        <Sheet
          visible
          title={editing ? 'Editar partida V1' : 'Cadastrar partida V1'}
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
              label="Vendas ativas"
              value={vendasAtivas}
              onChange={setVendasAtivas}
              disabled={busy}
            />
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
                      <View style={{ width: 130 }}>
                        <AdminField
                          label="Inteira (R$)"
                          value={a.precoInteiraReais}
                          onChange={(v) =>
                            updateAlocacao(a.setorId, { precoInteiraReais: v })
                          }
                          placeholder="60,00"
                          editable={!busy}
                        />
                      </View>
                      <View style={{ width: 130 }}>
                        <AdminField
                          label="Meia (R$)"
                          value={a.precoMeiaReais}
                          onChange={(v) =>
                            updateAlocacao(a.setorId, { precoMeiaReais: v })
                          }
                          placeholder="30,00"
                          editable={!busy && a.incluirMeia}
                        />
                      </View>
                      <AdminToggle
                        checkbox
                        label="Habilitar Meia"
                        value={a.incluirMeia}
                        onChange={(v) => updateAlocacao(a.setorId, { incluirMeia: v })}
                        disabled={busy}
                      />
                    </View>
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
          title="Excluir partida V1"
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

