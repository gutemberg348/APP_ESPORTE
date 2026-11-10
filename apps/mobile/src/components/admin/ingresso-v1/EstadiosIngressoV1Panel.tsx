import React, { useEffect, useState } from 'react';
import { View, Image, Pressable, ScrollView } from 'react-native';
import { Check, ChevronDown, ImagePlus, Pencil, Search, Trash2, X } from 'lucide-react-native';
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
  pickStadiumPhoto,
  type EstadioIngressoV1,
  type SetorEstadioConfigInput,
  type TemplateSetorIngressoV1,
} from '../../../services/ingresso-v1';
import { messageOf } from '../../../utils/format';

type Props = {
  token: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  createOpen?: boolean;
  onConsumeCreate?: () => void;
};

type SetorConfigRow = {
  id?: string;
  templateId: string;
  nome: string;
  corSetorHex?: string;
  acessoExterno: string;
  portaoEntrada: string;
  localizacao: string;
  fotoUrl: string;
  configuracaoMalhaAssentos?: EstadioIngressoV1['setores'] extends (infer U)[] | undefined
    ? U extends { configuracaoMalhaAssentos?: infer M }
      ? M
      : never
    : never;
};

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
].map((uf) => ({ value: uf, label: uf }));

export function EstadiosIngressoV1Panel({
  token,
  busy,
  onBusy,
  onNotice,
  onError,
  createOpen = false,
  onConsumeCreate,
}: Props) {
  const { colors } = useTheme();
  const [estadios, setEstadios] = useState<EstadioIngressoV1[]>([]);
  const [templatesSetor, setTemplatesSetor] = useState<TemplateSetorIngressoV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EstadioIngressoV1 | null>(null);

  const [nome, setNome] = useState('');
  const [nomePopular, setNomePopular] = useState('');
  const [endereco, setEndereco] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [estado, setEstado] = useState('PB');
  const [cep, setCep] = useState('');
  const [cnpjProprietarioOrganizador, setCnpjProprietarioOrganizador] = useState('');
  const [capacidadeMaxima, setCapacidadeMaxima] = useState('');
  const [capacidadeOperacionalLaudo, setCapacidadeOperacionalLaudo] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [mapaUrl, setMapaUrl] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [setoresConfig, setSetoresConfig] = useState<SetorConfigRow[]>([]);
  const [dropdownSetoresOpen, setDropdownSetoresOpen] = useState(false);
  const [buscaTemplate, setBuscaTemplate] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<EstadioIngressoV1 | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [estadiosRows, templatesRows] = await Promise.all([
        ingressoV1Api.estadios(token),
        ingressoV1Api.templatesSetor(token),
      ]);
      setEstadios(estadiosRows);
      setTemplatesSetor(templatesRows);
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

  function openCreate() {
    setEditing(null);
    setNome('');
    setNomePopular('');
    setEndereco('');
    setBairro('');
    setCidade('');
    setEstado('PB');
    setCep('');
    setCnpjProprietarioOrganizador('');
    setCapacidadeMaxima('');
    setCapacidadeOperacionalLaudo('');
    setLocalizacao('');
    setMapaUrl('');
    setFotoUrl('');
    setSetoresConfig([]);
    setDropdownSetoresOpen(false);
    setBuscaTemplate('');
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(estadio: EstadioIngressoV1) {
    setEditing(estadio);
    setNome(estadio.nome);
    setNomePopular(estadio.nomePopular || '');
    setEndereco(estadio.endereco || '');
    setBairro(estadio.bairro || '');
    setCidade(estadio.cidade);
    setEstado(estadio.estado || 'PB');
    setCep(estadio.cep || '');
    setCnpjProprietarioOrganizador(estadio.cnpjProprietarioOrganizador || '');
    setCapacidadeMaxima(estadio.capacidadeMaxima > 1 ? String(estadio.capacidadeMaxima) : '');
    setCapacidadeOperacionalLaudo(
      estadio.capacidadeOperacionalLaudo ? String(estadio.capacidadeOperacionalLaudo) : ''
    );
    setLocalizacao(estadio.localizacao || '');
    setMapaUrl(estadio.mapaUrl || '');
    setFotoUrl(estadio.fotoUrl || '');
    setSetoresConfig(
      (estadio.setores || [])
        .filter((s) => Boolean(s.templateId))
        .map((s) => ({
          id: s.id,
          templateId: s.templateId!,
          nome: s.nome || '',
          corSetorHex: s.corSetorHex,
          acessoExterno: s.acessoExterno || '',
          portaoEntrada: s.portaoEntrada || '',
          localizacao: s.localizacao || s.portaoEntrada || '',
          fotoUrl: s.fotoUrl || '',
          configuracaoMalhaAssentos: s.configuracaoMalhaAssentos,
        }))
    );
    setDropdownSetoresOpen(false);
    setBuscaTemplate('');
    setFormError('');
    setModalOpen(true);
  }

  async function handlePickPhoto() {
    setFormError('');
    try {
      const dataUrl = await pickStadiumPhoto();
      if (dataUrl) setFotoUrl(dataUrl);
    } catch (err) {
      setFormError(messageOf(err));
    }
  }

  async function handlePickSetorPhoto(templateId: string) {
    setFormError('');
    try {
      const dataUrl = await pickStadiumPhoto();
      if (dataUrl) {
        updateSetorConfig(templateId, { fotoUrl: dataUrl });
      }
    } catch (err) {
      setFormError(messageOf(err));
    }
  }

  function toggleTemplateSelection(template: TemplateSetorIngressoV1) {
    setSetoresConfig((curr) => {
      const exists = curr.some((item) => item.templateId === template.id);
      if (exists) {
        return curr.filter((item) => item.templateId !== template.id);
      }
      return [
        ...curr,
        {
          templateId: template.id,
          nome: template.nome,
          corSetorHex: template.corSetorHex,
          acessoExterno: '',
          portaoEntrada: '',
          localizacao: '',
          fotoUrl: '',
          configuracaoMalhaAssentos: template.configuracaoMalhaAssentos,
        },
      ];
    });
  }

  function updateSetorConfig(templateId: string, patch: Partial<SetorConfigRow>) {
    setSetoresConfig((curr) =>
      curr.map((item) => (item.templateId === templateId ? { ...item, ...patch } : item))
    );
  }

  async function save() {
    if (!nome.trim() || !cidade.trim()) {
      setFormError('Informe o nome e a cidade do estádio.');
      return;
    }

    const capMaxNum = capacidadeMaxima.trim() ? Number(capacidadeMaxima) : undefined;
    const capLaudoNum = capacidadeOperacionalLaudo.trim() ? Number(capacidadeOperacionalLaudo) : null;

    const formattedSetoresConfig: SetorEstadioConfigInput[] = setoresConfig.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      templateId: s.templateId,
      nome: s.nome.trim() || null,
      corSetorHex: s.corSetorHex || null,
      acessoExterno: s.acessoExterno.trim() || null,
      localizacao: s.localizacao.trim() || s.portaoEntrada.trim() || null,
      portaoEntrada: s.portaoEntrada.trim() || s.localizacao.trim() || null,
      fotoUrl: s.fotoUrl.trim() || null,
      ...(s.configuracaoMalhaAssentos ? { configuracaoMalhaAssentos: s.configuracaoMalhaAssentos } : {}),
    }));

    const body = {
      nome: nome.trim(),
      nomePopular: nomePopular.trim() || null,
      endereco: endereco.trim() || null,
      bairro: bairro.trim() || null,
      cidade: cidade.trim(),
      estado: estado.trim().toUpperCase() || null,
      cep: cep.trim() || null,
      cnpjProprietarioOrganizador: cnpjProprietarioOrganizador.trim() || null,
      ...(capMaxNum && Number.isInteger(capMaxNum) && capMaxNum >= 1 ? { capacidadeMaxima: capMaxNum } : {}),
      capacidadeOperacionalLaudo:
        capLaudoNum && Number.isInteger(capLaudoNum) && capLaudoNum >= 1 ? capLaudoNum : null,
      localizacao: localizacao.trim() || null,
      mapaUrl: mapaUrl.trim() || null,
      fotoUrl: fotoUrl.trim() || null,
      templatesSetorIds: formattedSetoresConfig.map((s) => s.templateId),
      setoresConfig: formattedSetoresConfig,
    };

    onBusy(true);
    setFormError('');
    try {
      if (editing) {
        await ingressoV1Api.atualizarEstadio(token, { ...body, id: editing.id });
      } else {
        await ingressoV1Api.criarEstadio(token, body);
      }
      setModalOpen(false);
      await load();
      onNotice(editing ? 'Estádio atualizado.' : 'Estádio cadastrado.');
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  async function remove(estadio: EstadioIngressoV1) {
    onBusy(true);
    onError('');
    try {
      await ingressoV1Api.excluirEstadio(token, estadio.id);
      setConfirmDelete(null);
      await load();
      onNotice('Estádio excluído.');
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
        empty="Nenhum estádio cadastrado."
        columns={[
          { label: 'Estádio / Localização', flex: 1.5 },
          { label: 'Capacidades', width: 145 },
          { label: 'Setores vinculados', flex: 1.7 },
          { label: 'Ações', width: 84 },
        ]}
        rows={estadios.map((estadio) => {
          const enderecoParts = [
            estadio.endereco,
            estadio.bairro,
            `${estadio.cidade}${estadio.estado ? `/${estadio.estado}` : ''}`,
          ].filter(Boolean);

          return {
            id: estadio.id,
            cells: [
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Editar ${estadio.nome}`}
                disabled={busy}
                onPress={() => openEdit(estadio)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                {!!estadio.fotoUrl && (
                  <Image
                    source={{ uri: estadio.fotoUrl }}
                    accessibilityLabel={estadio.nome}
                    style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: colors.soft }}
                    resizeMode="cover"
                  />
                )}
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                    {estadio.nome}
                    {estadio.nomePopular ? ` (${estadio.nomePopular})` : ''}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>
                    {enderecoParts.join(' · ')}
                  </Text>
                </View>
              </Pressable>,
              <View style={{ gap: 4 }}>
                {estadio.capacidadeMaxima > 1 && (
                  <AdminBadge
                    label={`Estrutural: ${estadio.capacidadeMaxima.toLocaleString('pt-BR')}`}
                    tone="neutral"
                  />
                )}
                {!!estadio.capacidadeOperacionalLaudo && (
                  <AdminBadge
                    label={`Laudo: ${estadio.capacidadeOperacionalLaudo.toLocaleString('pt-BR')}`}
                    tone="success"
                  />
                )}
              </View>,
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {(estadio.setores || []).map((setor) => {
                  const hex = (setor.corSetorHex || '#002244').toUpperCase();
                  return (
                    <View
                      key={setor.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        borderRadius: 5,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.soft,
                      }}
                    >
                      <View
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          backgroundColor: hex,
                        }}
                      />
                      <Text numberOfLines={1} style={{ color: colors.text, fontSize: 11, fontWeight: '500', maxWidth: 170 }}>
                        {setor.nome.split(' - ')[0]}
                      </Text>
                      <Text style={{ color: colors.muted, fontSize: 10 }}>
                        ({(setor.capacidadeVendaPadrao ?? setor.capacidadeFisica).toLocaleString('pt-BR')})
                      </Text>
                    </View>
                  );
                })}
                {(!estadio.setores || estadio.setores.length === 0) && (
                  <Text style={{ color: colors.subtle, fontSize: 12 }}>Sem setores</Text>
                )}
              </View>,
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <AdminButton
                  label="Editar"
                  icon={Pencil}
                  iconOnly
                  size="small"
                  disabled={busy}
                  onPress={() => openEdit(estadio)}
                />
                <AdminButton
                  label="Excluir"
                  icon={Trash2}
                  iconOnly
                  variant="danger"
                  size="small"
                  disabled={busy}
                  onPress={() => setConfirmDelete(estadio)}
                />
              </View>,
            ],
          };
        })}
      />

      {modalOpen && (
        <Sheet
          visible
          title={editing ? 'Editar estádio' : 'Cadastrar estádio'}
          onClose={busy ? () => {} : () => setModalOpen(false)}
        >
          <AdminSection title="Identificação">
            <AdminFormGrid>
              <AdminField label="Nome do estádio" value={nome} onChange={setNome} required editable={!busy} />
              <AdminField label="Apelido do estádio" value={nomePopular} onChange={setNomePopular} editable={!busy} />
              <AdminField
                label="CNPJ Proprietário / Organizador"
                value={cnpjProprietarioOrganizador}
                onChange={setCnpjProprietarioOrganizador}
                placeholder="00.000.000/0000-00"
                editable={!busy}
              />
            </AdminFormGrid>
          </AdminSection>

          <AdminSection title="Endereço e localização">
            <AdminFormGrid>
              <AdminField label="Endereço (Logradouro)" value={endereco} onChange={setEndereco} editable={!busy} />
              <AdminField label="Bairro" value={bairro} onChange={setBairro} editable={!busy} />
            </AdminFormGrid>
            <AdminFormGrid>
              <AdminField label="Cidade" value={cidade} onChange={setCidade} required editable={!busy} />
              <AdminSelect label="Estado (UF)" value={estado} options={UF_OPTIONS} onChange={setEstado} disabled={busy} />
              <AdminField label="CEP" value={cep} onChange={setCep} placeholder="00000-000" editable={!busy} />
            </AdminFormGrid>
            <AdminFormGrid>
              <AdminField
                label="Complemento / Referência"
                value={localizacao}
                onChange={setLocalizacao}
                editable={!busy}
              />
              <AdminField
                label="Link do mapa"
                value={mapaUrl}
                onChange={setMapaUrl}
                autoCapitalize="none"
                editable={!busy}
              />
            </AdminFormGrid>
          </AdminSection>

          <AdminSection title="Capacidades do estádio">
            <AdminFormGrid>
              <AdminField
                label="Capacidade máxima estrutural"
                value={capacidadeMaxima}
                onChange={setCapacidadeMaxima}
                keyboardType="number-pad"
                placeholder="Ex.: 11000"
                editable={!busy}
              />
              <AdminField
                label="Capacidade operacional (Laudo)"
                value={capacidadeOperacionalLaudo}
                onChange={setCapacidadeOperacionalLaudo}
                keyboardType="number-pad"
                placeholder="Ex.: 5500"
                editable={!busy}
              />
            </AdminFormGrid>
          </AdminSection>

          <AdminSection title="Foto do estádio">
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <AdminButton
                label="Escolher foto"
                icon={ImagePlus}
                size="small"
                disabled={busy}
                onPress={() => void handlePickPhoto()}
              />
              {!!fotoUrl && (
                <AdminButton
                  label="Remover foto"
                  variant="ghost"
                  size="small"
                  disabled={busy}
                  onPress={() => setFotoUrl('')}
                />
              )}
            </View>
            {!fotoUrl.startsWith('data:image/') && (
              <AdminField
                label="Ou URL da foto"
                value={fotoUrl}
                onChange={setFotoUrl}
                autoCapitalize="none"
                editable={!busy}
              />
            )}
            {!!fotoUrl && (
              <Image
                source={{ uri: fotoUrl }}
                accessibilityLabel="Foto do estádio"
                style={{ width: '100%', height: 140, borderRadius: 8, backgroundColor: colors.soft }}
                resizeMode="cover"
              />
            )}
          </AdminSection>

          <AdminSection title="Setores do estádio">
            {setoresConfig.length > 0 && (
              <View style={{ gap: 10 }}>
                {setoresConfig.map((row) => {
                  const template = templatesSetor.find((t) => t.id === row.templateId);
                  const hex = (row.corSetorHex || template?.corSetorHex || '#002244').toUpperCase();
                  const niveis = row.configuracaoMalhaAssentos?.niveis_disponiveis || [];
                  return (
                    <View
                      key={row.templateId}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderLeftWidth: 4,
                        borderLeftColor: hex,
                        borderRadius: 8,
                        padding: 10,
                        backgroundColor: colors.surface,
                        gap: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: 4,
                            backgroundColor: hex,
                          }}
                        />
                        <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontSize: 12, fontWeight: '600' }}>
                          {row.nome || template?.nome}
                          {template?.slug ? ` (${template.slug})` : ''}
                        </Text>
                        {!!template && (
                          <AdminBadge
                            label={`${(template.capacidadeVendaPadrao ?? template.capacidadeFisica).toLocaleString('pt-BR')} lugares`}
                            tone="neutral"
                          />
                        )}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remover setor ${row.nome}`}
                          disabled={busy}
                          onPress={() =>
                            setSetoresConfig((curr) =>
                              curr.filter((item) => item.templateId !== row.templateId)
                            )
                          }
                          style={{ padding: 4 }}
                        >
                          <X size={15} color={colors.muted} />
                        </Pressable>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                        <View style={{ flex: 1, minWidth: 160 }}>
                          <AdminField
                            label="Nome no estádio"
                            value={row.nome}
                            onChange={(val) => updateSetorConfig(row.templateId, { nome: val })}
                            placeholder="Ex.: Setor Amarelo"
                            editable={!busy}
                          />
                        </View>
                        <View style={{ flex: 1.2, minWidth: 200 }}>
                          <AdminField
                            label="Localização / Portão / Acesso"
                            value={row.localizacao}
                            onChange={(val) =>
                              updateSetorConfig(row.templateId, { localizacao: val, portaoEntrada: val })
                            }
                            placeholder="Ex.: Portão B · Esplanada - Rampa Sul"
                            editable={!busy}
                          />
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {!!row.fotoUrl && (
                            <Image
                              source={{ uri: row.fotoUrl }}
                              accessibilityLabel={`Foto ${row.nome}`}
                              style={{ width: 42, height: 42, borderRadius: 6, backgroundColor: colors.soft }}
                              resizeMode="cover"
                            />
                          )}
                          <AdminButton
                            label={row.fotoUrl ? 'Trocar foto' : 'Foto'}
                            icon={ImagePlus}
                            size="small"
                            disabled={busy}
                            onPress={() => void handlePickSetorPhoto(row.templateId)}
                          />
                          {!!row.fotoUrl && (
                            <AdminButton
                              label="Remover foto"
                              icon={Trash2}
                              iconOnly
                              variant="ghost"
                              size="small"
                              disabled={busy}
                              onPress={() => updateSetorConfig(row.templateId, { fotoUrl: '' })}
                            />
                          )}
                        </View>
                      </View>

                      {niveis.length > 0 && (
                        <View style={{ gap: 3, paddingTop: 4, borderTopWidth: 1, borderColor: colors.border }}>
                          {niveis.map((n, idx) => (
                            <Text key={idx} style={{ color: colors.muted, fontSize: 11 }}>
                              <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>
                                {n.nome_nivel}:{' '}
                              </Text>
                              {(n.blocos || [])
                                .map(
                                  (b) =>
                                    `${b.identificador_bloco} (${b.capacidade_bloco} lug. · Fileiras ${b.regra_fileiras.de_fileira}–${b.regra_fileiras.ate_fileira}, ${b.regra_fileiras.cadeiras_por_fileira}/fila)`
                                )
                                .join(' · ')}
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={{ gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Selecionar templates de setores"
                accessibilityState={{ expanded: dropdownSetoresOpen, disabled: busy }}
                disabled={busy}
                onPress={() => setDropdownSetoresOpen((v) => !v)}
                style={{
                  minHeight: 45,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: dropdownSetoresOpen ? colors.primary : colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                <Text style={{ color: setoresConfig.length ? colors.text : colors.subtle, fontSize: 13 }}>
                  {setoresConfig.length > 0
                    ? `${setoresConfig.length} template(s) selecionado(s) — clique para escolher na lista suspensa`
                    : 'Escolher templates de setores na lista suspensa…'}
                </Text>
                <ChevronDown
                  size={16}
                  color={colors.subtle}
                  style={{ transform: [{ rotate: dropdownSetoresOpen ? '180deg' : '0deg' }] }}
                />
              </Pressable>

              {dropdownSetoresOpen && (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    backgroundColor: colors.surface,
                    padding: 10,
                    gap: 8,
                  }}
                >
                  {templatesSetor.length > 5 && (
                    <AdminField
                      label="Buscar setor"
                      icon={Search}
                      value={buscaTemplate}
                      onChange={setBuscaTemplate}
                      placeholder="Digite o nome do setor…"
                      autoCapitalize="none"
                    />
                  )}
                  <ScrollView
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    style={{ maxHeight: 220 }}
                    contentContainerStyle={{ gap: 4 }}
                  >
                    {templatesSetor
                      .filter((t) =>
                        t.nome.toLowerCase().includes(buscaTemplate.trim().toLowerCase())
                      )
                      .map((template) => {
                        const checked = setoresConfig.some((item) => item.templateId === template.id);
                        return (
                          <Pressable
                            key={template.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked, disabled: busy }}
                            disabled={busy}
                            onPress={() => toggleTemplateSelection(template)}
                            style={({ pressed }) => ({
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                              paddingHorizontal: 10,
                              paddingVertical: 9,
                              borderRadius: 6,
                              backgroundColor: checked
                                ? colors.primarySoft
                                : pressed
                                  ? colors.soft
                                  : 'transparent',
                            })}
                          >
                            <View
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 4,
                                backgroundColor: template.corSetorHex || '#002244',
                                borderWidth: 1,
                                borderColor: colors.border,
                              }}
                            />
                            <Text
                              style={{
                                flex: 1,
                                color: checked ? colors.primary : colors.text,
                                fontSize: 13,
                                fontWeight: checked ? '600' : '400',
                              }}
                            >
                              {template.nome}
                            </Text>
                            <Text style={{ color: colors.muted, fontSize: 11 }}>
                              {(template.capacidadeVendaPadrao ?? template.capacidadeFisica).toLocaleString('pt-BR')} lugares
                            </Text>
                            {checked && <Check size={16} color={colors.primary} />}
                          </Pressable>
                        );
                      })}
                    {templatesSetor.length === 0 && (
                      <Text style={{ color: colors.subtle, fontSize: 12, padding: 8 }}>
                        Nenhum template cadastrado em Templates de setores.
                      </Text>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          </AdminSection>

          {!!formError && <AdminNotice tone="error">{formError}</AdminNotice>}
          <Button label="Salvar estádio" loading={busy} onPress={() => void save()} />
        </Sheet>
      )}

      {confirmDelete && (
        <Sheet
          visible
          title="Excluir estádio"
          onClose={busy ? () => {} : () => setConfirmDelete(null)}
        >
          <Text style={{ color: colors.text }}>Deseja excluir o estádio "{confirmDelete.nome}"?</Text>
          <AdminButton
            variant="danger"
            label="Confirmar exclusão"
            loading={busy}
            onPress={() => void remove(confirmDelete)}
          />
        </Sheet>
      )}
    </View>
  );
}
