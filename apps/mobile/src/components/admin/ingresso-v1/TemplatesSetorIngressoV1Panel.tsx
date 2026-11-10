import React, { useEffect, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Pencil, Plus, Settings, Trash2 } from 'lucide-react-native';
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
  type TemplateNivelRegraV1,
  type TemplateSetorIngressoV1,
  type TipoTorcidaSetorV1,
  type TipoValidacaoSetorV1,
} from '../../../services/ingresso-v1';
import { messageOf } from '../../../utils/format';

type Props = {
  token: string;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onNotice: (value: string) => void;
  onError: (value: string) => void;
  createOpen?: boolean;
  onConsumeCreate?: () => void;
};

const TIPO_TORCIDA_OPTIONS: { value: TipoTorcidaSetorV1; label: string }[] = [
  { value: 'MANDANTE', label: 'Torcida Mandante' },
  { value: 'VISITANTE', label: 'Torcida Visitante' },
  { value: 'MISTA', label: 'Torcida Mista' },
];

const TIPO_VALIDACAO_OPTIONS: { value: TipoValidacaoSetorV1; label: string }[] = [
  { value: 'QR_CODE_ESTATICO', label: 'QR Code Estático' },
  { value: 'QR_CODE_DINAMICO', label: 'QR Code Dinâmico' },
  { value: 'BIOMETRIA_FACIAL', label: 'Biometria Facial' },
  { value: 'RFID_CARTEIRINHA', label: 'RFID / Carteirinha' },
];

const PRESET_COLORS = [
  '#002244',
  '#E65100',
  '#1B5E20',
  '#B71C1C',
  '#FFD600',
  '#4A148C',
  '#DC2626',
  '#2563EB',
  '#16A34A',
  '#0F172A',
];

const isValidHex = (val: string) => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(val.trim());

function contarFileiras(deRaw: string, ateRaw: string): number {
  const de = (deRaw || '').trim().toUpperCase();
  const ate = (ateRaw || '').trim().toUpperCase();
  if (!de || !ate) return 0;

  if (/^\d+$/.test(de) && /^\d+$/.test(ate)) {
    const start = Number(de);
    const end = Number(ate);
    return end >= start ? end - start + 1 : 0;
  }

  if (
    /^[A-Z]+$/.test(de) &&
    /^[A-Z]+$/.test(ate) &&
    de.length === ate.length &&
    de === de[0]!.repeat(de.length) &&
    ate === ate[0]!.repeat(ate.length)
  ) {
    const start = de.charCodeAt(0);
    const end = ate.charCodeAt(0);
    return end >= start ? end - start + 1 : 0;
  }

  if (/^[A-Z]+$/.test(de) && /^[A-Z]+$/.test(ate)) {
    const toIndex = (s: string) =>
      s.split('').reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
    const start = toIndex(de);
    const end = toIndex(ate);
    return end >= start ? end - start + 1 : 0;
  }

  return 0;
}

function calcularCapacidadePadraoBloco(
  fileiraInicio: string,
  fileiraFim: string,
  cadeirasPorFileira: number
): number {
  const fileiras = contarFileiras(fileiraInicio, fileiraFim);
  const cadeiras = Math.max(0, Number(cadeirasPorFileira) || 0);
  return fileiras * cadeiras;
}

function calcularTotalNivelRegra(regra: TemplateNivelRegraV1): number {
  const inicio = Math.min(Number(regra.blocoInicio) || 0, Number(regra.blocoFim) || 0);
  const fim = Math.max(Number(regra.blocoInicio) || 0, Number(regra.blocoFim) || 0);
  const fileiras = contarFileiras(regra.fileiraInicio, regra.fileiraFim);
  if (!fileiras || inicio < 1 || fim < inicio) return 0;

  const excecoesMap = new Map<number, number>();
  for (const ex of regra.excecoes || []) {
    if (ex.numeroBloco >= inicio && ex.numeroBloco <= fim) {
      excecoesMap.set(Number(ex.numeroBloco), Math.max(0, Number(ex.cadeirasPorFileira) || 0));
    }
  }

  let total = 0;
  for (let numBloco = inicio; numBloco <= fim; numBloco += 1) {
    const cadeiras = excecoesMap.has(numBloco)
      ? excecoesMap.get(numBloco)!
      : Math.max(0, Number(regra.cadeirasPorFileira) || 0);
    total += fileiras * cadeiras;
  }
  return total;
}

function extrairRegrasDoTemplate(row: TemplateSetorIngressoV1): TemplateNivelRegraV1[] {
  if (Array.isArray(row.nivelRegras) && row.nivelRegras.length > 0) {
    return row.nivelRegras.map((r) => ({
      id: r.id,
      nomeNivel: r.nomeNivel,
      blocoInicio: r.blocoInicio,
      blocoFim: r.blocoFim,
      fileiraInicio: r.fileiraInicio,
      fileiraFim: r.fileiraFim,
      cadeirasPorFileira: r.cadeirasPorFileira,
      excecoes: (r.excecoes || []).map((ex) => ({
        id: ex.id,
        numeroBloco: ex.numeroBloco,
        cadeirasPorFileira: ex.cadeirasPorFileira,
      })),
    }));
  }

  const jsonRegras = row.configuracaoMalhaAssentos?.niveis_regras;
  if (Array.isArray(jsonRegras) && jsonRegras.length > 0) {
    return jsonRegras.map((r) => ({
      nomeNivel: r.nome_nivel,
      blocoInicio: r.gerador_em_massa.bloco_inicio,
      blocoFim: r.gerador_em_massa.bloco_fim,
      fileiraInicio: r.gerador_em_massa.de_fileira,
      fileiraFim: r.gerador_em_massa.ate_fileira,
      cadeirasPorFileira: r.gerador_em_massa.cadeiras_por_fileira,
      excecoes: (r.excecoes || []).map((ex) => ({
        numeroBloco: ex.numero_bloco,
        cadeirasPorFileira: ex.cadeiras_por_fileira,
      })),
    }));
  }

  const legacyNiveis = row.configuracaoMalhaAssentos?.niveis_disponiveis;
  if (Array.isArray(legacyNiveis) && legacyNiveis.length > 0) {
    return legacyNiveis.map((n, idx) => {
      const nums = (n.blocos || [])
        .map((b) => {
          const m = /(\d+)/.exec(b.identificador_bloco || '');
          return m ? Number(m[1]) : null;
        })
        .filter((v): v is number => v !== null);
      const firstBloco = n.blocos?.[0];
      const inicio = nums.length > 0 ? Math.min(...nums) : (idx + 1) * 100 + 1;
      const fim = nums.length > 0 ? Math.max(...nums) : inicio;
      return {
        nomeNivel: n.nome_nivel || `Nível ${idx + 1}`,
        blocoInicio: inicio,
        blocoFim: fim,
        fileiraInicio: firstBloco?.regra_fileiras?.de_fileira || 'A',
        fileiraFim: firstBloco?.regra_fileiras?.ate_fileira || 'Z',
        cadeirasPorFileira: firstBloco?.regra_fileiras?.cadeiras_por_fileira || 30,
        excecoes: [],
      };
    });
  }

  return defaultNivelRegras();
}

type FormState = {
  slug: string;
  nome: string;
  corSetorHex: string;
  tipoTorcida: TipoTorcidaSetorV1;
  instrucaoAcomodacao: string;
  tipoValidacao: TipoValidacaoSetorV1;
  avisosObrigatoriosSetor: string;
  capacidadeFisica: string;
  capacidadeVendaPadrao: string;
};

const defaultNivelRegras = (): TemplateNivelRegraV1[] => [
  {
    nomeNivel: 'Nível 1 - Inferior',
    blocoInicio: 101,
    blocoFim: 110,
    fileiraInicio: 'A',
    fileiraFim: 'Z',
    cadeirasPorFileira: 30,
    excecoes: [],
  },
];

const initialForm: FormState = {
  slug: '',
  nome: '',
  corSetorHex: '#002244',
  tipoTorcida: 'MANDANTE',
  instrucaoAcomodacao: '',
  tipoValidacao: 'QR_CODE_ESTATICO',
  avisosObrigatoriosSetor: '',
  capacidadeFisica: '',
  capacidadeVendaPadrao: '',
};

export function TemplatesSetorIngressoV1Panel({
  token,
  busy,
  onBusy,
  onNotice,
  onError,
  createOpen = false,
  onConsumeCreate,
}: Props) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<TemplateSetorIngressoV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editing, setEditing] = useState<TemplateSetorIngressoV1 | null>(null);
  const [numerado, setNumerado] = useState(false);
  const [exigeNivelAnel, setExigeNivelAnel] = useState(true);
  const [exigeBlocoModulo, setExigeBlocoModulo] = useState(true);
  const [nivelRegras, setNivelRegras] = useState<TemplateNivelRegraV1[]>(defaultNivelRegras);
  const [excecoesAbertas, setExcecoesAbertas] = useState<Record<number, boolean>>({});
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<TemplateSetorIngressoV1 | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function load() {
    setLoading(true);
    try {
      setRows(await ingressoV1Api.templatesSetor(token));
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
    setForm(initialForm);
    setEditing(null);
    setNumerado(false);
    setExigeNivelAnel(true);
    setExigeBlocoModulo(true);
    setNivelRegras(defaultNivelRegras());
    setExcecoesAbertas({});
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(row: TemplateSetorIngressoV1) {
    setEditing(row);
    setFormError('');
    setForm({
      slug: row.slug || '',
      nome: row.nome,
      corSetorHex: (row.corSetorHex || '#002244').toUpperCase(),
      tipoTorcida: row.tipoTorcida || 'MANDANTE',
      instrucaoAcomodacao: row.instrucaoAcomodacao || '',
      tipoValidacao: row.tipoValidacao || 'QR_CODE_ESTATICO',
      avisosObrigatoriosSetor: row.avisosObrigatoriosSetor || '',
      capacidadeFisica: String(row.capacidadeFisica),
      capacidadeVendaPadrao: row.capacidadeVendaPadrao ? String(row.capacidadeVendaPadrao) : String(row.capacidadeFisica),
    });
    setNumerado(row.numerado);
    setExigeNivelAnel(row.exigeNivelAnel ?? true);
    setExigeBlocoModulo(row.exigeBlocoModulo ?? true);
    const extraidas = extrairRegrasDoTemplate(row);
    setNivelRegras(extraidas);
    const abertasInit: Record<number, boolean> = {};
    extraidas.forEach((r, idx) => {
      if (r.excecoes && r.excecoes.length > 0) abertasInit[idx] = true;
    });
    setExcecoesAbertas(abertasInit);
    setModalOpen(true);
  }

  function addNivelRegra() {
    setNivelRegras((curr) => {
      const nextNum = curr.length + 1;
      const baseBloco = nextNum * 100 + 1;
      return [
        ...curr,
        {
          nomeNivel: `Nível ${nextNum} - ${nextNum === 2 ? 'Superior' : 'Anel ' + nextNum}`,
          blocoInicio: baseBloco,
          blocoFim: baseBloco + 9,
          fileiraInicio: nextNum === 2 ? 'AA' : 'A',
          fileiraFim: nextNum === 2 ? 'ZZ' : 'Z',
          cadeirasPorFileira: 30,
          excecoes: [],
        },
      ];
    });
  }

  function removeNivelRegra(nivelIdx: number) {
    setNivelRegras((curr) => curr.filter((_, idx) => idx !== nivelIdx));
  }

  function updateNivelRegra(
    nivelIdx: number,
    patch: Partial<Omit<TemplateNivelRegraV1, 'excecoes'>>
  ) {
    setNivelRegras((curr) =>
      curr.map((regra, idx) => (idx === nivelIdx ? { ...regra, ...patch } : regra))
    );
  }

  function toggleExcecoes(nivelIdx: number) {
    setExcecoesAbertas((curr) => ({ ...curr, [nivelIdx]: !curr[nivelIdx] }));
  }

  function addExcecaoBloco(nivelIdx: number) {
    setNivelRegras((curr) =>
      curr.map((regra, idx) => {
        if (idx !== nivelIdx) return regra;
        const usados = new Set((regra.excecoes || []).map((e) => e.numeroBloco));
        let sugerido = regra.blocoInicio;
        for (let b = regra.blocoInicio; b <= regra.blocoFim; b += 1) {
          if (!usados.has(b)) {
            sugerido = b;
            break;
          }
        }
        return {
          ...regra,
          excecoes: [
            ...(regra.excecoes || []),
            {
              numeroBloco: sugerido,
              cadeirasPorFileira: Math.max(1, Math.floor(regra.cadeirasPorFileira / 2)),
            },
          ],
        };
      })
    );
    setExcecoesAbertas((curr) => ({ ...curr, [nivelIdx]: true }));
  }

  function updateExcecaoBloco(
    nivelIdx: number,
    excecaoIdx: number,
    patch: { numeroBloco?: number; cadeirasPorFileira?: number }
  ) {
    setNivelRegras((curr) =>
      curr.map((regra, idx) => {
        if (idx !== nivelIdx) return regra;
        return {
          ...regra,
          excecoes: (regra.excecoes || []).map((ex, eIdx) =>
            eIdx === excecaoIdx ? { ...ex, ...patch } : ex
          ),
        };
      })
    );
  }

  function removeExcecaoBloco(nivelIdx: number, excecaoIdx: number) {
    setNivelRegras((curr) =>
      curr.map((regra, idx) => {
        if (idx !== nivelIdx) return regra;
        return {
          ...regra,
          excecoes: (regra.excecoes || []).filter((_, eIdx) => eIdx !== excecaoIdx),
        };
      })
    );
  }

  const somaCapacidadeCalculada = nivelRegras.reduce(
    (acc, r) => acc + calcularTotalNivelRegra(r),
    0
  );

  async function save() {
    const capacidadeVendaPadrao = numerado
      ? somaCapacidadeCalculada
      : Number(form.capacidadeVendaPadrao || form.capacidadeFisica);
    const capacidadeFisica = numerado
      ? somaCapacidadeCalculada
      : form.capacidadeFisica.trim()
        ? Number(form.capacidadeFisica)
        : capacidadeVendaPadrao;

    if (!form.nome.trim()) {
      setFormError('Informe a descrição do modelo de setor.');
      return;
    }
    if (!isValidHex(form.corSetorHex)) {
      setFormError('Informe uma cor hexadecimal válida (ex.: #002244).');
      return;
    }
    if (!Number.isInteger(capacidadeVendaPadrao) || capacidadeVendaPadrao < 1) {
      setFormError('Informe uma regra de blocos/fileiras válida com capacidade maior que zero.');
      return;
    }
    if (!Number.isInteger(capacidadeFisica) || capacidadeFisica < capacidadeVendaPadrao) {
      setFormError('A capacidade de venda deve ser menor ou igual à capacidade máxima do laudo.');
      return;
    }
    if (numerado && nivelRegras.length === 0) {
      setFormError('Adicione pelo menos um nível com intervalo de blocos.');
      return;
    }

    const firstRegra = nivelRegras[0];

    const body = {
      slug: form.slug.trim() || null,
      nome: form.nome.trim(),
      corSetorHex: form.corSetorHex.trim().toUpperCase(),
      tipoTorcida: form.tipoTorcida,
      numerado,
      exigeNivelAnel: numerado ? exigeNivelAnel : false,
      exigeBlocoModulo: numerado ? exigeBlocoModulo : false,
      nivel: numerado && firstRegra ? firstRegra.nomeNivel : null,
      bloco:
        numerado && firstRegra
          ? `${firstRegra.blocoInicio} ao ${firstRegra.blocoFim}`
          : null,
      fileiraInicialPadrao: numerado && firstRegra ? firstRegra.fileiraInicio : null,
      quantidadeFileirasPadrao:
        numerado && firstRegra
          ? contarFileiras(firstRegra.fileiraInicio, firstRegra.fileiraFim)
          : null,
      numeroInicialPadrao: numerado ? 1 : null,
      assentosPorFileiraPadrao: numerado && firstRegra ? firstRegra.cadeirasPorFileira : null,
      nivelRegras: numerado
        ? nivelRegras.map((r) => ({
            nome_nivel: r.nomeNivel.trim(),
            gerador_em_massa: {
              bloco_inicio: Math.min(r.blocoInicio, r.blocoFim),
              bloco_fim: Math.max(r.blocoInicio, r.blocoFim),
              de_fileira: r.fileiraInicio.trim().toUpperCase(),
              ate_fileira: r.fileiraFim.trim().toUpperCase(),
              cadeiras_por_fileira: r.cadeirasPorFileira,
            },
            excecoes: (r.excecoes || []).map((ex) => ({
              numero_bloco: ex.numeroBloco,
              cadeiras_por_fileira: ex.cadeirasPorFileira,
            })),
          }))
        : [],
      configuracaoMalhaAssentos: numerado
        ? {
            niveis_regras: nivelRegras.map((r) => ({
              nome_nivel: r.nomeNivel.trim(),
              gerador_em_massa: {
                bloco_inicio: Math.min(r.blocoInicio, r.blocoFim),
                bloco_fim: Math.max(r.blocoInicio, r.blocoFim),
                de_fileira: r.fileiraInicio.trim().toUpperCase(),
                ate_fileira: r.fileiraFim.trim().toUpperCase(),
                cadeiras_por_fileira: r.cadeirasPorFileira,
              },
              excecoes: (r.excecoes || []).map((ex) => ({
                numero_bloco: ex.numeroBloco,
                cadeiras_por_fileira: ex.cadeirasPorFileira,
              })),
            })),
          }
        : null,
      instrucaoAcomodacao: numerado && form.instrucaoAcomodacao.trim() ? form.instrucaoAcomodacao.trim() : null,
      tipoValidacao: form.tipoValidacao,
      avisosObrigatoriosSetor: form.avisosObrigatoriosSetor.trim() || null,
      capacidadeFisica,
      capacidadeVendaPadrao,
      permiteVisitante: form.tipoTorcida === 'VISITANTE',
    };

    onBusy(true);
    setFormError('');
    try {
      if (editing) {
        await ingressoV1Api.atualizarTemplateSetor(token, { ...body, id: editing.id });
      } else {
        await ingressoV1Api.criarTemplateSetor(token, body);
      }
      setModalOpen(false);
      await load();
      onNotice(editing ? 'Template atualizado.' : 'Template criado.');
    } catch (error) {
      setFormError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  async function remove(row: TemplateSetorIngressoV1) {
    onBusy(true);
    onError('');
    try {
      await ingressoV1Api.excluirTemplateSetor(token, row.id);
      setConfirmDelete(null);
      await load();
      onNotice('Template excluído.');
    } catch (error) {
      onError(messageOf(error));
    } finally {
      onBusy(false);
    }
  }

  const labelValidacao = (v: TipoValidacaoSetorV1) =>
    TIPO_VALIDACAO_OPTIONS.find((item) => item.value === v)?.label || v;

  const previewColor = isValidHex(form.corSetorHex) ? form.corSetorHex.trim().toUpperCase() : '#002244';

  return (
    <View style={{ gap: 18 }}>
      <AdminTable
        loading={loading}
        minWidth={0}
        empty="Nenhum template de setor cadastrado."
        columns={[
          { label: 'Template de setor', flex: 2 },
          { label: 'Regras do setor', flex: 1.2 },
          { label: 'Capacidade', width: 100 },
          { label: 'Ações', width: 84 },
        ]}
        rows={rows.map((row) => {
          const hex = (row.corSetorHex || '#002244').toUpperCase();
          const regras = row.numerado ? extrairRegrasDoTemplate(row) : [];
          const resumoNiveis = regras
            .map((r) => `${r.nomeNivel}: Blocos ${r.blocoInicio} ao ${r.blocoFim} (${r.fileiraInicio}–${r.fileiraFim})`)
            .join(' · ');

          return {
            id: row.id,
            cells: [
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Editar ${row.nome}`}
                disabled={busy}
                onPress={() => openEdit(row)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    backgroundColor: hex,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                    {row.nome}
                  </Text>
                  <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11 }}>
                    {hex}
                    {resumoNiveis
                      ? ` · ${resumoNiveis}`
                      : row.avisosObrigatoriosSetor
                        ? ` · ${row.avisosObrigatoriosSetor}`
                        : ''}
                  </Text>
                </View>
              </Pressable>,
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                <AdminBadge
                  label={
                    row.tipoTorcida === 'VISITANTE'
                      ? 'Visitante'
                      : row.tipoTorcida === 'MISTA'
                        ? 'Mista'
                        : 'Mandante'
                  }
                  tone={row.tipoTorcida === 'VISITANTE' ? 'warning' : 'neutral'}
                />
                <AdminBadge
                  label={row.numerado ? 'Marcado' : 'Livre'}
                  tone={row.numerado ? 'warning' : 'neutral'}
                />
                <AdminBadge label={labelValidacao(row.tipoValidacao)} tone="neutral" />
              </View>,
              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                {(row.capacidadeVendaPadrao ?? row.capacidadeFisica).toLocaleString('pt-BR')}
              </Text>,
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
          };
        })}
      />

      {modalOpen && (
        <Sheet
          visible
          title={editing ? 'Editar template' : 'Criar template'}
          onClose={busy ? () => {} : () => setModalOpen(false)}
        >
          <AdminSection title="Identificação do modelo (genérico)">
            <AdminFormGrid>
              <AdminField
                label="Perfil / Tipo do setor"
                value={form.nome}
                onChange={(v) => setField('nome', v)}
                placeholder="Ex.: Arena FIFA - Cadeira Marcada (Mandante)"
                required
                editable={!busy}
              />
              <AdminField
                label="Slug do template (opcional)"
                value={form.slug}
                onChange={(v) => setField('slug', v)}
                placeholder="Ex.: arena-fifa-cadeira-marcada-mandante"
                autoCapitalize="none"
                editable={!busy}
              />
              <AdminSelect
                label="Tipo de torcida"
                value={form.tipoTorcida}
                options={TIPO_TORCIDA_OPTIONS}
                onChange={(v) => setField('tipoTorcida', v as TipoTorcidaSetorV1)}
                searchable={false}
                disabled={busy}
              />
            </AdminFormGrid>

            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <AdminField
                    label="Cor do setor (Hex)"
                    value={form.corSetorHex}
                    onChange={(v) => setField('corSetorHex', v)}
                    placeholder="#002244"
                    maxLength={9}
                    required
                    editable={!busy}
                  />
                </View>
                <View
                  style={{
                    height: 44,
                    paddingHorizontal: 14,
                    borderRadius: 8,
                    backgroundColor: previewColor,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                    Cor ativa: {previewColor}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PRESET_COLORS.map((hex) => {
                  const selected = form.corSetorHex.trim().toUpperCase() === hex;
                  return (
                    <Pressable
                      key={hex}
                      accessibilityRole="button"
                      accessibilityLabel={`Selecionar cor ${hex}`}
                      onPress={() => setField('corSetorHex', hex)}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        backgroundColor: hex,
                        borderWidth: selected ? 3 : 1,
                        borderColor: selected ? colors.text : colors.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {selected && (
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: '#FFFFFF',
                          }}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </AdminSection>

          <AdminSection title="Assentos e malha de níveis / blocos">
            <AdminToggle
              label="Possui assento marcado"
              value={numerado}
              onChange={setNumerado}
              disabled={busy}
            />
            {!numerado ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Assento Livre por Ordem de Chegada.
              </Text>
            ) : (
              <View style={{ gap: 12 }}>
                <AdminFormGrid>
                  <AdminToggle
                    checkbox
                    label="Exige Nível / Anel"
                    value={exigeNivelAnel}
                    onChange={setExigeNivelAnel}
                    disabled={busy}
                  />
                  <AdminToggle
                    checkbox
                    label="Exige Bloco / Módulo"
                    value={exigeBlocoModulo}
                    onChange={setExigeBlocoModulo}
                    disabled={busy}
                  />
                </AdminFormGrid>

                <AdminField
                  label="Instrução de acomodação"
                  value={form.instrucaoAcomodacao}
                  onChange={(v) => setField('instrucaoAcomodacao', v)}
                  placeholder="Ex.: Obrigatório respeitar o Bloco, Fileira e Número do assento marcados."
                  editable={!busy}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                    Cadastro por Intervalo (Range) — Níveis ({nivelRegras.length})
                  </Text>
                  <AdminButton
                    label="Adicionar nível"
                    icon={Plus}
                    size="small"
                    disabled={busy}
                    onPress={addNivelRegra}
                  />
                </View>

                {nivelRegras.map((regra, nivelIdx) => {
                  const inicio = Math.min(Number(regra.blocoInicio) || 0, Number(regra.blocoFim) || 0);
                  const fim = Math.max(Number(regra.blocoInicio) || 0, Number(regra.blocoFim) || 0);
                  const totalBlocos = inicio >= 1 && fim >= inicio ? fim - inicio + 1 : 0;
                  const capPadraoBloco = calcularCapacidadePadraoBloco(
                    regra.fileiraInicio,
                    regra.fileiraFim,
                    regra.cadeirasPorFileira
                  );
                  const totalNivel = calcularTotalNivelRegra(regra);
                  const excecoesVisiveis = Boolean(excecoesAbertas[nivelIdx]);

                  return (
                    <View
                      key={nivelIdx}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        padding: 12,
                        backgroundColor: colors.soft,
                        gap: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                          <AdminField
                            label={`Nome do Nível #${nivelIdx + 1}`}
                            value={regra.nomeNivel}
                            onChange={(val) => updateNivelRegra(nivelIdx, { nomeNivel: val })}
                            placeholder="Ex.: Nível 1 - Inferior"
                            editable={!busy}
                          />
                        </View>
                        {nivelRegras.length > 1 && (
                          <AdminButton
                            label="Remover nível"
                            icon={Trash2}
                            iconOnly
                            variant="danger"
                            size="small"
                            disabled={busy}
                            onPress={() => removeNivelRegra(nivelIdx)}
                          />
                        )}
                      </View>

                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: 8,
                          padding: 10,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 95 }}>
                          <AdminField
                            label="Bloco inicial"
                            value={String(regra.blocoInicio || '')}
                            onChange={(val) =>
                              updateNivelRegra(nivelIdx, {
                                blocoInicio: Number(val.replace(/\D/g, '') || 0),
                              })
                            }
                            placeholder="101"
                            keyboardType="number-pad"
                            editable={!busy}
                          />
                        </View>
                        <View style={{ flex: 1, minWidth: 95 }}>
                          <AdminField
                            label="Bloco final"
                            value={String(regra.blocoFim || '')}
                            onChange={(val) =>
                              updateNivelRegra(nivelIdx, {
                                blocoFim: Number(val.replace(/\D/g, '') || 0),
                              })
                            }
                            placeholder="110"
                            keyboardType="number-pad"
                            editable={!busy}
                          />
                        </View>
                        <View style={{ width: 85 }}>
                          <AdminField
                            label="De fileira"
                            value={regra.fileiraInicio}
                            onChange={(val) =>
                              updateNivelRegra(nivelIdx, {
                                fileiraInicio: val.toUpperCase(),
                              })
                            }
                            placeholder="A"
                            editable={!busy}
                          />
                        </View>
                        <View style={{ width: 85 }}>
                          <AdminField
                            label="Até fileira"
                            value={regra.fileiraFim}
                            onChange={(val) =>
                              updateNivelRegra(nivelIdx, {
                                fileiraFim: val.toUpperCase(),
                              })
                            }
                            placeholder="Z"
                            editable={!busy}
                          />
                        </View>
                        <View style={{ width: 120 }}>
                          <AdminField
                            label="Cadeiras / fileira"
                            value={String(regra.cadeirasPorFileira || '')}
                            onChange={(val) =>
                              updateNivelRegra(nivelIdx, {
                                cadeirasPorFileira: Number(val.replace(/\D/g, '') || 0),
                              })
                            }
                            placeholder="30"
                            keyboardType="number-pad"
                            editable={!busy}
                          />
                        </View>
                      </View>

                      <View
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                          gap: 8,
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
                          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                            {regra.nomeNivel || `Nível ${nivelIdx + 1}`} (Resumo do Setor)
                          </Text>
                          <AdminButton
                            label={
                              regra.excecoes?.length
                                ? `Inserir Exceções de Blocos (${regra.excecoes.length})`
                                : 'Inserir Exceções de Blocos'
                            }
                            icon={Settings}
                            size="small"
                            variant="ghost"
                            disabled={busy}
                            onPress={() => toggleExcecoes(nivelIdx)}
                          />
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          <AdminBadge
                            label={`Regra de Blocos: ${inicio} ao ${fim} (Total: ${totalBlocos} ${totalBlocos === 1 ? 'bloco' : 'blocos'})`}
                            tone="neutral"
                          />
                          <AdminBadge
                            label={`Capacidade Padrão por Bloco: ${capPadraoBloco.toLocaleString('pt-BR')} assentos`}
                            tone="neutral"
                          />
                          <AdminBadge
                            label={`Layout das Fileiras: ${regra.fileiraInicio || '?'} até ${regra.fileiraFim || '?'} (${regra.cadeirasPorFileira || 0} cadeiras por fileira)`}
                            tone="neutral"
                          />
                          <AdminBadge
                            label={`Total do Nível: ${totalNivel.toLocaleString('pt-BR')} assentos gerados`}
                            tone="warning"
                          />
                        </View>

                        {excecoesVisiveis && (
                          <View
                            style={{
                              marginTop: 6,
                              paddingTop: 10,
                              borderTopWidth: 1,
                              borderTopColor: colors.border,
                              gap: 8,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <Text style={{ color: colors.muted, fontSize: 12 }}>
                                Exceções de blocos (ex.: escada de emergência ou ponto cego no intervalo {inicio}–{fim})
                              </Text>
                              <AdminButton
                                label="Adicionar exceção"
                                icon={Plus}
                                size="small"
                                disabled={busy}
                                onPress={() => addExcecaoBloco(nivelIdx)}
                              />
                            </View>

                            {(regra.excecoes || []).length === 0 ? (
                              <Text style={{ color: colors.muted, fontSize: 11 }}>
                                Nenhuma exceção cadastrada. Todos os {totalBlocos} blocos seguem {regra.cadeirasPorFileira} cadeiras/fileira.
                              </Text>
                            ) : (
                              (regra.excecoes || []).map((ex, exIdx) => (
                                <View
                                  key={exIdx}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'flex-end',
                                    gap: 8,
                                    flexWrap: 'wrap',
                                  }}
                                >
                                  <View style={{ width: 130 }}>
                                    <AdminField
                                      label="Nº do Bloco"
                                      value={String(ex.numeroBloco || '')}
                                      onChange={(val) =>
                                        updateExcecaoBloco(nivelIdx, exIdx, {
                                          numeroBloco: Number(val.replace(/\D/g, '') || 0),
                                        })
                                      }
                                      placeholder={String(inicio)}
                                      keyboardType="number-pad"
                                      editable={!busy}
                                    />
                                  </View>
                                  <View style={{ width: 160 }}>
                                    <AdminField
                                      label="Cadeiras / fileira (Exceção)"
                                      value={String(ex.cadeirasPorFileira ?? '')}
                                      onChange={(val) =>
                                        updateExcecaoBloco(nivelIdx, exIdx, {
                                          cadeirasPorFileira: Number(val.replace(/\D/g, '') || 0),
                                        })
                                      }
                                      placeholder="15"
                                      keyboardType="number-pad"
                                      editable={!busy}
                                    />
                                  </View>
                                  <View style={{ width: 150 }}>
                                    <AdminField
                                      label="Capacidade do bloco"
                                      value={String(
                                        calcularCapacidadePadraoBloco(
                                          regra.fileiraInicio,
                                          regra.fileiraFim,
                                          ex.cadeirasPorFileira
                                        )
                                      )}
                                      onChange={() => {}}
                                      editable={false}
                                    />
                                  </View>
                                  <AdminButton
                                    label="Remover exceção"
                                    icon={Trash2}
                                    iconOnly
                                    variant="ghost"
                                    size="small"
                                    disabled={busy}
                                    onPress={() => removeExcecaoBloco(nivelIdx, exIdx)}
                                  />
                                </View>
                              ))
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </AdminSection>

          <AdminSection title="Validação e segurança">
            <AdminSelect
              label="Tipo de validação"
              value={form.tipoValidacao}
              options={TIPO_VALIDACAO_OPTIONS}
              onChange={(v) => setField('tipoValidacao', v as TipoValidacaoSetorV1)}
              searchable={false}
              disabled={busy}
            />
            <AdminField
              label="Avisos obrigatórios do setor"
              value={form.avisosObrigatoriosSetor}
              onChange={(v) => setField('avisosObrigatoriosSetor', v)}
              multiline
              placeholder="Ex.: Proibido o uso de camisas do time mandante neste setor."
              editable={!busy}
            />
          </AdminSection>

          <AdminSection title="Capacidade padrão">
            {numerado ? (
              <AdminField
                label="Capacidade total calculada dos blocos"
                value={String(somaCapacidadeCalculada)}
                onChange={() => {}}
                editable={false}
              />
            ) : (
              <AdminFormGrid>
                <AdminField
                  label="Capacidade de venda no evento"
                  value={form.capacidadeVendaPadrao}
                  onChange={(v) => setField('capacidadeVendaPadrao', v)}
                  keyboardType="number-pad"
                  required
                  editable={!busy}
                />
                <AdminField
                  label="Capacidade máxima do laudo (opcional)"
                  value={form.capacidadeFisica}
                  onChange={(v) => setField('capacidadeFisica', v)}
                  keyboardType="number-pad"
                  placeholder={form.capacidadeVendaPadrao || 'Igual à venda'}
                  editable={!busy}
                />
              </AdminFormGrid>
            )}
          </AdminSection>

          {!!formError && <AdminNotice tone="error">{formError}</AdminNotice>}
          <Button label="Salvar template" loading={busy} onPress={() => void save()} />
        </Sheet>
      )}

      {confirmDelete && (
        <Sheet
          visible
          title="Excluir template"
          onClose={busy ? () => {} : () => setConfirmDelete(null)}
        >
          <Text style={{ color: colors.text }}>Deseja excluir o template "{confirmDelete.nome}"?</Text>
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
