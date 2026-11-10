import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const templateInclude = {
  nivelRegras: {
    include: {
      excecoes: { orderBy: { numeroBloco: 'asc' } },
    },
    orderBy: { blocoInicio: 'asc' },
  },
  _count: { select: { setores: true } },
};

const include = {
  setores: {
    select: {
      id: true,
      nome: true,
      corSetorHex: true,
      tipoTorcida: true,
      acessoExterno: true,
      portaoEntrada: true,
      localizacao: true,
      fotoUrl: true,
      bloco: true,
      nivel: true,
      templateId: true,
      capacidadeFisica: true,
      capacidadeVendaPadrao: true,
      tipo: true,
      numerado: true,
      exigeBlocoModulo: true,
      exigeNivelAnel: true,
      orientacaoSolar: true,
      tipoValidacao: true,
      instrucaoAcomodacao: true,
      avisosObrigatoriosSetor: true,
      configuracaoMalhaAssentos: true,
      template: {
        select: {
          id: true,
          nome: true,
          nivelRegras: {
            include: { excecoes: { orderBy: { numeroBloco: 'asc' } } },
            orderBy: { blocoInicio: 'asc' },
          },
        },
      },
    },
    orderBy: { nome: 'asc' },
  },
  _count: { select: { setores: true, templatesVenda: true, partidas: true } },
};
const setorInclude = {
  _count: { select: { assentos: true, regrasTemplate: true, alocacoesPartida: true } },
};

function contarFileiras(deFileira, ateFileira) {
  const de = (deFileira || '').trim().toUpperCase();
  const ate = (ateFileira || '').trim().toUpperCase();
  if (!de || !ate) return 0;
  const charA = de.charCodeAt(0);
  const charB = ate.charCodeAt(0);
  if (charA < 65 || charA > 90 || charB < 65 || charB > 90) return 0;
  return Math.max(1, Math.abs(charB - charA) + 1);
}

function listarFileiras(deFileira, ateFileira) {
  const de = (deFileira || 'A').trim().toUpperCase();
  const ate = (ateFileira || de).trim().toUpperCase();
  const qtd = contarFileiras(de, ate);
  if (!qtd) return [];
  const prefixLen = Math.max(1, de.length);
  const startCode = Math.min(de.charCodeAt(0), ate.charCodeAt(0));
  return Array.from({ length: qtd }, (_, index) =>
    String.fromCharCode(startCode + index).repeat(prefixLen)
  );
}

function calcularCapacidadeNivelRegra(regra) {
  const inicio = Math.min(regra.blocoInicio, regra.blocoFim);
  const fim = Math.max(regra.blocoInicio, regra.blocoFim);
  const qtdFileiras = contarFileiras(regra.fileiraInicio, regra.fileiraFim);
  if (!qtdFileiras || fim < inicio) return 0;
  const excecoesMap = new Map(
    (regra.excecoes || []).map((ex) => [Number(ex.numeroBloco), Number(ex.cadeirasPorFileira)])
  );
  let total = 0;
  for (let numBloco = inicio; numBloco <= fim; numBloco += 1) {
    const cadeiras = excecoesMap.has(numBloco)
      ? excecoesMap.get(numBloco)
      : Number(regra.cadeirasPorFileira) || 0;
    total += qtdFileiras * cadeiras;
  }
  return total;
}

function parseNivelRegrasInput(rawRegras) {
  if (!Array.isArray(rawRegras)) return null;
  return rawRegras.map((item, idx) => {
    const gm = item.gerador_em_massa;
    const rawInicio = Number(item.blocoInicio ?? gm?.bloco_inicio ?? 101);
    const rawFim = Number(item.blocoFim ?? gm?.bloco_fim ?? rawInicio);
    const blocoInicio = Math.max(1, Math.min(rawInicio, rawFim));
    const blocoFim = Math.max(blocoInicio, Math.max(rawInicio, rawFim));
    const fileiraInicio = String(item.fileiraInicio ?? gm?.de_fileira ?? 'A')
      .trim()
      .toUpperCase();
    const fileiraFim = String(item.fileiraFim ?? gm?.ate_fileira ?? 'Z')
      .trim()
      .toUpperCase();
    const cadeirasPorFileira = Math.max(
      1,
      Number(item.cadeirasPorFileira ?? gm?.cadeiras_por_fileira ?? 30)
    );
    const excecoes = (item.excecoes || [])
      .map((ex) => ({
        numeroBloco: Number(ex.numeroBloco ?? ex.numero_bloco),
        cadeirasPorFileira: Math.max(
          0,
          Number(ex.cadeirasPorFileira ?? ex.cadeiras_por_fileira ?? 0)
        ),
      }))
      .filter(
        (ex) =>
          Number.isInteger(ex.numeroBloco) &&
          ex.numeroBloco >= blocoInicio &&
          ex.numeroBloco <= blocoFim
      );

    return {
      nomeNivel: String(item.nomeNivel ?? item.nome_nivel ?? `Nível ${idx + 1}`).trim(),
      blocoInicio,
      blocoFim,
      fileiraInicio,
      fileiraFim,
      cadeirasPorFileira,
      excecoes,
    };
  });
}

function normalizeMalhaCapacidades(rawData) {
  const { nivelRegras: rawNivelRegras, ...data } = rawData;
  const parsedRegras = parseNivelRegrasInput(rawNivelRegras);

  if (data?.numerado && parsedRegras && parsedRegras.length > 0) {
    const totalCalculado = parsedRegras.reduce(
      (acc, regra) => acc + calcularCapacidadeNivelRegra(regra),
      0
    );
    const capTotal = Math.max(1, totalCalculado);
    const resumoJson = {
      niveis_regras: parsedRegras.map((r) => ({
        nome_nivel: r.nomeNivel,
        gerador_em_massa: {
          bloco_inicio: r.blocoInicio,
          bloco_fim: r.blocoFim,
          de_fileira: r.fileiraInicio,
          ate_fileira: r.fileiraFim,
          cadeiras_por_fileira: r.cadeirasPorFileira,
        },
        excecoes: r.excecoes.map((ex) => ({
          numero_bloco: ex.numeroBloco,
          cadeiras_por_fileira: ex.cadeirasPorFileira,
        })),
      })),
    };
    return {
      ...data,
      capacidadeFisica: capTotal,
      capacidadeVendaPadrao: capTotal,
      configuracaoMalhaAssentos: resumoJson,
      _parsedNivelRegras: parsedRegras,
    };
  }

  if (!data?.numerado || !Array.isArray(data?.configuracaoMalhaAssentos?.niveis_disponiveis)) {
    return {
      ...data,
      ...(parsedRegras ? { _parsedNivelRegras: parsedRegras } : {}),
    };
  }
  let totalCalculado = 0;
  const niveis = data.configuracaoMalhaAssentos.niveis_disponiveis.map((nivel) => ({
    ...nivel,
    blocos: (nivel.blocos || []).map((bloco) => {
      const deFileira = bloco.regra_fileiras?.de_fileira || 'A';
      const ateFileira = bloco.regra_fileiras?.ate_fileira || deFileira;
      const cadeirasPorFileira = Number(bloco.regra_fileiras?.cadeiras_por_fileira) || 0;
      const capacidadeCalculada = contarFileiras(deFileira, ateFileira) * cadeirasPorFileira;
      totalCalculado += capacidadeCalculada;
      return {
        ...bloco,
        capacidade_bloco: capacidadeCalculada,
      };
    }),
  }));
  const capTotal = Math.max(1, totalCalculado);
  return {
    ...data,
    capacidadeFisica: capTotal,
    capacidadeVendaPadrao: capTotal,
    configuracaoMalhaAssentos: {
      ...data.configuracaoMalhaAssentos,
      niveis_disponiveis: niveis,
    },
    ...(parsedRegras ? { _parsedNivelRegras: parsedRegras } : {}),
  };
}

function buildSeatRowsFromMalha({
  setorId,
  malha,
  tipo = null,
  acessivel = false,
  reservadoVisitante = false,
  maxCount = Infinity,
}) {
  if (!Array.isArray(malha?.niveis_disponiveis)) return [];
  const rows = [];
  for (const nivel of malha.niveis_disponiveis) {
    const nomeNivel = nivel.nome_nivel || null;
    for (const bloco of nivel.blocos || []) {
      const nomeBloco = bloco.identificador_bloco || null;
      const fileiras = listarFileiras(
        bloco.regra_fileiras?.de_fileira,
        bloco.regra_fileiras?.ate_fileira
      );
      const cadeiras = Number(bloco.regra_fileiras?.cadeiras_por_fileira) || 0;
      for (const fileira of fileiras) {
        for (let i = 0; i < cadeiras; i += 1) {
          rows.push({
            setorId,
            nivel: nomeNivel,
            bloco: nomeBloco,
            fileira,
            numero: i + 1,
            tipo: tipo || null,
            acessivel: Boolean(acessivel),
            reservadoVisitante: Boolean(reservadoVisitante),
          });
          if (rows.length >= maxCount) return rows;
        }
      }
    }
  }
  return rows;
}

function buildSeatRows({
  setorId,
  bloco = null,
  fileiraInicial = 'A',
  quantidadeFileiras = 0,
  numeroInicial = 1,
  quantidadePorFileira = 0,
  tipo = null,
  acessivel = false,
  reservadoVisitante = false,
  maxCount = Infinity,
}) {
  if (!quantidadeFileiras || !quantidadePorFileira) return [];
  const fileiras = Array.from({ length: quantidadeFileiras }, (_, index) =>
    String.fromCharCode(fileiraInicial.toUpperCase().charCodeAt(0) + index)
  );
  const rows = fileiras.flatMap((fileira) =>
    Array.from({ length: quantidadePorFileira }, (_, index) => ({
      setorId,
      bloco: bloco || null,
      fileira,
      numero: (numeroInicial || 1) + index,
      tipo: tipo || null,
      acessivel: Boolean(acessivel),
      reservadoVisitante: Boolean(reservadoVisitante),
    }))
  );
  return rows.slice(0, maxCount);
}

async function syncStadiumStats(estadioId) {
  const [estadio, setores] = await Promise.all([
    db.estadioIngressoV1.findUnique({
      where: { id: estadioId },
      select: { capacidadeMaxima: true, capacidadeOperacionalLaudo: true },
    }),
    db.setorEstadioIngressoV1.findMany({
      where: { estadioId, ativo: true },
    }),
  ]);
  const totalCap = setores.reduce((sum, s) => sum + (s.capacidadeVendaPadrao ?? s.capacidadeFisica), 0);
  const sentadaCap = setores
    .filter((s) => s.numerado || s.possuiCadeiras)
    .reduce((sum, s) => sum + (s.capacidadeVendaPadrao ?? s.capacidadeFisica), 0);
  const arquibancadaCap = setores
    .filter((s) => !s.numerado && !s.possuiCadeiras)
    .reduce((sum, s) => sum + (s.capacidadeVendaPadrao ?? s.capacidadeFisica), 0);
  const acessivel = setores.some((s) => s.acessivel);
  const visitante = setores.some((s) => s.tipoTorcida === 'VISITANTE' || s.permiteVisitante);
  const portoes = new Set(
    setores.flatMap((s) => [
      ...(s.portaoEntrada ? [s.portaoEntrada] : []),
      ...(Array.isArray(s.portoesAcesso) ? s.portoesAcesso : []),
    ])
  ).size;

  const preserveEstrutural = estadio && estadio.capacidadeMaxima > 1 && estadio.capacidadeMaxima >= totalCap;

  await db.estadioIngressoV1.update({
    where: { id: estadioId },
    data: {
      capacidadeMaxima: preserveEstrutural ? estadio.capacidadeMaxima : Math.max(1, totalCap),
      capacidadeOperacionalLaudo:
        estadio?.capacidadeOperacionalLaudo ?? (totalCap > 0 ? totalCap : null),
      capacidadeSentada: sentadaCap > 0 ? sentadaCap : null,
      capacidadeArquibancada: arquibancadaCap > 0 ? arquibancadaCap : null,
      possuiAcessibilidade: acessivel,
      permiteSetorVisitante: visitante,
      quantidadePortoes: portoes,
    },
  });
}

async function applySectorTemplates(
  estadioId,
  tenantIdValue,
  templateIds = [],
  setoresConfig = undefined,
  syncRemovals = false
) {
  const configs = Array.isArray(setoresConfig)
    ? setoresConfig
    : templateIds.map((templateId) => ({ templateId }));
  const uniqueTemplateIds = [...new Set(configs.map((c) => c.templateId).filter(Boolean))];

  if (syncRemovals) {
    const keepIds = configs.map((c) => c.id).filter(Boolean);
    await db.setorEstadioIngressoV1.deleteMany({
      where: {
        estadioId,
        templateId: { not: null },
        ...(keepIds.length > 0
          ? { id: { notIn: keepIds }, templateId: { notIn: uniqueTemplateIds } }
          : { templateId: { notIn: uniqueTemplateIds } }),
        alocacoesPartida: { none: {} },
        regrasTemplate: { none: {} },
      },
    });
  }

  if (!configs.length) {
    await syncStadiumStats(estadioId);
    return;
  }

  const templates = await db.templateSetorIngressoV1.findMany({
    where: { id: { in: uniqueTemplateIds }, tenantId: tenantIdValue },
  });
  if (templates.length !== uniqueTemplateIds.length) {
    throw new AppError(
      422,
      'TEMPLATE_SETOR_INVALIDO',
      'Um ou mais templates de setor não pertencem ao clube.'
    );
  }
  const templateMap = new Map(templates.map((t) => [t.id, t]));

  for (const cfg of configs) {
    const template = templateMap.get(cfg.templateId);
    if (!template) continue;

    const nomeSetor = cfg.nome?.trim() || template.nome;
    const corHex = cfg.corSetorHex?.trim() || template.corSetorHex || '#DC2626';
    const acessoSetor =
      cfg.acessoExterno !== undefined ? cfg.acessoExterno?.trim() || null : template.acessoExterno || null;
    const localizacaoSetor =
      cfg.localizacao !== undefined ? cfg.localizacao?.trim() || null : template.portaoEntrada || null;
    const portaoSetor =
      cfg.portaoEntrada !== undefined
        ? cfg.portaoEntrada?.trim() || null
        : localizacaoSetor || template.portaoEntrada || null;
    const fotoSetor = cfg.fotoUrl !== undefined ? cfg.fotoUrl?.trim() || null : null;
    const malhaSetor =
      cfg.configuracaoMalhaAssentos !== undefined
        ? cfg.configuracaoMalhaAssentos
        : template.configuracaoMalhaAssentos ?? null;

    const sectorPayload = {
      templateId: template.id,
      nome: nomeSetor,
      corSetorHex: corHex,
      tipoTorcida: template.tipoTorcida || 'MANDANTE',
      acessoExterno: acessoSetor,
      portaoEntrada: portaoSetor,
      localizacao: localizacaoSetor,
      ...(cfg.fotoUrl !== undefined ? { fotoUrl: fotoSetor } : {}),
      tipo: template.tipo,
      bloco: template.bloco,
      nivel: template.nivel,
      descricao: template.descricao,
      orientacaoSolar: template.orientacaoSolar,
      possuiCadeiras: template.possuiCadeiras,
      modeloCadeira: template.modeloCadeira,
      corCadeira: template.corCadeira,
      larguraCadeiraCm: template.larguraCadeiraCm,
      possuiEncosto: template.possuiEncosto,
      capacidadeFisica: template.capacidadeFisica,
      capacidadeVendaPadrao: template.capacidadeVendaPadrao ?? template.capacidadeFisica,
      capacidadeVisitante: template.capacidadeVisitante ?? 0,
      numerado: template.numerado,
      exigeBlocoModulo: template.exigeBlocoModulo ?? false,
      exigeNivelAnel: template.exigeNivelAnel ?? false,
      acessivel: template.acessivel,
      permiteVisitante: template.tipoTorcida === 'VISITANTE' || (template.permiteVisitante ?? false),
      tipoValidacao: template.tipoValidacao || 'QR_CODE_ESTATICO',
      instrucaoAcomodacao: template.instrucaoAcomodacao ?? null,
      avisosObrigatoriosSetor: template.avisosObrigatoriosSetor,
      configuracaoMalhaAssentos: malhaSetor,
      portoesAcesso: portaoSetor
        ? [portaoSetor]
        : Array.isArray(template.portoesAcesso)
          ? template.portoesAcesso
          : [],
      ativo: true,
    };

    let setor;
    const existingByTemplate = await db.setorEstadioIngressoV1.findFirst({
      where: cfg.id ? { id: cfg.id, estadioId } : { estadioId, templateId: template.id },
    });

    if (existingByTemplate) {
      setor = await db.setorEstadioIngressoV1.update({
        where: { id: existingByTemplate.id },
        data: sectorPayload,
      });
    } else {
      setor = await db.setorEstadioIngressoV1.upsert({
        where: { estadioId_nome: { estadioId, nome: nomeSetor } },
        create: {
          estadioId,
          ...sectorPayload,
        },
        update: sectorPayload,
      });
    }
  }

  await syncStadiumStats(estadioId);
}

async function tenantId(tx) {
  const tenant = await tx.tenant.findUnique({
    where: { slug: env.TENANT_SLUG },
    select: { id: true, active: true },
  });
  if (!tenant?.active) {
    throw new AppError(409, 'TENANT_INACTIVE', 'O clube precisa estar ativo para gerenciar estádios.');
  }
  return tenant.id;
}

export const ingressoV1EstadioModel = {
  async listSectorTemplates({ ativo = 'all' } = {}) {
    const tenant = await tenantId(db);
    return db.templateSetorIngressoV1.findMany({
      where: {
        tenantId: tenant,
        ...(ativo === 'all' ? {} : { ativo: ativo === 'true' }),
      },
      include: templateInclude,
      orderBy: { nome: 'asc' },
    });
  },

  async createSectorTemplate(actorId, rawData) {
    const tenant = await tenantId(db);
    const { _parsedNivelRegras, ...data } = normalizeMalhaCapacidades(rawData);
    try {
      const created = await db.templateSetorIngressoV1.create({
        data: {
          ...data,
          tenantId: tenant,
          ...(_parsedNivelRegras
            ? {
                nivelRegras: {
                  create: _parsedNivelRegras.map((regra) => ({
                    nomeNivel: regra.nomeNivel,
                    blocoInicio: regra.blocoInicio,
                    blocoFim: regra.blocoFim,
                    fileiraInicio: regra.fileiraInicio,
                    fileiraFim: regra.fileiraFim,
                    cadeirasPorFileira: regra.cadeirasPorFileira,
                    excecoes: {
                      create: regra.excecoes.map((ex) => ({
                        numeroBloco: ex.numeroBloco,
                        cadeirasPorFileira: ex.cadeirasPorFileira,
                      })),
                    },
                  })),
                },
              }
            : {}),
        },
        include: templateInclude,
      });
      await audit(actorId, 'INGRESSO_V1_TEMPLATE_SETOR_CRIADO', created.id, { nome: created.nome });
      return created;
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new AppError(409, 'TEMPLATE_SETOR_DUPLICADO', 'Já existe um template de setor com esse nome.');
      }
      throw error;
    }
  },

  async updateSectorTemplate(actorId, { id, ...rawData }) {
    const tenant = await tenantId(db);
    const current = await db.templateSetorIngressoV1.findFirst({ where: { id, tenantId: tenant } });
    if (!current) throw new AppError(404, 'TEMPLATE_SETOR_NAO_ENCONTRADO', 'Template de setor não encontrado.');
    const { _parsedNivelRegras, ...data } = normalizeMalhaCapacidades({
      numerado: rawData.numerado ?? current.numerado,
      ...rawData,
    });
    try {
      const updated = await db.$transaction(async (tx) => {
        if (_parsedNivelRegras !== undefined) {
          await tx.templateNivelRegraIngressoV1.deleteMany({ where: { templateId: id } });
        }
        return tx.templateSetorIngressoV1.update({
          where: { id },
          data: {
            ...data,
            ...(_parsedNivelRegras
              ? {
                  nivelRegras: {
                    create: _parsedNivelRegras.map((regra) => ({
                      nomeNivel: regra.nomeNivel,
                      blocoInicio: regra.blocoInicio,
                      blocoFim: regra.blocoFim,
                      fileiraInicio: regra.fileiraInicio,
                      fileiraFim: regra.fileiraFim,
                      cadeirasPorFileira: regra.cadeirasPorFileira,
                      excecoes: {
                        create: regra.excecoes.map((ex) => ({
                          numeroBloco: ex.numeroBloco,
                          cadeirasPorFileira: ex.cadeirasPorFileira,
                        })),
                      },
                    })),
                  },
                }
              : {}),
          },
          include: templateInclude,
        });
      });
      await audit(actorId, 'INGRESSO_V1_TEMPLATE_SETOR_ATUALIZADO', id, { campos: Object.keys(data) });
      return updated;
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new AppError(409, 'TEMPLATE_SETOR_DUPLICADO', 'Já existe um template de setor com esse nome.');
      }
      throw error;
    }
  },

  async deleteSectorTemplate(actorId, id) {
    const tenant = await tenantId(db);
    const current = await db.templateSetorIngressoV1.findFirst({ where: { id, tenantId: tenant } });
    if (!current) throw new AppError(404, 'TEMPLATE_SETOR_NAO_ENCONTRADO', 'Template de setor não encontrado.');
    const deleted = await db.templateSetorIngressoV1.delete({ where: { id } });
    await audit(actorId, 'INGRESSO_V1_TEMPLATE_SETOR_EXCLUIDO', id, { nome: current.nome });
    return deleted;
  },

  async list({ ativo = 'all' } = {}) {
    const where = {
      tenantId: await tenantId(db),
      ...(ativo === 'all' ? {} : { ativo: ativo === 'true' }),
    };
    return db.estadioIngressoV1.findMany({
      where,
      include,
      orderBy: [{ nome: 'asc' }],
    });
  },

  async create(actorId, { templatesSetorIds = [], setoresConfig, ...data }) {
    const id = await tenantId(db);
    try {
      const estadio = await db.estadioIngressoV1.create({
        data: { ...data, capacidadeMaxima: data.capacidadeMaxima || 1, tenantId: id },
      });
      await applySectorTemplates(estadio.id, id, templatesSetorIds, setoresConfig, false);
      await audit(actorId, 'INGRESSO_V1_ESTADIO_CRIADO', estadio.id, {
        nome: estadio.nome,
        cidade: estadio.cidade,
        templatesAplicados: setoresConfig ? setoresConfig.length : templatesSetorIds.length,
      });
      return db.estadioIngressoV1.findUnique({ where: { id: estadio.id }, include });
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new AppError(409, 'ESTADIO_DUPLICADO', 'Já existe um estádio com esse nome para este clube.');
      }
      throw error;
    }
  },

  async update(actorId, { id, templatesSetorIds, setoresConfig, ...data }) {
    const tenant = await tenantId(db);
    const current = await db.estadioIngressoV1.findFirst({ where: { id, tenantId: tenant } });
    if (!current) throw new AppError(404, 'ESTADIO_NAO_ENCONTRADO', 'Estádio não encontrado.');
    try {
      await db.estadioIngressoV1.update({ where: { id }, data });
      if (templatesSetorIds !== undefined || setoresConfig !== undefined) {
        await applySectorTemplates(id, tenant, templatesSetorIds || [], setoresConfig, true);
      }
      await audit(actorId, 'INGRESSO_V1_ESTADIO_ATUALIZADO', id, { campos: Object.keys(data) });
      return db.estadioIngressoV1.findUnique({ where: { id }, include });
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new AppError(409, 'ESTADIO_DUPLICADO', 'Já existe um estádio com esse nome para este clube.');
      }
      throw error;
    }
  },

  async delete(actorId, id) {
    const tenant = await tenantId(db);
    const current = await db.estadioIngressoV1.findFirst({
      where: { id, tenantId: tenant },
      include,
    });
    if (!current) throw new AppError(404, 'ESTADIO_NAO_ENCONTRADO', 'Estádio não encontrado.');
    if (current._count.partidas > 0) {
      throw new AppError(
        409,
        'ESTADIO_EM_USO',
        'Não é possível excluir um estádio que já possui partidas cadastradas.'
      );
    }
    const deleted = await db.estadioIngressoV1.delete({ where: { id } });
    await audit(actorId, 'INGRESSO_V1_ESTADIO_EXCLUIDO', id, { nome: current.nome });
    return deleted;
  },

  async setores({ estadioId, incluirInativos = 'true' }) {
    await ownedStadium(estadioId);
    return db.setorEstadioIngressoV1.findMany({
      where: { estadioId, ...(incluirInativos === 'true' ? {} : { ativo: true }) },
      include: setorInclude,
      orderBy: [{ nome: 'asc' }],
    });
  },

  async createSector(actorId, { estadioId, ...data }) {
    await ownedStadium(estadioId);
    if (data.capacidadeVisitante > data.capacidadeFisica) {
      throw new AppError(
        422,
        'CAPACIDADE_VISITANTE_INVALIDA',
        'A capacidade visitante não pode superar a capacidade física.'
      );
    }
    try {
      const setor = await db.setorEstadioIngressoV1.create({
        data: { ...data, estadioId },
        include: setorInclude,
      });
      await syncStadiumStats(estadioId);
      await audit(actorId, 'INGRESSO_V1_SETOR_CRIADO', setor.id, { estadioId, nome: setor.nome });
      return setor;
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new AppError(409, 'SETOR_DUPLICADO', 'Já existe um setor com esse nome neste estádio.');
      }
      throw error;
    }
  },

  async updateSector(actorId, { id, ...data }) {
    const current = await db.setorEstadioIngressoV1.findUnique({ where: { id } });
    if (!current) throw new AppError(404, 'SETOR_NAO_ENCONTRADO', 'Setor não encontrado.');
    await ownedStadium(current.estadioId);
    if (
      data.capacidadeVisitante !== undefined &&
      data.capacidadeVisitante > (data.capacidadeFisica ?? current.capacidadeFisica)
    ) {
      throw new AppError(
        422,
        'CAPACIDADE_VISITANTE_INVALIDA',
        'A capacidade visitante não pode superar a capacidade física.'
      );
    }
    const seatsCount = await db.assentoIngressoV1.count({ where: { setorId: id } });
    if (data.capacidadeFisica !== undefined && data.capacidadeFisica < seatsCount) {
      throw new AppError(
        409,
        'CAPACIDADE_ABAIXO_DOS_ASSENTOS',
        `A capacidade física não pode ser menor que os ${seatsCount} assentos já cadastrados.`
      );
    }
    const setor = await db.setorEstadioIngressoV1.update({
      where: { id },
      data,
      include: setorInclude,
    });
    await syncStadiumStats(current.estadioId);
    await audit(actorId, 'INGRESSO_V1_SETOR_ATUALIZADO', id, { campos: Object.keys(data) });
    return setor;
  },

  async deleteSector(actorId, id) {
    const current = await db.setorEstadioIngressoV1.findUnique({
      where: { id },
      include: setorInclude,
    });
    if (!current) throw new AppError(404, 'SETOR_NAO_ENCONTRADO', 'Setor não encontrado.');
    await ownedStadium(current.estadioId);
    if (current._count.alocacoesPartida > 0) {
      throw new AppError(
        409,
        'SETOR_EM_USO',
        'Não é possível excluir um setor que já está alocado em uma partida.'
      );
    }
    await db.$transaction(async (tx) => {
      if (current._count.regrasTemplate > 0) {
        await tx.regraSetorTemplateIngressoV1.deleteMany({ where: { setorId: id } });
      }
      await tx.setorEstadioIngressoV1.delete({ where: { id } });
      await tx.auditLog.create({
        data: { actorId, action: 'INGRESSO_V1_SETOR_EXCLUIDO', entityId: id, details: { nome: current.nome } },
      });
    });
    await syncStadiumStats(current.estadioId);
    return { id, deleted: true };
  },

  async seats({ setorId, incluirInativos = 'true' }) {
    const setor = await db.setorEstadioIngressoV1.findUnique({
      where: { id: setorId },
      select: { estadioId: true },
    });
    if (!setor) throw new AppError(404, 'SETOR_NAO_ENCONTRADO', 'Setor não encontrado.');
    await ownedStadium(setor.estadioId);
    return db.assentoIngressoV1.findMany({
      where: { setorId, ...(incluirInativos === 'true' ? {} : { ativo: true }) },
      orderBy: [{ bloco: 'asc' }, { fileira: 'asc' }, { numero: 'asc' }],
    });
  },

  async generateSeats(actorId, { setorId, ...input }) {
    const setor = await db.setorEstadioIngressoV1.findUnique({ where: { id: setorId } });
    if (!setor) throw new AppError(404, 'SETOR_NAO_ENCONTRADO', 'Setor não encontrado.');
    await ownedStadium(setor.estadioId);
    if (!setor.numerado) {
      throw new AppError(422, 'SETOR_NAO_NUMERADO', 'Ative o modo numerado do setor antes de gerar assentos.');
    }
    const total = input.quantidadeFileiras * input.quantidadePorFileira;
    const ativos = await db.assentoIngressoV1.count({ where: { setorId } });
    if (ativos + total > setor.capacidadeFisica) {
      throw new AppError(
        409,
        'CAPACIDADE_EXCEDIDA',
        `A geração de ${total} assentos somada aos ${ativos} existentes ultrapassa a capacidade física do setor (${setor.capacidadeFisica}).`
      );
    }
    const data = buildSeatRows({ setorId, ...input });
    try {
      return await db.$transaction(async (tx) => {
        const created = await tx.assentoIngressoV1.createMany({ data, skipDuplicates: true });
        await tx.auditLog.create({
          data: {
            actorId,
            action: 'INGRESSO_V1_ASSENTOS_GERADOS',
            entityId: setorId,
            details: { solicitados: total, criados: created.count },
          },
        });
        return { solicitados: total, criados: created.count };
      });
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new AppError(409, 'ASSENTOS_DUPLICADOS', 'Um ou mais assentos já existem neste setor.');
      }
      throw error;
    }
  },

  async deleteSeat(actorId, { id, setorId }) {
    if (setorId && !id) {
      const setor = await db.setorEstadioIngressoV1.findUnique({ where: { id: setorId } });
      if (!setor) throw new AppError(404, 'SETOR_NAO_ENCONTRADO', 'Setor não encontrado.');
      await ownedStadium(setor.estadioId);
      const removed = await db.assentoIngressoV1.deleteMany({
        where: { setorId, ingressos: { none: {} } },
      });
      await audit(actorId, 'INGRESSO_V1_ASSENTOS_LIMPOS', setorId, { removidos: removed.count });
      return { removidos: removed.count };
    }

    const seat = await db.assentoIngressoV1.findUnique({
      where: { id },
      include: { setor: { select: { estadioId: true } }, _count: { select: { ingressos: true } } },
    });
    if (!seat) throw new AppError(404, 'ASSENTO_NAO_ENCONTRADO', 'Assento não encontrado.');
    await ownedStadium(seat.setor.estadioId);
    if (seat._count.ingressos > 0) {
      throw new AppError(409, 'ASSENTO_EM_USO', 'Este assento já possui ingresso vinculado e não pode ser excluído.');
    }
    const deleted = await db.assentoIngressoV1.delete({ where: { id } });
    await audit(actorId, 'INGRESSO_V1_ASSENTO_EXCLUIDO', id, {
      fileira: seat.fileira,
      numero: seat.numero,
    });
    return deleted;
  },
};

async function ownedStadium(id) {
  const tenant = await tenantId(db);
  const stadium = await db.estadioIngressoV1.findFirst({ where: { id, tenantId: tenant } });
  if (!stadium) throw new AppError(404, 'ESTADIO_NAO_ENCONTRADO', 'Estádio não encontrado.');
  return stadium;
}

async function audit(actorId, action, entityId, details = {}) {
  await db.auditLog.create({ data: { actorId, action, entityId, details } });
}
