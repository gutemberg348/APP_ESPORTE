import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Pencil, Trash2 } from 'lucide-react-native';
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
  AdminToggle,
} from '../AdminControls';
import { AdminBadge, AdminTable } from '../AdminLayout';
import { useTheme } from '../../../theme/ThemeProvider';
import {
  ingressoV1Api,
  type EstadioIngressoV1,
  type TemplateVendaIngressoV1,
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
};

type SetorRegraDraft = {
  setorId: string;
  nomeSetor: string;
  corSetorHex: string;
  numerado: boolean;
  capacidadeMaximaSetor: number;
  capacidadeLiberadaPadrao: string;
  precoBaseReais: string;
  incluirMeia: boolean;
  incluirSocio: boolean;
  ativo: boolean;
};

export function TemplatesVendaIngressoV1Panel({
  token,
  busy,
  onBusy,
  onNotice,
  onError,
  createOpen = false,
  onConsumeCreate,
}: Props) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<TemplateVendaIngressoV1[]>([]);
  const [estadios, setEstadios] = useState<EstadioIngressoV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateVendaIngressoV1 | null>(null);
  const [estadioId, setEstadioId] = useState('');
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [regrasDraft, setRegrasDraft] = useState<SetorRegraDraft[]>([]);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<TemplateVendaIngressoV1 | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [listaTemplates, listaEstadios] = await Promise.all([
        ingressoV1Api.templatesVenda(token),
        ingressoV1Api.estadios(token),
      ]);
      setRows(listaTemplates);
      setEstadios(listaEstadios);
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

  function buildDraftsForStadium(targetEstadioId: string, existing?: TemplateVendaIngressoV1 | null): SetorRegraDraft[] {
    const est = estadios.find((e) => e.id === targetEstadioId);
    const setores = est?.setores || [];
    return setores.map((s) => {
      const saved = existing?.regrasSetor.find((r) => r.setorId === s.id);
      const capMax = s.capacidadeVendaPadrao || s.capacidadeFisica;
      const precoCentavos = saved ? saved.precoBaseCentavos : 6000;
      const hasMeia = saved
        ? saved.categorias.some((c) => c.tipoCategoria === 'MEIA' && c.ativo)
        : true;
      const hasSocio = saved
        ? saved.categorias.some((c) => c.tipoCategoria === 'SOCIO' && c.ativo)
        : true;
      return {
        setorId: s.id,
        nomeSetor: s.nome,
        corSetorHex: s.corSetorHex || '#002244',
        numerado: s.numerado,
        capacidadeMaximaSetor: capMax,
        capacidadeLiberadaPadrao: String(saved ? saved.capacidadeLiberadaPadrao : capMax),
        precoBaseReais: (precoCentavos / 100).toFixed(2).replace('.', ','),
        incluirMeia: hasMeia,
        incluirSocio: hasSocio,
        ativo: saved ? saved.ativo : true,
      };
    });
  }

  function openCreate() {
    setEditing(null);
    setEstadioId('');
    setNome('');
    setDescricao('');
    setRegrasDraft([]);
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(row: TemplateVendaIngressoV1) {
    setEditing(row);
    setEstadioId(row.estadioId);
    setNome(row.nome);
    setDescricao(row.descricao || '');
    setRegrasDraft(buildDraftsForStadium(row.estadioId, row));
    setFormError('');
    setModalOpen(true);
  }

  function handleSelectEstadio(nextEstadioId: string) {
    setEstadioId(nextEstadioId);
    setRegrasDraft(buildDraftsForStadium(nextEstadioId, null));
  }

  function updateDraft(setorId: string, patch: Partial<SetorRegraDraft>) {
    setRegrasDraft((curr) =>
      curr.map((d) => (d.setorId === setorId ? { ...d, ...patch } : d))
    );
  }

  function parseReaisToCentavos(val: string): number {
    const normalized = val.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
    const num = Number(normalized);
    return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) : 0;
  }

  async function save() {
    if (!estadioId) {
      setFormError('Selecione o estádio.');
      return;
    }
    if (!nome.trim()) {
      setFormError('Informe o nome do template de venda.');
      return;
    }
    const ativas = regrasDraft.filter((d) => d.ativo);
    if (ativas.length === 0) {
      setFormError('Ative pelo menos um setor neste template de venda.');
      return;
    }

    const regrasSetor = regrasDraft.map((d) => {
      const cap = Math.max(1, Number(d.capacidadeLiberadaPadrao.replace(/\D/g, '') || d.capacidadeMaximaSetor));
      const precoBaseCentavos = parseReaisToCentavos(d.precoBaseReais);
      const categorias = [
        {
          nome: 'Inteira',
          tipoCategoria: 'INTEIRA' as const,
          percentualDesconto: 0,
          limiteCota: cap,
          ativo: true,
        },
        ...(d.incluirMeia
          ? [
              {
                nome: 'Meia-Entrada',
                tipoCategoria: 'MEIA' as const,
                percentualDesconto: 50,
                limiteCota: Math.max(1, Math.floor(cap * 0.4)),
                ativo: true,
              },
            ]
          : []),
        ...(d.incluirSocio
          ? [
              {
                nome: 'Sócio Torcedor',
                tipoCategoria: 'SOCIO' as const,
                percentualDesconto: 50,
                limiteCota: cap,
                ativo: true,
              },
            ]
          : []),
      ];
      return {
        setorId: d.setorId,
        capacidadeLiberadaPadrao: cap,
        precoBaseCentavos,
        ativo: d.ativo,
        categorias,
      };
    });

    onBusy(true);
    setFormError('');
    try {
      if (editing) {
        await ingressoV1Api.atualizarTemplateVenda(token, {
          id: editing.id,
          nome: nome.trim(),
          descricao: descricao.trim(),
          regrasSetor,
        });
      } else {
        await ingressoV1Api.criarTemplateVenda(token, {
          estadioId,
          nome: nome.trim(),
          descricao: descricao.trim(),
          regrasSetor,
        });
      }
      setModalOpen(false);
      await load();
      onNotice(editing ? 'Template de venda atualizado.' : 'Template de venda criado.');
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  async function remove(row: TemplateVendaIngressoV1) {
    onBusy(true);
    try {
      await ingressoV1Api.excluirTemplateVenda(token, row.id);
      setConfirmDelete(null);
      await load();
      onNotice('Template de venda excluído.');
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  return (
    <View style={{ gap: 18 }}>
      <AdminTable
        loading={loading}
        minWidth={0}
        empty="Nenhum template de venda cadastrado."
        columns={[
          { label: 'Template de venda', flex: 1.8 },
          { label: 'Estádio', flex: 1.3 },
          { label: 'Setores e preços', flex: 1.8 },
          { label: 'Ações', width: 84 },
        ]}
        rows={rows.map((row) => ({
          id: row.id,
          cells: [
            <Pressable
              accessibilityRole="button"
              onPress={() => openEdit(row)}
              disabled={busy}
              style={{ gap: 2 }}
            >
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                {row.nome}
              </Text>
              {!!row.descricao && (
                <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>
                  {row.descricao}
                </Text>
              )}
            </Pressable>,
            <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12 }}>
              {row.estadio.nomePopular || row.estadio.nome}
            </Text>,
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {row.regrasSetor.map((r) => (
                <AdminBadge
                  key={r.id || r.setorId}
                  label={`${r.setor?.nome || 'Setor'}: ${money(r.precoBaseCentavos)}`}
                  tone="neutral"
                />
              ))}
            </View>,
            <View style={{ flexDirection: 'row', gap: 6 }}>
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
        }))}
      />

      {modalOpen && (
        <Sheet
          visible
          title={editing ? 'Editar template de venda' : 'Criar template de venda'}
          onClose={busy ? () => {} : () => setModalOpen(false)}
        >
          <AdminSection title="Identificação comercial">
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
                onChange={handleSelectEstadio}
              />
              <AdminField
                label="Nome do template de venda"
                value={nome}
                onChange={setNome}
                placeholder="Ex.: Jogo Padrão Campeonato / Clássico"
                required
                editable={!busy}
              />
            </AdminFormGrid>
            <AdminField
              label="Descrição (opcional)"
              value={descricao}
              onChange={setDescricao}
              placeholder="Ex.: Tabela padrão de preços e cotas por setor"
              editable={!busy}
            />
          </AdminSection>

          <AdminSection title="Precificação e capacidade liberada por setor">
            {regrasDraft.length === 0 ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Este estádio ainda não possui setores vinculados.
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {regrasDraft.map((d) => (
                  <View
                    key={d.setorId}
                    style={{
                      padding: 12,
                      borderRadius: 8,
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
                        gap: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            backgroundColor: d.corSetorHex,
                          }}
                        />
                        <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                          {d.nomeSetor}
                        </Text>
                        <AdminBadge
                          label={d.numerado ? 'Assento marcado' : 'Livre'}
                          tone={d.numerado ? 'warning' : 'neutral'}
                        />
                      </View>
                      <AdminToggle
                        checkbox
                        label="Liberar setor"
                        value={d.ativo}
                        onChange={(v) => updateDraft(d.setorId, { ativo: v })}
                        disabled={busy}
                      />
                    </View>

                    {d.ativo && (
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          alignItems: 'flex-end',
                          gap: 10,
                        }}
                      >
                        <View style={{ width: 150 }}>
                          <AdminField
                            label={`Cap. liberada (máx. ${d.capacidadeMaximaSetor})`}
                            value={d.capacidadeLiberadaPadrao}
                            onChange={(v) =>
                              updateDraft(d.setorId, { capacidadeLiberadaPadrao: v })
                            }
                            keyboardType="number-pad"
                            editable={!busy}
                          />
                        </View>
                        <View style={{ width: 140 }}>
                          <AdminField
                            label="Preço Inteira (R$)"
                            value={d.precoBaseReais}
                            onChange={(v) => updateDraft(d.setorId, { precoBaseReais: v })}
                            placeholder="60,00"
                            editable={!busy}
                          />
                        </View>
                        <AdminToggle
                          checkbox
                          label="Meia-Entrada (50%)"
                          value={d.incluirMeia}
                          onChange={(v) => updateDraft(d.setorId, { incluirMeia: v })}
                          disabled={busy}
                        />
                        <AdminToggle
                          checkbox
                          label="Sócio (50%)"
                          value={d.incluirSocio}
                          onChange={(v) => updateDraft(d.setorId, { incluirSocio: v })}
                          disabled={busy}
                        />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </AdminSection>

          {!!formError && <AdminNotice tone="error">{formError}</AdminNotice>}
          <Button label="Salvar template de venda" loading={busy} onPress={() => void save()} />
        </Sheet>
      )}

      {confirmDelete && (
        <Sheet
          visible
          title="Excluir template de venda"
          onClose={busy ? () => {} : () => setConfirmDelete(null)}
        >
          <Text style={{ color: colors.text, fontSize: 13 }}>
            Confirma a exclusão do template "{confirmDelete.nome}"?
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

