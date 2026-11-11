import QRCode from 'react-native-qrcode-svg';
import { TicketBarcode } from '../../TicketBarcode';
import React, { useEffect, useState } from 'react';
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
  token: string;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
  createOpen?: boolean;
  onConsumeCreate?: () => void;
  initialPartidaId?: string;
};

export function IngressosEmitidosV1Panel({
  token,
  busy,
  onBusy,
  onNotice,
  onError,
  createOpen = false,
  onConsumeCreate,
  initialPartidaId,
}: Props) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<IngressoEmitidoV1[]>([]);
  const [partidas, setPartidas] = useState<PartidaIngressoV1[]>([]);
  const [filtroPartidaId, setFiltroPartidaId] = useState(initialPartidaId || '');
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
    setLoading(true);
    try {
      const [listaIngressos, listaPartidas] = await Promise.all([
        ingressoV1Api.ingressos(token, targetPartidaId || undefined),
        ingressoV1Api.partidas(token),
      ]);
      setRows(listaIngressos);
      setPartidas(listaPartidas);
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(filtroPartidaId);
  }, [token, filtroPartidaId]);

  useEffect(() => {
    if (initialPartidaId) {
      setFiltroPartidaId(initialPartidaId);
    }
  }, [initialPartidaId]);

  useEffect(() => {
    if (createOpen) {
      openEmitir();
      onConsumeCreate?.();
    }
  }, [createOpen]);

  async function carregarMapaDoSetor(targetAlocacaoId: string, targetBloco?: number) {
    setCarregandoMapa(true);
    try {
      const res = await ingressoV1Api.mapaBloco(token, targetAlocacaoId, targetBloco);
      setMapaBloco(res);
      if (targetBloco && res.blocoSelecionado) {
        setBlocoEscolhido(res.blocoSelecionado.numeroBloco);
      } else {
        setBlocoEscolhido(null);
        setFileiraEscolhida('');
      }
      setAssentoEscolhido(null);
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      setCarregandoMapa(false);
    }
  }

  function openEmitir() {
    setPartidaId('');
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
    setAlocacaoId(nextAlocacaoId);
    setLoteId('');
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
    if (!partidaId || !alocacaoId) {
      setFormError('Selecione a partida e o setor.');
      return;
    }
    if (!nomeTitular.trim()) {
      setFormError('Informe o nome completo do titular do ingresso.');
      return;
    }
    if (alocacaoSelecionada?.setor.numerado) {
      if (!blocoEscolhido || !fileiraEscolhida || !assentoEscolhido) {
        setFormError('Escolha o Bloco, a Fileira e clique em um Assento livre no mapa.');
        return;
      }
    }

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
          <AdminSelect
            label="Filtrar por partida"
            value={filtroPartidaId}
            disabled={busy}
            options={[
              { value: '', label: 'Todas as partidas V1' },
              ...partidas.map((p) => ({
                value: p.id,
                label: `${p.timeMandante} × ${p.timeVisitante} (${p.estadio.nomePopular || p.estadio.nome})`,
              })),
            ]}
            onChange={setFiltroPartidaId}
          />
        </View>
      </View>

      <AdminTable
        loading={loading}
        minWidth={0}
        empty="Nenhum ingresso V1 emitido até o momento."
        columns={[
          { label: 'Titular / Jogo', flex: 1.8 },
          { label: 'Setor e Assento', flex: 1.6 },
          { label: 'Status / QR', width: 135 },
          { label: 'Ações', width: 84 },
        ]}
        rows={rows.map((row) => {
          const hex = row.alocacao.setor.corSetorHex || '#002244';
          return {
            id: row.id,
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

      {modalOpen && (
        <Sheet
          visible
          title="Emitir ingresso V1 (Checkout em Tempo Real)"
          onClose={busy ? () => {} : () => setModalOpen(false)}
        >
          <AdminSection title="1. Partida, Setor e Categoria">
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
                  label: `${a.setor.nome} (${a.capacidadeLiberada - a.quantidadeVendida} livres)`,
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
            <AdminSection title="2. Escolha de Bloco, Fileira e Assento (Matriz em Memória)">
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

          <AdminSection title="3. Identificação do Titular">
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
                editable={!busy}
              />
            </AdminFormGrid>
          </AdminSection>

          {!!formError && <AdminNotice tone="error">{formError}</AdminNotice>}
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
          title="Bilhete Digital — Ingresso V1"
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
                      bilheteVisivel.lote?.precoCentavos ??
                        bilheteVisivel.pedido?.valorTotalCentavos ??
                        0
                    )}
                  </Text>
                </View>
              </View>

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

