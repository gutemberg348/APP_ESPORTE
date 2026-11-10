import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Armchair, Building2, Layers, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import { Panel } from '../../ui';
import { Text } from '../../Typography';
import {
  AdminButton,
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
  type AssentoIngressoV1,
  type EstadioIngressoV1,
  type SetorEstadioIngressoV1,
} from '../../../services/ingresso-v1';
import { messageOf } from '../../../utils/format';

type Props = {
  token: string;
  busy: boolean;
  onBusy: (busy: boolean) => void;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  fixedEstadioId?: string;
  onChanged?: () => void;
};

const TIPO_SETOR_OPTIONS = [
  { value: 'Arquibancada', label: 'Arquibancada' },
  { value: 'Cadeira', label: 'Cadeira / Assento' },
  { value: 'Camarote', label: 'Camarote / Área VIP' },
  { value: 'Visitante', label: 'Setor Visitante' },
  { value: 'Geral', label: 'Geral / Pista' },
];

const ORIENTACAO_SOLAR_OPTIONS = [
  { value: 'SOMBRA', label: 'Sombra / Coberto' },
  { value: 'SOL', label: 'Exposto ao Sol' },
  { value: 'PARCIAL', label: 'Sol e Sombra Parcial' },
];

const emptyForm = {
  nome: '',
  tipo: 'Arquibancada',
  bloco: '',
  nivel: '',
  descricao: '',
  capacidadeFisica: '',
  capacidadeVisitante: '0',
  portoesAcesso: '',
  modeloCadeira: '',
  corCadeira: '',
  larguraCadeiraCm: '',
};

export function SetoresAssentosIngressoV1Panel({
  token,
  busy,
  onBusy,
  onNotice,
  onError,
  fixedEstadioId,
  onChanged,
}: Props) {
  const { colors } = useTheme();
  const [estadios, setEstadios] = useState<EstadioIngressoV1[]>([]);
  const [estadioId, setEstadioId] = useState(fixedEstadioId || '');
  const [setores, setSetores] = useState<SetorEstadioIngressoV1[]>([]);
  const [formOpen, setFormOpen] = useState(!fixedEstadioId);
  const [editing, setEditing] = useState<SetorEstadioIngressoV1 | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [numerado, setNumerado] = useState(false);
  const [acessivel, setAcessivel] = useState(false);
  const [permiteVisitante, setPermiteVisitante] = useState(false);
  const [orientacaoSolar, setOrientacaoSolar] = useState<'SOL' | 'SOMBRA' | 'PARCIAL'>('PARCIAL');
  const [possuiCadeiras, setPossuiCadeiras] = useState(false);
  const [possuiEncosto, setPossuiEncosto] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Gestão de assentos do setor aberto
  const [activeSeatsSectorId, setActiveSeatsSectorId] = useState<string | null>(null);
  const [assentos, setAssentos] = useState<AssentoIngressoV1[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [confirmClearSeatsId, setConfirmClearSeatsId] = useState<string | null>(null);
  const [geracao, setGeracao] = useState({
    bloco: '',
    fileira: 'A',
    fileiras: '5',
    inicial: '1',
    porFileira: '20',
    acessivel: false,
    reservadoVisitante: false,
  });

  async function loadEstadios() {
    try {
      const rows = await ingressoV1Api.estadios(token);
      setEstadios(rows);
      if (!estadioId && rows[0]) {
        setEstadioId(rows[0].id);
      }
    } catch (error) {
      onError(messageOf(error));
    }
  }

  async function loadSetores() {
    if (!estadioId) {
      setSetores([]);
      return;
    }
    try {
      setSetores(await ingressoV1Api.setores(token, estadioId));
    } catch (error) {
      onError(messageOf(error));
    }
  }

  async function loadAssentos(setorId: string) {
    setLoadingSeats(true);
    try {
      setAssentos(await ingressoV1Api.assentos(token, setorId));
    } catch (error) {
      onError(messageOf(error));
    } finally {
      setLoadingSeats(false);
    }
  }

  useEffect(() => {
    if (!fixedEstadioId) void loadEstadios();
  }, [token, fixedEstadioId]);

  useEffect(() => {
    if (fixedEstadioId) setEstadioId(fixedEstadioId);
  }, [fixedEstadioId]);

  useEffect(() => {
    void loadSetores();
    setActiveSeatsSectorId(null);
    setAssentos([]);
  }, [token, estadioId]);

  function setField(key: keyof typeof emptyForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setEditing(null);
    setForm(emptyForm);
    setNumerado(false);
    setAcessivel(false);
    setPermiteVisitante(false);
    setOrientacaoSolar('PARCIAL');
    setPossuiCadeiras(false);
    setPossuiEncosto(false);
  }

  function edit(row: SetorEstadioIngressoV1) {
    setEditing(row);
    setFormOpen(true);
    setEstadioId(row.estadioId);
    setForm({
      nome: row.nome,
      tipo: row.tipo || 'Arquibancada',
      bloco: row.bloco || '',
      nivel: row.nivel || '',
      descricao: row.descricao || '',
      capacidadeFisica: String(row.capacidadeFisica),
      capacidadeVisitante: String(row.capacidadeVisitante),
      portoesAcesso: Array.isArray(row.portoesAcesso) ? row.portoesAcesso.join(', ') : '',
      modeloCadeira: row.modeloCadeira || '',
      corCadeira: row.corCadeira || '',
      larguraCadeiraCm: row.larguraCadeiraCm ? String(row.larguraCadeiraCm) : '',
    });
    setNumerado(row.numerado);
    setAcessivel(row.acessivel);
    setPermiteVisitante(row.permiteVisitante);
    setOrientacaoSolar(row.orientacaoSolar);
    setPossuiCadeiras(row.possuiCadeiras);
    setPossuiEncosto(row.possuiEncosto);
  }

  async function save() {
    const capacidadeFisica = Number(form.capacidadeFisica);
    const capacidadeVisitante = permiteVisitante ? Number(form.capacidadeVisitante || 0) : 0;
    if (
      !estadioId ||
      !form.nome.trim() ||
      !Number.isInteger(capacidadeFisica) ||
      capacidadeFisica < 1 ||
      !Number.isInteger(capacidadeVisitante) ||
      capacidadeVisitante > capacidadeFisica
    ) {
      onError('Informe estádio, nome do setor e capacidades válidas.');
      return;
    }
    const larguraCadeiraCm = form.larguraCadeiraCm ? Number(form.larguraCadeiraCm) : null;
    if (
      possuiCadeiras &&
      (!form.modeloCadeira.trim() ||
        larguraCadeiraCm === null ||
        !Number.isInteger(larguraCadeiraCm) ||
        larguraCadeiraCm < 1)
    ) {
      onError('Informe o modelo e a largura da cadeira em cm.');
      return;
    }
    const body = {
      estadioId,
      nome: form.nome.trim(),
      tipo: form.tipo.trim() || null,
      bloco: form.bloco.trim() || null,
      nivel: form.nivel.trim() || null,
      descricao: form.descricao.trim() || null,
      capacidadeFisica,
      capacidadeVisitante,
      numerado,
      acessivel,
      permiteVisitante,
      orientacaoSolar,
      possuiCadeiras,
      modeloCadeira: possuiCadeiras ? form.modeloCadeira.trim() : null,
      corCadeira: possuiCadeiras ? form.corCadeira.trim() || null : null,
      larguraCadeiraCm: possuiCadeiras ? larguraCadeiraCm : null,
      possuiEncosto: possuiCadeiras && possuiEncosto,
      portoesAcesso: form.portoesAcesso
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };
    onBusy(true);
    onError('');
    try {
      if (editing) {
        await ingressoV1Api.atualizarSetor(token, { ...body, id: editing.id });
      } else {
        await ingressoV1Api.criarSetor(token, body);
      }
      reset();
      await loadSetores();
      onChanged?.();
      onNotice(editing ? 'Setor atualizado com sucesso.' : 'Setor cadastrado no estádio.');
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  async function removeSector(id: string) {
    onBusy(true);
    onError('');
    try {
      await ingressoV1Api.excluirSetor(token, id);
      setConfirmDeleteId(null);
      if (editing?.id === id) reset();
      if (activeSeatsSectorId === id) {
        setActiveSeatsSectorId(null);
        setAssentos([]);
      }
      await loadSetores();
      onChanged?.();
      onNotice('Setor excluído permanentemente.');
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  function toggleSeatsPanel(setor: SetorEstadioIngressoV1) {
    if (activeSeatsSectorId === setor.id) {
      setActiveSeatsSectorId(null);
      setAssentos([]);
      return;
    }
    setActiveSeatsSectorId(setor.id);
    setGeracao((curr) => ({ ...curr, bloco: setor.bloco || '' }));
    void loadAssentos(setor.id);
  }

  async function generate(setorId: string) {
    const quantidadeFileiras = Number(geracao.fileiras);
    const numeroInicial = Number(geracao.inicial);
    const quantidadePorFileira = Number(geracao.porFileira);
    if (
      !geracao.fileira.trim() ||
      !Number.isInteger(quantidadeFileiras) ||
      quantidadeFileiras < 1 ||
      !Number.isInteger(numeroInicial) ||
      numeroInicial < 1 ||
      !Number.isInteger(quantidadePorFileira) ||
      quantidadePorFileira < 1
    ) {
      onError('Informe fileira inicial, quantidade de fileiras e cadeiras por fileira válidas.');
      return;
    }
    const body = {
      setorId,
      bloco: geracao.bloco.trim() || null,
      fileiraInicial: geracao.fileira.trim().toUpperCase(),
      quantidadeFileiras,
      numeroInicial,
      quantidadePorFileira,
      tipo: null,
      acessivel: geracao.acessivel,
      reservadoVisitante: geracao.reservadoVisitante,
    };
    onBusy(true);
    onError('');
    try {
      const result = await ingressoV1Api.gerarAssentos(token, body);
      await loadSetores();
      await loadAssentos(setorId);
      onChanged?.();
      onNotice(`${result.criados} assentos gerados com sucesso.`);
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  async function removeSeat(seatId: string, setorId: string) {
    onBusy(true);
    onError('');
    try {
      await ingressoV1Api.excluirAssento(token, seatId);
      await loadSetores();
      await loadAssentos(setorId);
      onNotice('Assento excluído.');
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  async function clearSeats(setorId: string) {
    onBusy(true);
    onError('');
    try {
      const res = await ingressoV1Api.limparAssentosSetor(token, setorId);
      setConfirmClearSeatsId(null);
      await loadSetores();
      await loadAssentos(setorId);
      onNotice(`${res.removidos} assentos removidos do setor.`);
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  // Agrupa os assentos carregados por Bloco + Fileira para exibição organizada
  const groupedSeats = React.useMemo(() => {
    const map = new Map<string, AssentoIngressoV1[]>();
    for (const seat of assentos) {
      const key = `${seat.bloco ? `Bloco ${seat.bloco} · ` : ''}Fileira ${seat.fileira}`;
      const list = map.get(key) || [];
      list.push(seat);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [assentos]);

  const labelSolar = (solar: 'SOL' | 'SOMBRA' | 'PARCIAL') =>
    solar === 'SOMBRA' ? 'Sombra / Coberto' : solar === 'SOL' ? 'Exposto ao Sol' : 'Sol e Sombra Parcial';

  return (
    <View style={{ gap: 18 }}>
      {!fixedEstadioId && (
        <Panel style={{ borderRadius: 14, padding: 18, gap: 12 }}>
          <AdminSelect
            label="Selecione o Estádio para gerenciar seus Setores e Assentos"
            value={estadioId}
            options={estadios.map((e) => ({
              value: e.id,
              label: `${e.nome}${e.nomePopular ? ` (${e.nomePopular})` : ''}`,
              description: `${e.cidade}${e.estado ? `/${e.estado}` : ''} · Capacidade: ${e.capacidadeMaxima.toLocaleString('pt-BR')} · ${e._count.setores} setores`,
            }))}
            onChange={setEstadioId}
            placeholder="Escolha um estádio cadastrado"
          />
        </Panel>
      )}

      <Panel style={{ borderRadius: 14, padding: 18, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Layers size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text heading style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
                {editing ? `Editando setor: ${editing.nome}` : 'Adicionar setor a este estádio'}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Configure arquibancadas, cadeiras, portões de entrada e numeração de assentos.
              </Text>
            </View>
          </View>
          <AdminButton
            label={formOpen ? 'Recolher formulário' : 'Novo setor'}
            icon={formOpen ? X : Plus}
            size="small"
            onPress={() => setFormOpen((v) => !v)}
          />
        </View>

        {formOpen && (
          <View style={{ gap: 16, paddingTop: 6 }}>
            <AdminFormGrid>
              <AdminField
                label="Nome do setor"
                value={form.nome}
                onChange={(v) => setField('nome', v)}
                required
                placeholder="Ex.: Arquibancada Sombra, Cadeira Central..."
              />
              <AdminSelect
                label="Tipo"
                value={form.tipo}
                options={TIPO_SETOR_OPTIONS}
                onChange={(v) => setField('tipo', v)}
                searchable={false}
              />
              <AdminSelect
                label="Orientação solar"
                value={orientacaoSolar}
                options={ORIENTACAO_SOLAR_OPTIONS}
                onChange={(v) => setOrientacaoSolar(v as 'SOL' | 'SOMBRA' | 'PARCIAL')}
                searchable={false}
              />
            </AdminFormGrid>

            <AdminFormGrid>
              <AdminField
                label="Capacidade física (lugares)"
                value={form.capacidadeFisica}
                onChange={(v) => setField('capacidadeFisica', v)}
                keyboardType="number-pad"
                required
                placeholder="Ex.: 2000"
              />
              <AdminField
                label="Bloco / Ala (opcional)"
                value={form.bloco}
                onChange={(v) => setField('bloco', v)}
                placeholder="Ex.: Bloco A, Norte..."
              />
              <AdminField
                label="Nível / Anel (opcional)"
                value={form.nivel}
                onChange={(v) => setField('nivel', v)}
                placeholder="Ex.: Inferior, Superior..."
              />
              <AdminField
                label="Portões de acesso (entrada/saída)"
                value={form.portoesAcesso}
                onChange={(v) => setField('portoesAcesso', v)}
                placeholder="Ex.: Portão 1, Portão 3"
                hint="Separe por vírgula"
              />
            </AdminFormGrid>

            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 10,
                padding: 12,
                gap: 10,
                backgroundColor: colors.soft,
              }}
            >
              <AdminFormGrid>
                <AdminToggle
                  label="Setor numerado (Assentos marcados)"
                  hint="Habilita o mapeamento de fileiras e cadeiras individuais."
                  value={numerado}
                  onChange={setNumerado}
                  checkbox
                />
                <AdminToggle
                  label="Possui cadeiras físicas"
                  hint="Informa modelo, cor e largura das cadeiras."
                  value={possuiCadeiras}
                  onChange={setPossuiCadeiras}
                  checkbox
                />
                <AdminToggle
                  label="Acessibilidade (PCD)"
                  value={acessivel}
                  onChange={setAcessivel}
                  checkbox
                />
                <AdminToggle
                  label="Permite torcida visitante"
                  value={permiteVisitante}
                  onChange={setPermiteVisitante}
                  checkbox
                />
              </AdminFormGrid>

              {permiteVisitante && (
                <AdminFormGrid>
                  <AdminField
                    label="Capacidade reservada para visitantes"
                    value={form.capacidadeVisitante}
                    onChange={(v) => setField('capacidadeVisitante', v)}
                    keyboardType="number-pad"
                  />
                </AdminFormGrid>
              )}

              {possuiCadeiras && (
                <View style={{ paddingTop: 8, borderTopWidth: 1, borderColor: colors.border, gap: 10 }}>
                  <AdminFormGrid>
                    <AdminField
                      label="Modelo da cadeira"
                      value={form.modeloCadeira}
                      onChange={(v) => setField('modeloCadeira', v)}
                      required
                      placeholder="Ex.: Rebatível estofada"
                    />
                    <AdminField
                      label="Cor da cadeira"
                      value={form.corCadeira}
                      onChange={(v) => setField('corCadeira', v)}
                      placeholder="Ex.: Vermelha"
                    />
                    <AdminField
                      label="Largura (cm)"
                      value={form.larguraCadeiraCm}
                      onChange={(v) => setField('larguraCadeiraCm', v)}
                      keyboardType="number-pad"
                      required
                      placeholder="Ex.: 48"
                    />
                  </AdminFormGrid>
                  <AdminToggle
                    label="Possui encosto"
                    value={possuiEncosto}
                    onChange={setPossuiEncosto}
                    checkbox
                  />
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <AdminButton
                label={editing ? 'Salvar alterações do setor' : 'Cadastrar setor no estádio'}
                icon={editing ? Pencil : Plus}
                primary
                loading={busy}
                disabled={busy || !estadioId}
                onPress={() => void save()}
              />
              {editing && (
                <AdminButton label="Cancelar edição" disabled={busy} onPress={reset} />
              )}
            </View>
          </View>
        )}
      </Panel>

      {setores.length === 0 && (
        <Panel style={{ borderRadius: 14, padding: 24, alignItems: 'center', gap: 8 }}>
          <Armchair size={26} color={colors.subtle} />
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            Nenhum setor cadastrado neste estádio
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center' }}>
            Utilize o formulário acima para criar um setor ou edite o estádio para importar templates de setores.
          </Text>
        </Panel>
      )}

      {setores.map((setor) => (
        <Panel key={setor.id} style={{ borderRadius: 14, padding: 18, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <View style={{ flex: 1, minWidth: 200, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Armchair size={18} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>{setor.nome}</Text>
                <AdminBadge
                  label={`${setor.capacidadeFisica.toLocaleString('pt-BR')} lugares`}
                  tone="success"
                />
                <AdminBadge
                  label={setor.numerado ? `${setor._count.assentos} assentos numerados` : 'Lugar livre'}
                  tone={setor.numerado ? 'warning' : 'neutral'}
                />
              </View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {setor.tipo || 'Setor'}
                {setor.bloco ? ` · Bloco ${setor.bloco}` : ''}
                {setor.nivel ? ` · Nível ${setor.nivel}` : ''}
                {` · ${labelSolar(setor.orientacaoSolar)}`}
                {setor.portoesAcesso.length > 0 ? ` · Portões: ${setor.portoesAcesso.join(', ')}` : ''}
              </Text>
              {setor.possuiCadeiras && (
                <Text style={{ color: colors.subtle, fontSize: 11 }}>
                  Cadeiras: {setor.modeloCadeira}
                  {setor.corCadeira ? ` (${setor.corCadeira})` : ''} · {setor.larguraCadeiraCm} cm
                  {setor.possuiEncosto ? ' · com encosto' : ' · sem encosto'}
                </Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {setor.numerado && (
                <AdminButton
                  label={activeSeatsSectorId === setor.id ? 'Fechar mapa de assentos' : `Assentos (${setor._count.assentos})`}
                  icon={Armchair}
                  size="small"
                  primary={activeSeatsSectorId === setor.id}
                  onPress={() => toggleSeatsPanel(setor)}
                />
              )}
              <AdminButton
                label="Editar"
                icon={Pencil}
                size="small"
                disabled={busy}
                onPress={() => edit(setor)}
              />
              {confirmDeleteId === setor.id ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AdminButton
                    label="Confirmar exclusão"
                    variant="danger"
                    size="small"
                    loading={busy}
                    onPress={() => void removeSector(setor.id)}
                  />
                  <AdminButton
                    label="Cancelar"
                    size="small"
                    disabled={busy}
                    onPress={() => setConfirmDeleteId(null)}
                  />
                </View>
              ) : (
                <AdminButton
                  label="Excluir"
                  icon={Trash2}
                  variant="danger"
                  size="small"
                  disabled={busy}
                  onPress={() => setConfirmDeleteId(setor.id)}
                />
              )}
            </View>
          </View>

          {setor.numerado && activeSeatsSectorId === setor.id && (
            <View
              style={{
                borderTopWidth: 1,
                borderColor: colors.border,
                paddingTop: 14,
                gap: 14,
              }}
            >
              <View
                style={{
                  backgroundColor: colors.soft,
                  padding: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 12,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                  Gerador de Fileiras e Cadeiras — {setor.nome}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Capacidade física do setor: {setor.capacidadeFisica.toLocaleString('pt-BR')} lugares · Assentos já gerados:{' '}
                  {setor._count.assentos.toLocaleString('pt-BR')} · Restantes:{' '}
                  {Math.max(0, setor.capacidadeFisica - setor._count.assentos).toLocaleString('pt-BR')}
                </Text>

                <AdminFormGrid>
                  <AdminField
                    label="Bloco (opcional)"
                    value={geracao.bloco}
                    onChange={(v) => setGeracao({ ...geracao, bloco: v })}
                    placeholder="Ex.: A"
                  />
                  <AdminField
                    label="Fileira inicial (Letra)"
                    value={geracao.fileira}
                    onChange={(v) => setGeracao({ ...geracao, fileira: v.toUpperCase() })}
                    placeholder="A"
                    maxLength={4}
                  />
                  <AdminField
                    label="Qtd. de fileiras"
                    value={geracao.fileiras}
                    onChange={(v) => setGeracao({ ...geracao, fileiras: v })}
                    keyboardType="number-pad"
                  />
                  <AdminField
                    label="Nº cadeira inicial"
                    value={geracao.inicial}
                    onChange={(v) => setGeracao({ ...geracao, inicial: v })}
                    keyboardType="number-pad"
                  />
                  <AdminField
                    label="Cadeiras por fileira"
                    value={geracao.porFileira}
                    onChange={(v) => setGeracao({ ...geracao, porFileira: v })}
                    keyboardType="number-pad"
                  />
                </AdminFormGrid>

                <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                  <AdminToggle
                    label="Assentos acessíveis (PCD)"
                    value={geracao.acessivel}
                    onChange={(v) => setGeracao({ ...geracao, acessivel: v })}
                    checkbox
                  />
                  <AdminToggle
                    label="Reservados para visitante"
                    value={geracao.reservadoVisitante}
                    onChange={(v) => setGeracao({ ...geracao, reservadoVisitante: v })}
                    checkbox
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <AdminButton
                    label={`Gerar ${
                      Number(geracao.fileiras || 0) * Number(geracao.porFileira || 0) || 0
                    } assentos`}
                    icon={Plus}
                    primary
                    size="small"
                    loading={busy}
                    disabled={busy}
                    onPress={() => void generate(setor.id)}
                  />

                  {assentos.length > 0 && (
                    confirmClearSeatsId === setor.id ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '600' }}>
                          Apagar todos os {assentos.length} assentos?
                        </Text>
                        <AdminButton
                          label="Sim, limpar tudo"
                          variant="danger"
                          size="small"
                          loading={busy}
                          onPress={() => void clearSeats(setor.id)}
                        />
                        <AdminButton
                          label="Cancelar"
                          size="small"
                          onPress={() => setConfirmClearSeatsId(null)}
                        />
                      </View>
                    ) : (
                      <AdminButton
                        label="Limpar todos os assentos"
                        icon={Trash2}
                        variant="danger"
                        size="small"
                        disabled={busy}
                        onPress={() => setConfirmClearSeatsId(setor.id)}
                      />
                    )
                  )}
                </View>
              </View>

              <View style={{ gap: 10 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                  Mapa de Cadeiras Cadastradas ({assentos.length})
                </Text>
                {loadingSeats && <Text style={{ color: colors.muted, fontSize: 12 }}>Carregando assentos…</Text>}
                {!loadingSeats && groupedSeats.length === 0 && (
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    Nenhuma cadeira gerada neste setor ainda. Use o gerador acima para criar as fileiras.
                  </Text>
                )}
                {groupedSeats.map(([groupLabel, list]) => (
                  <View
                    key={groupLabel}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      gap: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{groupLabel}</Text>
                      <Text style={{ color: colors.subtle, fontSize: 11 }}>{list.length} cadeiras (clique no × para excluir um lugar)</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {list.map((seat) => (
                        <View
                          key={seat.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: seat.acessivel ? colors.primarySoft : colors.soft,
                            borderWidth: 1,
                            borderColor: seat.acessivel ? colors.primary : colors.border,
                          }}
                        >
                          <Text style={{ color: colors.text, fontSize: 11, fontWeight: '600' }}>
                            {seat.fileira}-{seat.numero}
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Excluir assento ${seat.fileira}-${seat.numero}`}
                            disabled={busy}
                            onPress={() => void removeSeat(seat.id, setor.id)}
                          >
                            <X size={12} color={colors.danger} />
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Panel>
      ))}
    </View>
  );
}
