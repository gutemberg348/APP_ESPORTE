import { z } from 'zod';

const texto = z.string().trim().min(2).max(150);
const capacidade = z.number().int().min(1).max(10000000);
const textoOpcional = (max) => z.string().trim().max(max).nullable().optional();

const fotoSchema = z
  .string()
  .trim()
  .max(7000000)
  .refine(
    (val) =>
      val === '' ||
      /^https?:\/\/.+/i.test(val) ||
      /^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(val),
    { message: 'Forneça uma imagem válida (JPG, PNG, WebP) ou URL HTTP/HTTPS.' }
  )
  .nullable()
  .optional();

const excecaoBlocoSchema = z
  .object({
    id: z.uuid().optional(),
    numeroBloco: z.number().int().min(1).max(99999).optional(),
    numero_bloco: z.number().int().min(1).max(99999).optional(),
    cadeirasPorFileira: z.number().int().min(0).max(10000).optional(),
    cadeiras_por_fileira: z.number().int().min(0).max(10000).optional(),
  })
  .strict();

const nivelRegraSchema = z
  .object({
    id: z.uuid().optional(),
    nomeNivel: z.string().trim().min(1).max(120).optional(),
    nome_nivel: z.string().trim().min(1).max(120).optional(),
    blocoInicio: z.number().int().min(1).max(99999).optional(),
    blocoFim: z.number().int().min(1).max(99999).optional(),
    fileiraInicio: z.string().trim().min(1).max(10).optional(),
    fileiraFim: z.string().trim().min(1).max(10).optional(),
    cadeirasPorFileira: z.number().int().min(1).max(10000).optional(),
    gerador_em_massa: z
      .object({
        bloco_inicio: z.number().int().min(1).max(99999),
        bloco_fim: z.number().int().min(1).max(99999),
        de_fileira: z.string().trim().min(1).max(10),
        ate_fileira: z.string().trim().min(1).max(10),
        cadeiras_por_fileira: z.number().int().min(1).max(10000),
      })
      .strict()
      .optional(),
    excecoes: z.array(excecaoBlocoSchema).default([]),
  })
  .strict();

const templateSetorFields = {
  // 1. Identificação e Naming
  slug: textoOpcional(120),
  nome: z.string().trim().min(2).max(160),
  corSetorHex: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Informe uma cor hexadecimal válida (ex.: #DC2626).')
    .default('#DC2626'),
  tipoTorcida: z.enum(['MANDANTE', 'VISITANTE', 'MISTA']).default('MANDANTE'),

  // 2. Acesso e Fluxo (Hierarquia de Portões - opcionais no template genérico)
  acessoExterno: textoOpcional(150),
  portaoEntrada: textoOpcional(150),
  bloco: textoOpcional(40),

  // 3. Assento e Geolocalização Interna
  numerado: z.boolean().default(false),
  exigeBlocoModulo: z.boolean().default(false),
  exigeNivelAnel: z.boolean().default(false),
  nivel: textoOpcional(40),
  fileiraInicialPadrao: textoOpcional(10),
  quantidadeFileirasPadrao: z.number().int().min(1).max(100).nullable().optional(),
  numeroInicialPadrao: z.number().int().min(1).max(10000).nullable().optional(),
  assentosPorFileiraPadrao: z.number().int().min(1).max(10000).nullable().optional(),
  configuracaoMalhaAssentos: z.unknown().nullable().optional(),
  nivelRegras: z.array(nivelRegraSchema).optional(),

  // 4. Validação, Tecnologia e Segurança
  tipoValidacao: z
    .enum(['QR_CODE_ESTATICO', 'QR_CODE_DINAMICO', 'BIOMETRIA_FACIAL', 'RFID_CARTEIRINHA'])
    .default('QR_CODE_ESTATICO'),
  instrucaoAcomodacao: textoOpcional(500),
  avisosObrigatoriosSetor: textoOpcional(1000),

  // 5. Capacidade e Lotes (Controle de Estoque)
  capacidadeFisica: capacidade,
  capacidadeVendaPadrao: z.number().int().min(1).max(10000000).nullable().optional(),

  // Campos complementares opcionais
  tipo: textoOpcional(40),
  descricao: textoOpcional(1000),
  orientacaoSolar: z.enum(['SOL', 'SOMBRA', 'PARCIAL']).default('PARCIAL'),
  possuiCadeiras: z.boolean().default(false),
  modeloCadeira: textoOpcional(80),
  corCadeira: textoOpcional(40),
  larguraCadeiraCm: z.number().int().min(1).max(200).nullable().optional(),
  possuiEncosto: z.boolean().default(false),
  capacidadeVisitante: z.number().int().min(0).default(0),
  acessivel: z.boolean().default(false),
  permiteVisitante: z.boolean().default(false),
  portoesAcesso: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  ativo: z.boolean().default(true),
};

const validarTemplateSetor = (value) => {
  if (
    value.capacidadeVendaPadrao !== undefined &&
    value.capacidadeVendaPadrao !== null &&
    value.capacidadeFisica !== undefined &&
    value.capacidadeVendaPadrao > value.capacidadeFisica
  ) {
    return false;
  }
  return true;
};

export const templateSetorV1CreateSchema = z
  .object(templateSetorFields)
  .strict()
  .refine(validarTemplateSetor, {
    message: 'A capacidade de venda do evento não pode ser maior que a capacidade máxima do laudo.',
    path: ['capacidadeVendaPadrao'],
  });

export const templateSetorV1UpdateSchema = z
  .object({
    id: z.uuid(),
    ...Object.fromEntries(Object.entries(templateSetorFields).map(([key, value]) => [key, value.optional()])),
  })
  .strict()
  .refine(validarTemplateSetor, {
    message: 'A capacidade de venda do evento não pode ser maior que a capacidade máxima do laudo.',
    path: ['capacidadeVendaPadrao'],
  });

export const templateSetorV1QuerySchema = z
  .object({ ativo: z.enum(['true', 'false', 'all']).default('all') })
  .strict();

const setorEstadioConfigSchema = z
  .object({
    id: z.uuid().optional(),
    templateId: z.uuid(),
    nome: textoOpcional(160),
    corSetorHex: textoOpcional(9),
    acessoExterno: textoOpcional(150),
    localizacao: textoOpcional(250),
    portaoEntrada: textoOpcional(150),
    fotoUrl: fotoSchema,
    configuracaoMalhaAssentos: z.unknown().nullable().optional(),
  })
  .strict();

const estadioV1Fields = {
  nome: texto,
  nomePopular: textoOpcional(150),
  cidade: z.string().trim().min(2).max(100),
  estado: z.string().trim().length(2).toUpperCase().nullable().optional(),
  bairro: textoOpcional(120),
  endereco: textoOpcional(250),
  localizacao: textoOpcional(500),
  cep: z.string().trim().regex(/^\d{5}-?\d{3}$/).nullable().optional(),
  cnpjProprietarioOrganizador: textoOpcional(20),
  descricao: textoOpcional(2000),
  fotoUrl: fotoSchema,
  capacidadeMaxima: z.number().int().min(1).max(10000000).optional(),
  capacidadeOperacionalLaudo: z.number().int().min(1).max(10000000).nullable().optional(),
  capacidadeSentada: z.number().int().min(0).nullable().optional(),
  capacidadeArquibancada: z.number().int().min(0).nullable().optional(),
  quantidadePortoes: z.number().int().min(0).max(1000).default(0),
  possuiAcessibilidade: z.boolean().default(false),
  permiteSetorVisitante: z.boolean().default(false),
  mapaUrl: textoOpcional(500),
  ativo: z.boolean().default(true),
  templatesSetorIds: z.array(z.uuid()).default([]),
  setoresConfig: z.array(setorEstadioConfigSchema).optional(),
};

const estadioV1BaseSchema = z.object(estadioV1Fields).strict();

export const estadioV1CreateSchema = estadioV1BaseSchema;

export const estadioV1UpdateSchema = estadioV1BaseSchema.partial().extend({
  id: z.uuid(),
}).strict();

export const estadioV1QuerySchema = z.object({
  ativo: z.enum(['true', 'false', 'all']).default('all'),
}).strict();

export const estadioV1DeleteSchema = z.object({
  id: z.uuid(),
}).strict();

const setorFields = {
  nome: z.string().trim().min(2).max(160),
  corSetorHex: z.string().trim().default('#DC2626'),
  tipoTorcida: z.enum(['MANDANTE', 'VISITANTE', 'MISTA']).default('MANDANTE'),
  acessoExterno: textoOpcional(150),
  portaoEntrada: textoOpcional(150),
  localizacao: textoOpcional(250),
  fotoUrl: fotoSchema,
  tipo: textoOpcional(40),
  bloco: textoOpcional(40),
  nivel: textoOpcional(40),
  descricao: textoOpcional(1000),
  orientacaoSolar: z.enum(['SOL', 'SOMBRA', 'PARCIAL']).default('PARCIAL'),
  possuiCadeiras: z.boolean().default(false),
  modeloCadeira: textoOpcional(80),
  corCadeira: textoOpcional(40),
  larguraCadeiraCm: z.number().int().min(1).max(200).nullable().optional(),
  possuiEncosto: z.boolean().default(false),
  capacidadeFisica: capacidade,
  capacidadeVendaPadrao: z.number().int().min(1).max(10000000).nullable().optional(),
  capacidadeVisitante: z.number().int().min(0).default(0),
  numerado: z.boolean().default(false),
  exigeBlocoModulo: z.boolean().default(false),
  exigeNivelAnel: z.boolean().default(false),
  acessivel: z.boolean().default(false),
  permiteVisitante: z.boolean().default(false),
  tipoValidacao: z
    .enum(['QR_CODE_ESTATICO', 'QR_CODE_DINAMICO', 'BIOMETRIA_FACIAL', 'RFID_CARTEIRINHA'])
    .default('QR_CODE_ESTATICO'),
  instrucaoAcomodacao: textoOpcional(500),
  avisosObrigatoriosSetor: textoOpcional(1000),
  configuracaoMalhaAssentos: z.unknown().nullable().optional(),
  portoesAcesso: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  ativo: z.boolean().default(true),
};

export const setorV1CreateSchema = z
  .object({ estadioId: z.uuid(), ...setorFields })
  .strict();

export const setorV1UpdateSchema = z
  .object({
    id: z.uuid(),
    ...Object.fromEntries(Object.entries(setorFields).map(([key, value]) => [key, value.optional()])),
  })
  .strict();

export const setorV1QuerySchema = z
  .object({ estadioId: z.uuid(), incluirInativos: z.enum(['true', 'false']).default('true') })
  .strict();

export const setorV1DeleteSchema = z.object({ id: z.uuid() }).strict();

export const assentosV1QuerySchema = z
  .object({ setorId: z.uuid(), incluirInativos: z.enum(['true', 'false']).default('true') })
  .strict();

export const assentosV1GerarSchema = z
  .object({
    setorId: z.uuid(),
    bloco: textoOpcional(40),
    fileiraInicial: z.string().trim().min(1).max(10),
    quantidadeFileiras: z.number().int().min(1).max(100),
    numeroInicial: z.number().int().min(1).max(10000),
    quantidadePorFileira: z.number().int().min(1).max(10000),
    tipo: textoOpcional(40),
    acessivel: z.boolean().default(false),
    reservadoVisitante: z.boolean().default(false),
  })
  .strict();

export const assentoV1DeleteSchema = z
  .object({
    id: z.uuid().optional(),
    setorId: z.uuid().optional(),
  })
  .strict()
  .refine((val) => Boolean(val.id || val.setorId), {
    message: 'Informe o id do assento ou o setorId para limpar os assentos do setor.',
  });

const categoriaTemplateVendaSchema = z
  .object({
    id: z.uuid().optional(),
    nome: z.string().trim().min(1).max(100),
    tipoCategoria: z.enum(['INTEIRA', 'MEIA', 'SOCIO', 'CORTESIA']),
    percentualDesconto: z.number().int().min(0).max(100).default(0),
    limiteCota: z.number().int().min(1).max(10000000).nullable().optional(),
    ativo: z.boolean().default(true),
  })
  .strict();

const regraSetorTemplateVendaSchema = z
  .object({
    id: z.uuid().optional(),
    setorId: z.uuid(),
    capacidadeLiberadaPadrao: z.number().int().min(1).max(10000000),
    precoBaseCentavos: z.number().int().min(0).max(100000000),
    ativo: z.boolean().default(true),
    categorias: z.array(categoriaTemplateVendaSchema).default([]),
  })
  .strict();

export const templateVendaV1QuerySchema = z
  .object({
    estadioId: z.uuid().optional(),
  })
  .strict();

export const templateVendaV1CreateSchema = z
  .object({
    estadioId: z.uuid(),
    nome: z.string().trim().min(2).max(120),
    descricao: z.string().trim().max(500).optional().default(''),
    ativo: z.boolean().default(true),
    regrasSetor: z.array(regraSetorTemplateVendaSchema).default([]),
  })
  .strict();

export const templateVendaV1UpdateSchema = z
  .object({
    id: z.uuid(),
    nome: z.string().trim().min(2).max(120).optional(),
    descricao: z.string().trim().max(500).optional(),
    ativo: z.boolean().optional(),
    regrasSetor: z.array(regraSetorTemplateVendaSchema).optional(),
  })
  .strict();

const lotePartidaV1Schema = z
  .object({
    id: z.uuid().optional(),
    nome: z.string().trim().min(1).max(100),
    tipoCategoria: z.enum(['INTEIRA', 'MEIA', 'SOCIO', 'CORTESIA']),
    precoCentavos: z.number().int().min(0).max(100000000),
    quantidadeMaxima: z.number().int().min(1).max(10000000).optional(),
    ativo: z.boolean().default(true),
  })
  .strict();

const alocacaoSetorPartidaV1Schema = z
  .object({
    id: z.uuid().optional(),
    setorId: z.uuid(),
    capacidadeLiberada: z.number().int().min(1).max(10000000),
    lotes: z.array(lotePartidaV1Schema).default([]),
  })
  .strict();

export const partidaV1QuerySchema = z
  .object({
    estadioId: z.uuid().optional(),
    status: z.enum(['RASCUNHO', 'PUBLICADA', 'ESGOTADA', 'ENCERRADA', 'CANCELADA', 'all']).default('all'),
  })
  .strict();

export const partidaV1CreateSchema = z
  .object({
    estadioId: z.uuid(),
    templateVendaId: z.uuid().nullable().optional(),
    timeMandante: z.string().trim().min(2).max(120),
    timeVisitante: z.string().trim().min(2).max(120),
    dataPartida: z.string().trim().min(8),
    inicioVendas: z.string().trim().nullable().optional(),
    fimVendas: z.string().trim().nullable().optional(),
    status: z.enum(['RASCUNHO', 'PUBLICADA', 'ESGOTADA', 'ENCERRADA', 'CANCELADA']).default('PUBLICADA'),
    vendasAtivas: z.boolean().default(true),
    alocacoesSetor: z.array(alocacaoSetorPartidaV1Schema).optional().default([]),
  })
  .strict();

export const partidaV1UpdateSchema = z
  .object({
    id: z.uuid(),
    timeMandante: z.string().trim().min(2).max(120).optional(),
    timeVisitante: z.string().trim().min(2).max(120).optional(),
    dataPartida: z.string().trim().min(8).optional(),
    inicioVendas: z.string().trim().nullable().optional(),
    fimVendas: z.string().trim().nullable().optional(),
    status: z.enum(['RASCUNHO', 'PUBLICADA', 'ESGOTADA', 'ENCERRADA', 'CANCELADA']).optional(),
    vendasAtivas: z.boolean().optional(),
    alocacoesSetor: z.array(alocacaoSetorPartidaV1Schema).optional(),
  })
  .strict();

export const mapaBlocoV1QuerySchema = z
  .object({
    alocacaoId: z.uuid(),
    numeroBloco: z.coerce.number().int().min(1).max(99999).optional(),
  })
  .strict();

export const ingressosV1QuerySchema = z
  .object({
    partidaId: z.uuid().optional(),
    alocacaoId: z.uuid().optional(),
    status: z.enum(['DISPONIVEL', 'RESERVADO', 'VENDIDO', 'UTILIZADO', 'CANCELADO', 'INVALIDADO', 'all']).default('all'),
  })
  .strict();

export const ingressoV1EmitirSchema = z
  .object({
    partidaId: z.uuid(),
    alocacaoId: z.uuid(),
    loteId: z.uuid().optional(),
    nomeTitular: z.string().trim().min(2).max(150),
    cpfTitular: z.string().trim().max(20).nullable().optional(),
    blocoEscolhido: z.number().int().min(1).max(99999).nullable().optional(),
    fileiraEscolhida: z.string().trim().max(10).nullable().optional(),
    assentoEscolhido: z.number().int().min(1).max(10000).nullable().optional(),
  })
  .strict();

export const portariaV1InspecionarSchema = z
  .object({
    chaveQr: z.string().trim().min(4).max(1024),
    partidaId: z.uuid().optional(),
  })
  .strict();

export const portariaV1LiberarSchema = z
  .object({
    chaveQr: z.string().trim().min(4).max(1024),
    partidaId: z.uuid().optional(),
    catracaId: z.string().trim().max(50).optional(),
  })
  .strict();
