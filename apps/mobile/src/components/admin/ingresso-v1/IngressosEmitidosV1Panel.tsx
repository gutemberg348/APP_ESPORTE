import type { Match } from '@nacional/shared/types';
import { adminApi, type AdminTicketRow } from '../../../services/admin';
import { AppTicketActions, type SaleCallbacks } from '../AdminSalesReport';
import QRCode from 'react-native-qrcode-svg';
import { TicketBarcode } from '../../TicketBarcode';
import React, { useEffect, useState, useRef } from 'react';
import { View, Pressable, Image } from 'react-native';
import { Ban, QrCode } from 'lucide-react-native';
import { Button } from '../../ui';
import { Text } from '../../Typography';
import { Sheet } from '../../Sheet';
import {
  AdminButton,
  AdminField,
  AdminFormGrid,
  AdminNotice,
  AdminSection,
  AdminSelect,
} from '../AdminControls';
import { AdminBadge, AdminTable } from '../AdminLayout';
import { useTheme } from '../../../theme/ThemeProvider';
import {
  ingressoV1Api,
  type IngressoEmitidoV1,
  type MapaBlocoRespostaV1,
  type PartidaIngressoV1,
} from '../../../services/ingresso-v1';
import { messageOf, money } from '../../../utils/format';

type Props = {
  appMatches: Match[];
  appActions: SaleCallbacks;
  token: string;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
  createOpen?: boolean;
  onConsumeCreate?: () => void;
  initialPartidaId?: string;
  refreshKey: number;
};

export function IngressosEmitidosV1Panel({
  token,
  busy,
  onBusy,
  onNotice,
  onError,
  createOpen = false,
  onConsumeCreate,
  initialPartidaId, refreshKey, appMatches, appActions,
}: Props) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<AdminTicketRow[]>([]);
  const [partidas, setPartidas] = useState<PartidaIngressoV1[]>([]);
  const [filtroPartidaId, setFiltroPartidaId] = useState(initialPartidaId ? 'counter:' + initialPartidaId : '');
  const [search, setSearch] = useState('');
  const [pages, setPages] = useState<string[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const cursor = pages.at(-1) || '';
  const revision = useRef(0);
  const mapRequest = useRef(0);
  const issuing = useRef(false);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bilheteVisivel, setBilheteVisivel] = useState<IngressoEmitidoV1 | null>(null);

  // Estado do formulário de emissão
  const [partidaId, setPartidaId] = useState('');
  const [alocacaoId, setAlocacaoId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [nomeTitular, setNomeTitular] = useState('');
  const [cpfTitular, setCpfTitular] = useState('');
  const [mapaBloco, setMapaBloco] = useState<MapaBlocoRespostaV1 | null>(null);
  const [carregandoMapa, setCarregandoMapa] = useState(false);
  const [blocoEscolhido, setBlocoEscolhido] = useState<number | null>(null);
  const [fileiraEscolhida, setFileiraEscolhida] = useState<string>('');
  const [assentoEscolhido, setAssentoEscolhido] = useState<number | null>(null);
  const [formError, setFormError] = useState('');

  async function load(targetPartidaId = filtroPartidaId) {
    const current = ++revision.current;
    setLoading(true);
    try {
      const [channel, matchId] = targetPartidaId.split(':');
      const result = await adminApi.ticketDirectory(token, { channel: channel || '', matchId: matchId || '', search: search.trim(), cursor });
      if (current !== revision.current) return;
      setRows(result.items);
      setNext(result.next);

    } catch (error) {
      if (current === revision.current) { setRows([]); setNext(null); onError(messageOf(error)); }
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true); setNext(null); setRows([]);
    const timer = setTimeout(() => void load(filtroPartidaId), search.trim() ? 250 : 0);
    return () => { clearTimeout(timer); revision.current++; };
  }, [token, filtroPartidaId, refreshKey, search, cursor]);

  useEffect(() => {
    let active = true;
    ingressoV1Api.partidas(token).then(list => { if (active) setPartidas(list); })
      .catch(error => { if (active) onError(messageOf(error)); });
    return () => { active = false; };
  }, [token, refreshKey]);

  useEffect(() => {
    if (initialPartidaId) {
      setFiltroPartidaId('counter:' + initialPartidaId);
      setPages([]);
    }
  }, [initialPartidaId]);

  useEffect(() => {
    if (createOpen) {
      openEmitir();
      onConsumeCreate?.();
    }
  }, [createOpen]);

  async function carregarMapaDoSetor(targetAlocacaoId: string, targetBloco?: number) {
    const current = ++mapRequest.current;
    setCarregandoMapa(true);
    try {
      const res = await ingressoV1Api.mapaBloco(token, targetAlocacaoId, targetBloco);
      if (current !== mapRequest.current) return;
      setMapaBloco(res);
      if (targetBloco && res.blocoSelecionado) {
        setBlocoEscolhido(res.blocoSelecionado.numeroBloco);
      } else {
        setBlocoEscolhido(null);
        setFileiraEscolhida('');
      }
      setAssentoEscolhido(null);
    } catch (error) {
      if (current === mapRequest.current) setFormError(messageOf(error));
    } finally {
      if (current === mapRequest.current) setCarregandoMapa(false);
    }
  }

  function openEmitir() {
    mapRequest.current++;
    setPartidaId(filtroPartidaId.startsWith('counter:') ? filtroPartidaId.slice(8) : '');
    setAlocacaoId('');
    setLoteId('');
    setNomeTitular('');
    setCpfTitular('');
    setBlocoEscolhido(null);
    setFileiraEscolhida('');
    setAssentoEscolhido(null);
    setMapaBloco(null);
    setFormError('');
    setModalOpen(true);
  }

  function handleSelectPartida(nextPartidaId: string) {
    mapRequest.current++;
    setPartidaId(nextPartidaId);
    setAlocacaoId('');
    setLoteId('');
    setMapaBloco(null);
    setBlocoEscolhido(null);
    setFileiraEscolhida('');
    setAssentoEscolhido(null);
  }

  function handleSelectAlocacao(nextAlocacaoId: string) {
    const p = partidas.find((x) => x.id === partidaId);
    const aloc = p?.alocacoesSetor.find((a) => a.id === nextAlocacaoId);
    mapRequest.current++;
    setAlocacaoId(nextAlocacaoId);
    setLoteId(aloc?.lotes.length === 1 ? aloc.lotes[0]?.id || '' : '');
    setMapaBloco(null);
    setBlocoEscolhido(null);
    setFileiraEscolhida('');
    setAssentoEscolhido(null);
    if (aloc && aloc.setor.numerado) {
      void carregarMapaDoSetor(aloc.id);
    }
  }

  function handleSelectBloco(nextNumeroBloco: number) {
    setBlocoEscolhido(nextNumeroBloco);
    setFileiraEscolhida('');
    setAssentoEscolhido(null);
    if (alocacaoId) {
      void carregarMapaDoSetor(alocacaoId, nextNumeroBloco);
    }
  }

  const partidaSelecionada = partidas.find((x) => x.id === partidaId);
  const alocacaoSelecionada = partidaSelecionada?.alocacoesSetor.find(
    (a) => a.id === alocacaoId
  );

  async function emitir() {
    if (issuing.current) return;
    if (!partidaId || !alocacaoId) {
      setFormError('Selecione a partida e o setor.');
      return;
    }
    if (!nomeTitular.trim()) {
      setFormError('Informe o nome completo do titular do ingresso.');
      return;
    }
    if (!loteId) {
      setFormError('Escolha o lote para conferir o valor da emissão.');
      return;
    }
    if (alocacaoSelecionada?.setor.numerado) {
      if (!blocoEscolhido || !fileiraEscolhida || !assentoEscolhido) {
        setFormError('Escolha o Bloco, a Fileira e clique em um Assento livre no mapa.');
        return;
      }
    }

    issuing.current = true;
    onBusy(true);
    setFormError('');
    try {
      const emitido = await ingressoV1Api.emitirIngresso(token, {
        partidaId,
        alocacaoId,
        ...(loteId ? { loteId } : {}),
        nomeTitular: nomeTitular.trim(),
        cpfTitular: cpfTitular.trim() || null,
        blocoEscolhido: alocacaoSelecionada?.setor.numerado ? blocoEscolhido : null,
        fileiraEscolhida: alocacaoSelecionada?.setor.numerado ? fileiraEscolhida : null,
        assentoEscolhido: alocacaoSelecionada?.setor.numerado ? assentoEscolhido : null,
      });
      setModalOpen(false);
      setBilheteVisivel(emitido);
      await load();
      onNotice('Ingresso emitido com sucesso!');
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      issuing.current = false;
      onBusy(false);
    }
  }

  async function cancelar(row: IngressoEmitidoV1) {
    onBusy(true);
    try {
      await ingressoV1Api.cancelarIngresso(token, row.id);
      if (bilheteVisivel?.id === row.id) {
        setBilheteVisivel(null);
      }
      await load();
      onNotice('Ingresso cancelado e assento liberado.');
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  const ocupadosNaFileira = new Set(
    (mapaBloco?.assentosOcupados || [])
      .filter((o) => o.fileira === fileiraEscolhida)
      .map((o) => o.assento)
  );
  const qtdCadeirasFileira = mapaBloco?.blocoSelecionado?.cadeirasPorFileira || 0;


  return (
    <View style={{ gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 240 }}>
          <AdminField label="Buscar ingresso" maxLength={100} placeholder="Nome, e-mail, código ou pedido" value={search} onChange={value => { setSearch(value); setPages([]); }} />
        </View>
        <View style={{ flex: 1, minWidth: 240 }}>
          <AdminSelect
            label="Filtrar por partida"
            value={filtroPartidaId}
            disabled={busy}
            options={[
              { value: '', label: 'Todas as partidas' },
              ...appMatches.map(m => ({ value: 'app:' + m.id, label: `${m.homeTeam} × ${m.awayTeam} · App` })),
              ...partidas.map((p) => ({
                value: 'counter:' + p.id,
                label: `${p.timeMandante} × ${p.timeVisitante} (${p.estadio.nomePopular || p.estadio.nome}) · Bilheteria`,
              })),
            ]}
            onChange={value => { setFiltroPartidaId(value); setPages([]); }}
          />
        </View>
      </View>

      <AdminTable
        loading={loading}
        minWidth={680}
        empty={search.trim() ? "Nenhum ingresso encontrado para a busca." : "Nenhum ingresso emitido para esta seleção."}
        columns={[
          { label: 'Titular / Jogo', flex: 1.8 },
          { label: 'Setor e Assento', flex: 1.6 },
          { label: 'Situação', width: 135 },
          { label: 'Ações', width: 110 },
        ]}
        rows={rows.map(entry => {
          if (entry.channel === 'app') {
            const ticket = entry.ticket;
            const status = ticket.deletedAt ? 'Excluído' : { ISSUED: 'Emitido', USED: 'Utilizado', PENDING: 'Aguardando pagamento', EXPIRED: 'Expirado', CANCELED: 'Cancelado' }[ticket.status];
            return { id: 'app:' + ticket.id, cells: [
              <View style={{ gap: 4 }}><Text style={{ color: colors.text }}>{ticket.user.name}</Text>
                <Text selectable style={{ color: colors.muted, fontSize: 11 }}>{ticket.user.email}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{ticket.match.homeTeam} × {ticket.match.awayTeam}</Text><AdminBadge label="App do torcedor" /></View>,
              <View style={{ gap: 4 }}><Text style={{ color: colors.text }}>{ticket.quantity} × {ticket.sector.name}</Text>
                <Text selectable style={{ color: colors.subtle, fontSize: 10 }}>{ticket.id}</Text></View>,
              <View style={{ gap: 4 }}><AdminBadge label={status} tone={ticket.deletedAt ? 'danger' : ticket.payment ? 'success' : 'neutral'} /><Text style={{ color: colors.muted, fontSize: 12 }}>{money(ticket.priceCents)}{ticket.payment?.method === 'FREE' ? ' · Cortesia' : ticket.payment ? ' · Recebido' : ''}</Text></View>,
              <AppTicketActions ticket={ticket} busy={busy || loading} {...appActions} />,
            ] };
          }
          const row = entry.ticket;
          const hex = row.alocacao.setor.corSetorHex || '#002244';
          return {
            id: 'counter:' + row.id,
            cells: [
              <Pressable
                accessibilityRole="button"
                onPress={() => setBilheteVisivel(row)}
                disabled={busy}
                style={{ gap: 2 }}
              >
                <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                  {row.nomeTitular || 'Torcedor'}
                </Text>
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>
                  {row.partida.timeMandante} × {row.partida.timeVisitante} ·{' '}
                  {row.partida.estadio.nomePopular || row.partida.estadio.nome}
                </Text>
                <AdminBadge label="Bilheteria" />
              </Pressable>,
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    backgroundColor: hex,
                  }}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                    {row.alocacao.setor.nome}
                    {row.lote ? ` · ${row.lote.nome}` : ''}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>
                    {row.blocoEscolhido
                      ? `Bloco ${row.blocoEscolhido} · Fileira ${row.fileiraEscolhida} · Assento ${row.assentoEscolhido}`
                      : 'Assento Livre (Ordem de Chegada)'}
                  </Text>
                </View>
              </View>,
              <View style={{ gap: 2 }}>
                <AdminBadge
                  label={row.status}
                  tone={
                    row.status === 'VENDIDO'
                      ? 'success'
                      : row.status === 'UTILIZADO'
                        ? 'warning'
                        : 'danger'
                  }
                />
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10 }}>
                  {row.codigoPortaria}
                </Text>
              </View>,
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <AdminButton
                  label="Ver bilhete"
                  icon={QrCode}
                  iconOnly
                  size="small"
                  disabled={busy}
                  onPress={() => setBilheteVisivel(row)}
                />
                {row.status === 'VENDIDO' && (
                  <AdminButton
                    label="Cancelar"
                    icon={Ban}
                    iconOnly
                    variant="danger"
                    size="small"
                    disabled={busy}
                    onPress={() => void cancelar(row)}
                  />
                )}
              </View>,
            ],
          };
        })}
      />

      {(pages.length > 0 || next) && <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <AdminButton label="Anterior" disabled={busy || loading || !pages.length} onPress={() => setPages(previous => previous.slice(0, -1))} />
        <AdminButton label="Próxima" disabled={busy || loading || !next} onPress={() => { if (next) setPages(previous => [...previous, next]); }} />
      </View>}
      {modalOpen && (
        <Sheet
          visible
          title="Emissão manual de ingresso"
          onClose={busy ? () => {} : () => setModalOpen(false)}
        >
          <AdminSection title="Partida, setor e lote">
            <AdminFormGrid>
              <AdminSelect
                label="Partida"
                value={partidaId}
                placeholder="Selecione a partida..."
                disabled={busy}
                options={partidas.map((p) => ({
                  value: p.id,
                  label: `${p.timeMandante} × ${p.timeVisitante} (${p.estadio.nomePopular || p.estadio.nome})`,
                }))}
                onChange={handleSelectPartida}
              />
              <AdminSelect
                label="Setor do Estádio"
                value={alocacaoId}
                placeholder="Selecione o setor..."
                disabled={busy || !partidaSelecionada}
                options={(partidaSelecionada?.alocacoesSetor || []).map((a) => ({
                  value: a.id,
                  label: `${a.setor.nome} (${Math.max(0, a.capacidadeLiberada - a.quantidadeVendida - a.quantidadeReservada)} livres)`,
                }))}
                onChange={handleSelectAlocacao}
              />
              <AdminSelect
                label="Lote / Categoria"
                value={loteId}
                placeholder="Selecione o lote..."
                disabled={busy || !alocacaoSelecionada}
                options={(alocacaoSelecionada?.lotes || []).map((l) => ({
                  value: l.id || '',
                  label: `${l.nome} — ${money(l.precoCentavos)}`,
                }))}
                onChange={setLoteId}
              />
            </AdminFormGrid>
          </AdminSection>

          {alocacaoSelecionada?.setor.numerado && (
            <AdminSection title="Escolha do assento">
              {carregandoMapa ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Calculando malha do bloco e verificando assentos ocupados...
                </Text>
              ) : !mapaBloco || mapaBloco.blocosDisponiveis.length === 0 ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Nenhum bloco configurado para este setor.
                </Text>
              ) : (
                <View style={{ gap: 12 }}>
                  <AdminFormGrid>
                    <AdminSelect
                      label="Bloco do Setor"
                      value={blocoEscolhido ? String(blocoEscolhido) : ''}
                      placeholder="Selecione o bloco..."
                      disabled={busy}
                      options={mapaBloco.blocosDisponiveis.map((b) => ({
                        value: String(b.numeroBloco),
                        label: `Bloco ${b.numeroBloco} — ${b.nomeNivel} (${b.capacidadeBloco} lugares)`,
                      }))}
                      onChange={(val) => handleSelectBloco(Number(val))}
                    />
                    <AdminSelect
                      label="Fileira"
                      value={fileiraEscolhida}
                      placeholder="Selecione a fileira..."
                      disabled={busy || !blocoEscolhido || !mapaBloco.blocoSelecionado}
                      options={(mapaBloco.blocoSelecionado?.fileiras || []).map((f) => ({
                        value: f,
                        label: `Fileira ${f} (${qtdCadeirasFileira} assentos)`,
                      }))}
                      onChange={(val) => {
                        setFileiraEscolhida(val);
                        setAssentoEscolhido(null);
                      }}
                    />
                  </AdminFormGrid>

                  <View
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.soft,
                      gap: 10,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
                        Bloco {blocoEscolhido} · Fileira {fileiraEscolhida} — Clique no assento desejado:
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <AdminBadge label="Verde = Livre" tone="success" />
                        <AdminBadge label="Vermelho = Ocupado" tone="danger" />
                      </View>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {Array.from({ length: qtdCadeirasFileira }, (_, i) => i + 1).map(
                        (numCadeira) => {
                          const ocupado = ocupadosNaFileira.has(numCadeira);
                          const selecionado = assentoEscolhido === numCadeira;
                          return (
                            <Pressable
                              key={numCadeira}
                              accessibilityRole="button"
                              disabled={ocupado || busy}
                              onPress={() => setAssentoEscolhido(numCadeira)}
                              style={{
                                width: 38,
                                height: 34,
                                borderRadius: 6,
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderWidth: selecionado ? 2 : 1,
                                borderColor: selecionado
                                  ? '#FFFFFF'
                                  : ocupado
                                    ? '#991B1B'
                                    : '#15803D',
                                backgroundColor: ocupado
                                  ? '#DC2626'
                                  : selecionado
                                    ? '#2563EB'
                                    : '#16A34A',
                                opacity: ocupado ? 0.65 : 1,
                              }}
                            >
                              <Text
                                style={{
                                  color: '#FFFFFF',
                                  fontSize: 11,
                                  fontWeight: '700',
                                }}
                              >
                                {numCadeira}
                              </Text>
                            </Pressable>
                          );
                        }
                      )}
                    </View>

                    {assentoEscolhido && (
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
                        Selecionado: Bloco {blocoEscolhido} · Fileira {fileiraEscolhida} · Assento{' '}
                        {assentoEscolhido}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </AdminSection>
          )}

          <AdminSection title="Titular do ingresso">
            <AdminFormGrid>
              <AdminField
                label="Nome completo do titular"
                value={nomeTitular}
                onChange={setNomeTitular}
                placeholder="Ex.: João Carlos da Silva"
                required
                editable={!busy}
              />
              <AdminField
                label="CPF do titular (opcional)"
                value={cpfTitular}
                onChange={setCpfTitular}
                placeholder="000.000.000-00"
                mask="document"
                keyboardType="number-pad"
                maxLength={14}
                editable={!busy}
              />
            </AdminFormGrid>
          </AdminSection>

          {!!formError && <AdminNotice tone="error">{formError}</AdminNotice>}
          <Text style={{ color: colors.muted, fontSize: 13 }}>A emissão manual registra o pedido como pago e libera o bilhete para a portaria.</Text>
          <Button
            label="Emitir ingresso e gerar bilhete"
            loading={busy}
            onPress={() => void emitir()}
          />
        </Sheet>
      )}

      {bilheteVisivel && (
        <Sheet
          visible
          title="Bilhete digital"
          onClose={() => setBilheteVisivel(null)}
        >
          <View
            style={{
              borderRadius: 14,
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          >
            <View
              style={{
                backgroundColor: bilheteVisivel.alocacao.setor.corSetorHex || '#002244',
                padding: 16,
                gap: 4,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>
                {bilheteVisivel.partida.timeMandante} × {bilheteVisivel.partida.timeVisitante}
              </Text>
              <Text style={{ color: '#FFFFFF', fontSize: 12, opacity: 0.92 }}>
                {bilheteVisivel.partida.estadio.nomePopular || bilheteVisivel.partida.estadio.nome}{' '}
                · {bilheteVisivel.partida.estadio.cidade}/{bilheteVisivel.partida.estadio.estado}
              </Text>
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                {new Date(bilheteVisivel.partida.dataPartida).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>

            <View style={{ padding: 16, gap: 14 }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <View style={{ gap: 2 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>SETOR</Text>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>
                    {bilheteVisivel.alocacao.setor.nome}
                  </Text>
                </View>
                <View style={{ gap: 2 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>PORTÃO / LOCALIZAÇÃO</Text>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                    {bilheteVisivel.alocacao.setor.localizacao ||
                      bilheteVisivel.alocacao.setor.portaoEntrada ||
                      'Acesso Principal'}
                  </Text>
                </View>
                <View style={{ gap: 2 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>CATEGORIA / VALOR</Text>
                  <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                    {bilheteVisivel.lote?.nome || 'Ingresso'} ·{' '}
                    {money(
                      bilheteVisivel.pedido?.metodoBalcao && bilheteVisivel.pedido._count?.ingressos
                        ? bilheteVisivel.pedido.valorTotalCentavos / bilheteVisivel.pedido._count.ingressos
                        : bilheteVisivel.lote?.precoCentavos ??
                        bilheteVisivel.pedido?.valorTotalCentavos ??
                        0
                    )}
                  </Text>
                </View>
              </View>

              {!!bilheteVisivel.pedido?.metodoBalcao && <Text style={{ color: colors.muted, fontSize: 12 }}>
                Bilheteria · {bilheteVisivel.pedido.usuario?.name} · {bilheteVisivel.pedido.metodoBalcao === 'PIX' ? 'Pix Sicredi' : bilheteVisivel.pedido.metodoBalcao === 'PAGBANK' ? 'Moderninha Smart' : bilheteVisivel.pedido.metodoBalcao === 'CARD' ? 'Cartão físico' : 'Dinheiro'} · Total do pedido {money(bilheteVisivel.pedido.valorTotalCentavos)}
              </Text>}
              {bilheteVisivel.blocoEscolhido ? (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 10,
                    padding: 12,
                    borderRadius: 10,
                    backgroundColor: colors.soft,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>BLOCO</Text>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
                      {bilheteVisivel.blocoEscolhido}
                    </Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>FILEIRA</Text>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
                      {bilheteVisivel.fileiraEscolhida}
                    </Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>ASSENTO</Text>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
                      {bilheteVisivel.assentoEscolhido}
                    </Text>
                  </View>
                </View>
              ) : (
                <View
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: colors.soft,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                    Acomodação: Assento Livre por Ordem de Chegada
                  </Text>
                </View>
              )}

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <View style={{ gap: 2 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>TITULAR</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                    {bilheteVisivel.nomeTitular}
                  </Text>
                  {!!bilheteVisivel.cpfTitular && (
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      CPF: {bilheteVisivel.cpfTitular}
                    </Text>
                  )}
                </View>
                <AdminBadge
                  label={`Validação: ${bilheteVisivel.alocacao.setor.tipoValidacao || 'QR_CODE'}`}
                  tone="warning"
                />
              </View>

              <View
                style={{
                  alignItems: 'center',
                  padding: 14,
                  borderRadius: 10,
                  backgroundColor: '#FFFFFF',
                  gap: 6,
                }}
              >
                <QRCode value={bilheteVisivel.chaveQr} size={180} />
                {!!bilheteVisivel.codigoPortaria && <TicketBarcode code={bilheteVisivel.codigoPortaria} />}
              </View>

              {!!bilheteVisivel.alocacao.setor.instrucaoAcomodacao && (
                <Text style={{ color: colors.text, fontSize: 12 }}>
                  • {bilheteVisivel.alocacao.setor.instrucaoAcomodacao}
                </Text>
              )}
              {!!bilheteVisivel.alocacao.setor.avisosObrigatoriosSetor && (
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  ⚠️ {bilheteVisivel.alocacao.setor.avisosObrigatoriosSetor}
                </Text>
              )}
            </View>
          </View>
        </Sheet>
      )}
    </View>
  );
}

