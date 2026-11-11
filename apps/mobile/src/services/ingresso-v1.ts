import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { request } from './api';

export type TipoTorcidaSetorV1 = 'MANDANTE' | 'VISITANTE' | 'MISTA';
export type TipoValidacaoSetorV1 =
  | 'QR_CODE_ESTATICO'
  | 'QR_CODE_DINAMICO'
  | 'BIOMETRIA_FACIAL'
  | 'RFID_CARTEIRINHA';

export interface MalhaRegraFileirasV1 {
  de_fileira: string;
  ate_fileira: string;
  cadeiras_por_fileira: number;
}

export interface MalhaBlocoV1 {
  identificador_bloco: string;
  capacidade_bloco: number;
  regra_fileiras: MalhaRegraFileirasV1;
}

export interface MalhaNivelV1 {
  nome_nivel: string;
  blocos: MalhaBlocoV1[];
}

export interface TemplateBlocoExcecaoV1 {
  id?: string;
  numeroBloco: number;
  cadeirasPorFileira: number;
}

export interface TemplateNivelRegraV1 {
  id?: string;
  nomeNivel: string;
  blocoInicio: number;
  blocoFim: number;
  fileiraInicio: string;
  fileiraFim: string;
  cadeirasPorFileira: number;
  excecoes: TemplateBlocoExcecaoV1[];
}

export interface ConfiguracaoMalhaAssentosV1 {
  niveis_disponiveis?: MalhaNivelV1[];
  niveis_regras?: {
    nome_nivel: string;
    gerador_em_massa: {
      bloco_inicio: number;
      bloco_fim: number;
      de_fileira: string;
      ate_fileira: string;
      cadeiras_por_fileira: number;
    };
    excecoes?: { numero_bloco: number; cadeiras_por_fileira: number }[];
  }[];
}

export interface EstadioIngressoV1 {
  id: string;
  nome: string;
  nomePopular?: string | null;
  cidade: string;
  estado?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  localizacao?: string | null;
  cep?: string | null;
  cnpjProprietarioOrganizador?: string | null;
  descricao?: string | null;
  fotoUrl?: string | null;
  capacidadeMaxima: number;
  capacidadeOperacionalLaudo?: number | null;
  capacidadeSentada?: number | null;
  capacidadeArquibancada?: number | null;
  quantidadePortoes: number;
  possuiAcessibilidade: boolean;
  permiteSetorVisitante: boolean;
  mapaUrl?: string | null;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  setores?: {
    id: string;
    nome: string;
    corSetorHex?: string;
    tipoTorcida?: TipoTorcidaSetorV1;
    acessoExterno?: string | null;
    portaoEntrada?: string | null;
    localizacao?: string | null;
    fotoUrl?: string | null;
    bloco?: string | null;
    nivel?: string | null;
    templateId?: string | null;
    capacidadeFisica: number;
    capacidadeVendaPadrao?: number | null;
    tipo?: string | null;
    numerado: boolean;
    exigeBlocoModulo?: boolean;
    exigeNivelAnel?: boolean;
    orientacaoSolar: 'SOL' | 'SOMBRA' | 'PARCIAL';
    tipoValidacao?: TipoValidacaoSetorV1;
    instrucaoAcomodacao?: string | null;
    avisosObrigatoriosSetor?: string | null;
    configuracaoMalhaAssentos?: ConfiguracaoMalhaAssentosV1 | null;
  }[];
  _count: { setores: number; templatesVenda: number; partidas: number };
}

export interface SetorEstadioConfigInput {
  id?: string;
  templateId: string;
  nome?: string | null;
  corSetorHex?: string | null;
  acessoExterno?: string | null;
  localizacao?: string | null;
  portaoEntrada?: string | null;
  fotoUrl?: string | null;
  configuracaoMalhaAssentos?: ConfiguracaoMalhaAssentosV1 | null;
}

export interface EstadioIngressoV1Input {
  nome: string;
  nomePopular?: string | null;
  cidade: string;
  estado?: string | null;
  bairro?: string | null;
  endereco?: string | null;
  localizacao?: string | null;
  cep?: string | null;
  cnpjProprietarioOrganizador?: string | null;
  descricao?: string | null;
  fotoUrl?: string | null;
  capacidadeMaxima?: number;
  capacidadeOperacionalLaudo?: number | null;
  capacidadeSentada?: number | null;
  capacidadeArquibancada?: number | null;
  quantidadePortoes?: number;
  possuiAcessibilidade?: boolean;
  permiteSetorVisitante?: boolean;
  mapaUrl?: string | null;
  ativo?: boolean;
  templatesSetorIds?: string[];
  setoresConfig?: SetorEstadioConfigInput[];
}

export interface TemplateSetorIngressoV1 {
  id: string;
  slug?: string | null;
  nome: string;
  corSetorHex: string;
  tipoTorcida: TipoTorcidaSetorV1;
  acessoExterno?: string | null;
  portaoEntrada?: string | null;
  bloco?: string | null;
  numerado: boolean;
  exigeBlocoModulo?: boolean;
  exigeNivelAnel?: boolean;
  nivel?: string | null;
  fileiraInicialPadrao?: string | null;
  quantidadeFileirasPadrao?: number | null;
  numeroInicialPadrao?: number | null;
  assentosPorFileiraPadrao?: number | null;
  tipoValidacao: TipoValidacaoSetorV1;
  instrucaoAcomodacao?: string | null;
  avisosObrigatoriosSetor?: string | null;
  configuracaoMalhaAssentos?: ConfiguracaoMalhaAssentosV1 | null;
  nivelRegras?: TemplateNivelRegraV1[];
  capacidadeFisica: number;
  capacidadeVendaPadrao?: number | null;
  tipo?: string | null;
  descricao?: string | null;
  orientacaoSolar?: 'SOL' | 'SOMBRA' | 'PARCIAL';
  possuiCadeiras?: boolean;
  modeloCadeira?: string | null;
  corCadeira?: string | null;
  larguraCadeiraCm?: number | null;
  possuiEncosto?: boolean;
  capacidadeVisitante?: number;
  acessivel?: boolean;
  permiteVisitante?: boolean;
  portoesAcesso?: string[];
  ativo: boolean;
  _count?: { setores: number };
}

export type TemplateNivelRegraInputV1 =
  | TemplateNivelRegraV1
  | {
      nome_nivel: string;
      gerador_em_massa: {
        bloco_inicio: number;
        bloco_fim: number;
        de_fileira: string;
        ate_fileira: string;
        cadeiras_por_fileira: number;
      };
      excecoes?: { numero_bloco: number; cadeiras_por_fileira: number }[];
    };

export type TemplateSetorIngressoV1Input = Omit<
  TemplateSetorIngressoV1,
  'id' | 'ativo' | '_count' | 'nivelRegras'
> & {
  nivelRegras?: TemplateNivelRegraInputV1[];
};

export interface SetorEstadioIngressoV1 {
  id: string;
  estadioId: string;
  templateId?: string | null;
  nome: string;
  corSetorHex?: string;
  tipoTorcida?: TipoTorcidaSetorV1;
  acessoExterno?: string | null;
  portaoEntrada?: string | null;
  localizacao?: string | null;
  fotoUrl?: string | null;
  tipo?: string | null;
  bloco?: string | null;
  nivel?: string | null;
  descricao?: string | null;
  capacidadeFisica: number;
  capacidadeVendaPadrao?: number | null;
  capacidadeVisitante: number;
  numerado: boolean;
  acessivel: boolean;
  permiteVisitante: boolean;
  tipoValidacao?: TipoValidacaoSetorV1;
  avisosObrigatoriosSetor?: string | null;
  portoesAcesso: string[];
  orientacaoSolar: 'SOL' | 'SOMBRA' | 'PARCIAL';
  possuiCadeiras: boolean;
  modeloCadeira?: string | null;
  corCadeira?: string | null;
  larguraCadeiraCm?: number | null;
  possuiEncosto: boolean;
  ativo: boolean;
  _count: { assentos: number; regrasTemplate: number; alocacoesPartida: number };
}

export interface SetorEstadioIngressoV1Input {
  estadioId: string;
  nome: string;
  corSetorHex?: string;
  tipoTorcida?: TipoTorcidaSetorV1;
  acessoExterno?: string | null;
  portaoEntrada?: string | null;
  localizacao?: string | null;
  fotoUrl?: string | null;
  tipo?: string | null;
  bloco?: string | null;
  nivel?: string | null;
  descricao?: string | null;
  capacidadeFisica: number;
  capacidadeVendaPadrao?: number | null;
  capacidadeVisitante: number;
  numerado: boolean;
  acessivel: boolean;
  permiteVisitante: boolean;
  tipoValidacao?: TipoValidacaoSetorV1;
  avisosObrigatoriosSetor?: string | null;
  portoesAcesso: string[];
  orientacaoSolar: 'SOL' | 'SOMBRA' | 'PARCIAL';
  possuiCadeiras: boolean;
  modeloCadeira?: string | null;
  corCadeira?: string | null;
  larguraCadeiraCm?: number | null;
  possuiEncosto: boolean;
}

export interface AssentoIngressoV1 {
  id: string;
  setorId: string;
  bloco?: string | null;
  fileira: string;
  numero: number;
  tipo?: string | null;
  acessivel: boolean;
  reservadoVisitante: boolean;
  ativo: boolean;
}

export type TipoCategoriaIngressoV1 = 'INTEIRA' | 'MEIA' | 'SOCIO' | 'CORTESIA';
export type StatusPartidaIngressoV1 = 'RASCUNHO' | 'PUBLICADA' | 'ESGOTADA' | 'ENCERRADA' | 'CANCELADA';
export type StatusIngressoV1 = 'DISPONIVEL' | 'RESERVADO' | 'VENDIDO' | 'UTILIZADO' | 'CANCELADO' | 'INVALIDADO';

export interface CategoriaIngressoTemplateV1 {
  id?: string;
  nome: string;
  tipoCategoria: TipoCategoriaIngressoV1;
  percentualDesconto: number;
  limiteCota?: number | null;
  ativo: boolean;
}

export interface RegraSetorTemplateIngressoV1 {
  id?: string;
  setorId: string;
  capacidadeLiberadaPadrao: number;
  precoBaseCentavos: number;
  ativo: boolean;
  setor?: {
    id: string;
    nome: string;
    corSetorHex?: string;
    tipoTorcida?: TipoTorcidaSetorV1;
    numerado: boolean;
    capacidadeFisica: number;
    capacidadeVendaPadrao?: number | null;
  };
  categorias: CategoriaIngressoTemplateV1[];
}

export interface TemplateVendaIngressoV1 {
  id: string;
  estadioId: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
  estadio: {
    id: string;
    nome: string;
    nomePopular?: string | null;
    cidade: string;
    estado?: string | null;
  };
  regrasSetor: RegraSetorTemplateIngressoV1[];
  _count: { partidas: number };
}

export interface LoteIngressoPartidaV1 {
  id?: string;
  nome: string;
  tipoCategoria: TipoCategoriaIngressoV1;
  precoCentavos: number;
  quantidadeMaxima: number;
  quantidadeVendida?: number;
  ativo: boolean;
}

export interface AlocacaoSetorPartidaIngressoV1 {
  id: string;
  partidaId: string;
  setorId: string;
  capacidadeLiberada: number;
  quantidadeVendida: number;
  quantidadeReservada: number;
  setor: {
    id: string;
    nome: string;
    corSetorHex?: string;
    tipoTorcida?: TipoTorcidaSetorV1;
    acessoExterno?: string | null;
    portaoEntrada?: string | null;
    localizacao?: string | null;
    fotoUrl?: string | null;
    numerado: boolean;
    tipoValidacao?: TipoValidacaoSetorV1;
    instrucaoAcomodacao?: string | null;
    avisosObrigatoriosSetor?: string | null;
    capacidadeFisica: number;
    capacidadeVendaPadrao?: number | null;
    template?: {
      id: string;
      nome: string;
      nivelRegras?: TemplateNivelRegraV1[];
    } | null;
  };
  lotes: LoteIngressoPartidaV1[];
}

export interface PartidaIngressoV1 {
  id: string;
  estadioId: string;
  templateVendaId?: string | null;
  timeMandante: string;
  timeVisitante: string;
  dataPartida: string;
  inicioVendas?: string | null;
  fimVendas?: string | null;
  status: StatusPartidaIngressoV1;
  vendasAtivas: boolean;
  portariaAtiva: boolean; portariaAbreEm: string | null; portariaFechaEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
  estadio: {
    id: string;
    nome: string;
    nomePopular?: string | null;
    cidade: string;
    estado?: string | null;
    endereco?: string | null;
    bairro?: string | null;
    capacidadeMaxima: number;
    capacidadeOperacionalLaudo?: number | null;
  };
  templateVenda?: { id: string; nome: string } | null;
  alocacoesSetor: AlocacaoSetorPartidaIngressoV1[];
  _count: { ingressos: number; pedidos: number };
}

export interface MapaBlocoDisponivelV1 {
  numeroBloco: number;
  nomeNivel: string;
  capacidadeBloco: number;
  cadeirasPorFileira: number;
  fileiraInicio: string;
  fileiraFim: string;
  possuiExcecao: boolean;
}

export interface MapaBlocoSelecionadoV1 extends MapaBlocoDisponivelV1 {
  fileiras: string[];
}

export interface MapaBlocoRespostaV1 {
  blocosDisponiveis: MapaBlocoDisponivelV1[];
  blocoSelecionado: MapaBlocoSelecionadoV1 | null;
  assentosOcupados: {
    fileira: string;
    assento: number;
    status: StatusIngressoV1;
  }[];
}

export interface IngressoEmitidoV1 {
  id: string;
  partidaId: string;
  alocacaoId: string;
  loteId?: string | null;
  pedidoId?: string | null;
  blocoEscolhido?: number | null;
  fileiraEscolhida?: string | null;
  assentoEscolhido?: number | null;
  nomeTitular?: string | null;
  cpfTitular?: string | null;
  status: StatusIngressoV1;
  chaveQr: string;
  codigoPortaria: string;
  utilizadoEm?: string | null;
  catracaId?: string | null;
  criadoEm: string;
  atualizadoEm: string;
  partida: {
    id: string;
    timeMandante: string;
    timeVisitante: string;
    dataPartida: string;
    estadio: {
      id: string;
      nome: string;
      nomePopular?: string | null;
      cidade: string;
      estado?: string | null;
      endereco?: string | null;
      bairro?: string | null;
    };
  };
  alocacao: {
    id: string;
    setor: {
      id: string;
      nome: string;
      corSetorHex?: string;
      tipoTorcida?: TipoTorcidaSetorV1;
      acessoExterno?: string | null;
      portaoEntrada?: string | null;
      localizacao?: string | null;
      fotoUrl?: string | null;
      numerado: boolean;
      tipoValidacao?: TipoValidacaoSetorV1;
      instrucaoAcomodacao?: string | null;
      avisosObrigatoriosSetor?: string | null;
    };
  };
  lote?: {
    id: string;
    nome: string;
    tipoCategoria: TipoCategoriaIngressoV1;
    precoCentavos: number;
  } | null;
  pedido?: {
    id: string;
    valorTotalCentavos: number;
    statusPagamento: string;
    criadoEm: string;
  } | null;
}

const allowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

export async function pickStadiumPhoto(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: allowedImageMimeTypes,
    copyToCacheDirectory: true,
    multiple: false,
    base64: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  if (asset.size && asset.size > 4 * 1024 * 1024) {
    throw new Error('A foto do estádio deve ter no máximo 4 MB.');
  }
  const ext = asset.name.split('.').pop()?.toLowerCase() || '';
  const mimeType =
    asset.mimeType ||
    ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as Record<string, string>)[ext] ||
    'image/jpeg';

  if (!allowedImageMimeTypes.includes(mimeType)) {
    throw new Error('Selecione uma imagem JPG, PNG ou WebP.');
  }

  if (Platform.OS === 'web') {
    const blob = asset.file || (await (await fetch(asset.uri)).blob());
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      reader.readAsDataURL(blob);
    });
  }

  const base64 = await new File(asset.uri).base64();
  return `data:${mimeType};base64,${base64}`;
}

export const ingressoV1Api = {
  estadios: (token: string) => request<EstadioIngressoV1[]>('/ingresso-v1/estadios?ativo=all', { token }),
  criarEstadio: (token: string, body: EstadioIngressoV1Input) =>
    request<EstadioIngressoV1>('/ingresso-v1/estadios', { token, method: 'POST', body }),
  atualizarEstadio: (token: string, body: EstadioIngressoV1Input & { id: string }) =>
    request<EstadioIngressoV1>('/ingresso-v1/estadios', { token, method: 'PATCH', body }),
  excluirEstadio: (token: string, id: string) =>
    request<EstadioIngressoV1>('/ingresso-v1/estadios', { token, method: 'DELETE', body: { id } }),

  templatesSetor: (token: string) =>
    request<TemplateSetorIngressoV1[]>('/ingresso-v1/templates-setor?ativo=all', { token }),
  criarTemplateSetor: (token: string, body: TemplateSetorIngressoV1Input) =>
    request<TemplateSetorIngressoV1>('/ingresso-v1/templates-setor', { token, method: 'POST', body }),
  atualizarTemplateSetor: (token: string, body: TemplateSetorIngressoV1Input & { id: string }) =>
    request<TemplateSetorIngressoV1>('/ingresso-v1/templates-setor', { token, method: 'PATCH', body }),
  excluirTemplateSetor: (token: string, id: string) =>
    request<TemplateSetorIngressoV1>('/ingresso-v1/templates-setor', { token, method: 'DELETE', body: { id } }),

  setores: (token: string, estadioId: string) =>
    request<SetorEstadioIngressoV1[]>(`/ingresso-v1/setores?estadioId=${encodeURIComponent(estadioId)}`, { token }),
  criarSetor: (token: string, body: SetorEstadioIngressoV1Input) =>
    request<SetorEstadioIngressoV1>('/ingresso-v1/setores', { token, method: 'POST', body }),
  atualizarSetor: (token: string, body: SetorEstadioIngressoV1Input & { id: string }) =>
    request<SetorEstadioIngressoV1>('/ingresso-v1/setores', { token, method: 'PATCH', body }),
  excluirSetor: (token: string, id: string) =>
    request<{ id: string; deleted: boolean }>('/ingresso-v1/setores', { token, method: 'DELETE', body: { id } }),

  assentos: (token: string, setorId: string) =>
    request<AssentoIngressoV1[]>(`/ingresso-v1/assentos?setorId=${encodeURIComponent(setorId)}`, { token }),
  gerarAssentos: (
    token: string,
    body: {
      setorId: string;
      bloco?: string | null;
      fileiraInicial: string;
      quantidadeFileiras: number;
      numeroInicial: number;
      quantidadePorFileira: number;
      tipo?: string | null;
      acessivel: boolean;
      reservadoVisitante: boolean;
    }
  ) => request<{ solicitados: number; criados: number }>('/ingresso-v1/assentos/gerar', { token, method: 'POST', body }),
  excluirAssento: (token: string, id: string) =>
    request<AssentoIngressoV1>('/ingresso-v1/assentos', { token, method: 'DELETE', body: { id } }),
  limparAssentosSetor: (token: string, setorId: string) =>
    request<{ removidos: number }>('/ingresso-v1/assentos', { token, method: 'DELETE', body: { setorId } }),

  templatesVenda: (token: string, estadioId?: string) =>
    request<TemplateVendaIngressoV1[]>(
      `/ingresso-v1/templates-venda${estadioId ? `?estadioId=${encodeURIComponent(estadioId)}` : ''}`,
      { token }
    ),
  criarTemplateVenda: (
    token: string,
    body: {
      estadioId: string;
      nome: string;
      descricao?: string;
      ativo?: boolean;
      regrasSetor: {
        setorId: string;
        capacidadeLiberadaPadrao: number;
        precoBaseCentavos: number;
        ativo?: boolean;
        categorias: CategoriaIngressoTemplateV1[];
      }[];
    }
  ) => request<TemplateVendaIngressoV1>('/ingresso-v1/templates-venda', { token, method: 'POST', body }),
  atualizarTemplateVenda: (
    token: string,
    body: {
      id: string;
      nome?: string;
      descricao?: string;
      ativo?: boolean;
      regrasSetor?: {
        setorId: string;
        capacidadeLiberadaPadrao: number;
        precoBaseCentavos: number;
        ativo?: boolean;
        categorias: CategoriaIngressoTemplateV1[];
      }[];
    }
  ) => request<TemplateVendaIngressoV1>('/ingresso-v1/templates-venda', { token, method: 'PATCH', body }),
  excluirTemplateVenda: (token: string, id: string) =>
    request<TemplateVendaIngressoV1>('/ingresso-v1/templates-venda', { token, method: 'DELETE', body: { id } }),

  partidas: (token: string) => request<PartidaIngressoV1[]>('/ingresso-v1/partidas?status=all', { token }),
  criarPartida: (
    token: string,
    body: {
      estadioId: string;
      templateVendaId?: string | null;
      timeMandante: string;
      timeVisitante: string;
      dataPartida: string;
      inicioVendas?: string | null;
      fimVendas?: string | null;
      status?: StatusPartidaIngressoV1;
      vendasAtivas?: boolean;
      portariaAtiva?: boolean; portariaAbreEm?: string | null; portariaFechaEm?: string | null;
      alocacoesSetor?: {
        setorId: string;
        capacidadeLiberada: number;
        lotes: {
          id?: string;
          nome: string;
          tipoCategoria: TipoCategoriaIngressoV1;
          precoCentavos: number;
          quantidadeMaxima?: number;
          ativo?: boolean;
        }[];
      }[];
    }
  ) => request<PartidaIngressoV1>('/ingresso-v1/partidas', { token, method: 'POST', body }),
  atualizarPartida: (
    token: string,
    body: {
      id: string;
      timeMandante?: string;
      timeVisitante?: string;
      dataPartida?: string;
      inicioVendas?: string | null;
      fimVendas?: string | null;
      status?: StatusPartidaIngressoV1;
      vendasAtivas?: boolean;
      portariaAtiva?: boolean; portariaAbreEm?: string | null; portariaFechaEm?: string | null;
      alocacoesSetor?: {
        setorId: string;
        capacidadeLiberada: number;
        lotes: {
          id?: string;
          nome: string;
          tipoCategoria: TipoCategoriaIngressoV1;
          precoCentavos: number;
          quantidadeMaxima?: number;
          ativo?: boolean;
        }[];
      }[];
    }
  ) => request<PartidaIngressoV1>('/ingresso-v1/partidas', { token, method: 'PATCH', body }),
  excluirPartida: (token: string, id: string) =>
    request<PartidaIngressoV1>('/ingresso-v1/partidas', { token, method: 'DELETE', body: { id } }),

  mapaBloco: (token: string, alocacaoId: string, numeroBloco?: number) =>
    request<MapaBlocoRespostaV1>(
      `/ingresso-v1/mapa-bloco?alocacaoId=${encodeURIComponent(alocacaoId)}${
        numeroBloco ? `&numeroBloco=${encodeURIComponent(String(numeroBloco))}` : ''
      }`,
      { token }
    ),

  ingressos: (token: string, partidaId?: string) =>
    request<IngressoEmitidoV1[]>(
      `/ingresso-v1/ingressos${partidaId ? `?partidaId=${encodeURIComponent(partidaId)}` : ''}`,
      { token }
    ),
  emitirIngresso: (
    token: string,
    body: {
      partidaId: string;
      alocacaoId: string;
      loteId?: string;
      nomeTitular: string;
      cpfTitular?: string | null;
      blocoEscolhido?: number | null;
      fileiraEscolhida?: string | null;
      assentoEscolhido?: number | null;
    }
  ) => request<IngressoEmitidoV1>('/ingresso-v1/ingressos/emitir', { token, method: 'POST', body }),
  cancelarIngresso: (token: string, id: string) =>
    request<IngressoEmitidoV1>('/ingresso-v1/ingressos/cancelar', { token, method: 'POST', body: { id } }),

};
