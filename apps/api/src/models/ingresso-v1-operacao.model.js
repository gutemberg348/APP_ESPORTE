import crypto from 'node:crypto';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const uuidToB64 = (u) => Buffer.from(String(u).replace(/-/g, ''), 'hex').toString('base64url');
const b64ToUuid = (b) => {
  const hex = Buffer.from(String(b), 'base64url').toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

/**
 * Gera um token criptográfico assinado com HMAC-SHA256 usando TICKET_QR_SECRET (64+ bytes).
 * Estrutura compacta para leitura rápida em câmera/scanner:
 * INGV1.<payloadBase64Url>.<assinaturaHmacSha256Base64Url>
 */
function signTicketV1Token({
  partidaId,
  alocacaoId,
  blocoEscolhido = null,
  fileiraEscolhida = null,
  assentoEscolhido = null,
  now = Date.now(),
}) {
  const nonce = crypto.randomBytes(12).toString('base64url'); // 96 bits CSPRNG
  const payloadObj = {
    v: 1,
    m: uuidToB64(partidaId),
    a: uuidToB64(alocacaoId),
    b: blocoEscolhido,
    r: fileiraEscolhida,
    s: assentoEscolhido,
    t: Math.floor(now / 1000),
    n: nonce,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const mac = crypto
    .createHmac('sha256', env.TICKET_QR_SECRET)
    .update(`INGV1.${payloadB64}`)
    .digest('base64url');
  return `INGV1.${payloadB64}.${mac}`;
}

/**
 * Verifica em tempo constante (timingSafeEqual) a autenticidade e integridade
 * criptográfica do token antes de aceitar na portaria.
 */
function verifyTicketV1TokenSignature(rawToken) {
  const clean = (rawToken || '').trim();
  if (!clean.startsWith('INGV1.')) {
    return { isSignedFormat: false, valid: false, claims: null };
  }
  const parts = clean.split('.');
  if (parts.length !== 3) {
    throw new AppError(422, 'INVALID_TICKET_QR', 'Formato de token QR inválido ou adulterado.');
  }
  const [, payloadB64, providedMac] = parts;
  const expectedMac = crypto
    .createHmac('sha256', env.TICKET_QR_SECRET)
    .update(`INGV1.${payloadB64}`)
    .digest('base64url');

  const bufProvided = Buffer.from(providedMac, 'utf8');
  const bufExpected = Buffer.from(expectedMac, 'utf8');
  if (
    bufProvided.length !== bufExpected.length ||
    !crypto.timingSafeEqual(bufProvided, bufExpected)
  ) {
    throw new AppError(
      422,
      'INVALID_TICKET_QR',
      'Assinatura criptográfica do ingresso inválida (possível tentativa de falsificação).'
    );
  }

  try {
    const raw = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    return {
      isSignedFormat: true,
      valid: true,
      claims: {
        mid: raw.m ? b64ToUuid(raw.m) : raw.mid,
        alc: raw.a ? b64ToUuid(raw.a) : raw.alc,
        blk: raw.b ?? raw.blk ?? null,
        row: raw.r ?? raw.row ?? null,
        seat: raw.s ?? raw.seat ?? null,
        iat: raw.t ?? raw.iat,
        jti: raw.n ?? raw.jti,
      },
    };
  } catch {
    throw new AppError(422, 'INVALID_TICKET_QR', 'Payload do token QR corrompido.');
  }
}

async function getTenantId(tx = db) {
  const tenant = await tx.tenant.findUnique({
    where: { slug: env.TENANT_SLUG },
    select: { id: true, active: true },
  });
  if (!tenant?.active) {
    throw new AppError(409, 'TENANT_INACTIVE', 'O clube precisa estar ativo.');
  }
  return tenant.id;
}

async function audit(actorId, action, entityId, details = {}, tx = db) {
  await tx.auditLog.create({ data: { actorId, action, entityId, details } });
}

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

function extrairRegrasNivelDoSetor(setor) {
  const regrasDb = setor?.template?.nivelRegras;
  if (Array.isArray(regrasDb) && regrasDb.length > 0) {
    return regrasDb.map((r) => ({
      nomeNivel: r.nomeNivel,
      blocoInicio: Number(r.blocoInicio),
      blocoFim: Number(r.blocoFim),
      fileiraInicio: r.fileiraInicio,
      fileiraFim: r.fileiraFim,
      cadeirasPorFileira: Number(r.cadeirasPorFileira),
      excecoes: (r.excecoes || []).map((ex) => ({
        numeroBloco: Number(ex.numeroBloco),
        cadeirasPorFileira: Number(ex.cadeirasPorFileira),
      })),
    }));
  }

  const jsonRegras = setor?.configuracaoMalhaAssentos?.niveis_regras;
  if (Array.isArray(jsonRegras) && jsonRegras.length > 0) {
    return jsonRegras.map((r) => ({
      nomeNivel: r.nome_nivel,
      blocoInicio: Number(r.gerador_em_massa?.bloco_inicio || 101),
      blocoFim: Number(r.gerador_em_massa?.bloco_fim || 101),
      fileiraInicio: r.gerador_em_massa?.de_fileira || 'A',
      fileiraFim: r.gerador_em_massa?.ate_fileira || 'Z',
      cadeirasPorFileira: Number(r.gerador_em_massa?.cadeiras_por_fileira || 30),
      excecoes: (r.excecoes || []).map((ex) => ({
        numeroBloco: Number(ex.numero_bloco),
        cadeirasPorFileira: Number(ex.cadeiras_por_fileira),
      })),
    }));
  }

  const legacyNiveis = setor?.configuracaoMalhaAssentos?.niveis_disponiveis;
  if (Array.isArray(legacyNiveis) && legacyNiveis.length > 0) {
    return legacyNiveis.map((n, idx) => {
      const nums = (n.blocos || [])
        .map((b) => {
          const m = /(\d+)/.exec(b.identificador_bloco || '');
          return m ? Number(m[1]) : null;
        })
        .filter((v) => v !== null);
      const firstBloco = n.blocos?.[0];
      const inicio = nums.length > 0 ? Math.min(...nums) : (idx + 1) * 100 + 1;
      const fim = nums.length > 0 ? Math.max(...nums) : inicio;
      return {
        nomeNivel: n.nome_nivel || `Nível ${idx + 1}`,
        blocoInicio: inicio,
        blocoFim: fim,
        fileiraInicio: firstBloco?.regra_fileiras?.de_fileira || 'A',
        fileiraFim: firstBloco?.regra_fileiras?.ate_fileira || 'Z',
        cadeirasPorFileira: Number(firstBloco?.regra_fileiras?.cadeiras_por_fileira || 30),
        excecoes: [],
      };
    });
  }

  return [
    {
      nomeNivel: setor?.nivel || 'Nível 1',
      blocoInicio: 101,
      blocoFim: 101,
      fileiraInicio: 'A',
      fileiraFim: 'Z',
      cadeirasPorFileira: 30,
      excecoes: [],
    },
  ];
}

const templateVendaInclude = {
  estadio: {
    select: { id: true, nome: true, nomePopular: true, cidade: true, estado: true },
  },
  regrasSetor: {
    include: {
      setor: {
        select: {
          id: true,
          nome: true,
          corSetorHex: true,
          tipoTorcida: true,
          numerado: true,
          capacidadeFisica: true,
          capacidadeVendaPadrao: true,
        },
      },
      categorias: { orderBy: { tipoCategoria: 'asc' } },
    },
    orderBy: { setor: { nome: 'asc' } },
  },
  _count: { select: { partidas: true } },
};

const partidaInclude = {
  estadio: {
    select: {
      id: true,
      nome: true,
      nomePopular: true,
      cidade: true,
      estado: true,
      endereco: true,
      bairro: true,
      capacidadeMaxima: true,
      capacidadeOperacionalLaudo: true,
    },
  },
  templateVenda: {
    select: { id: true, nome: true },
  },
  alocacoesSetor: {
    include: {
      setor: {
        include: {
          template: {
            include: {
              nivelRegras: {
                include: { excecoes: { orderBy: { numeroBloco: 'asc' } } },
                orderBy: { blocoInicio: 'asc' },
              },
            },
          },
        },
      },
      lotes: { orderBy: { precoCentavos: 'desc' } },
    },
    orderBy: { setor: { nome: 'asc' } },
  },
  _count: { select: { ingressos: true, pedidos: true } },
};

const ingressoInclude = {
  partida: {
    include: {
      estadio: {
        select: {
          id: true,
          nome: true,
          nomePopular: true,
          cidade: true,
          estado: true,
          endereco: true,
          bairro: true,
        },
      },
    },
  },
  alocacao: {
    include: {
      setor: {
        select: {
          id: true,
          nome: true,
          corSetorHex: true,
          tipoTorcida: true,
          acessoExterno: true,
          portaoEntrada: true,
          localizacao: true,
          fotoUrl: true,
          numerado: true,
          tipoValidacao: true,
          instrucaoAcomodacao: true,
          avisosObrigatoriosSetor: true,
        },
      },
    },
  },
  lote: true,
  pedido: {
    select: {
      id: true,
      valorTotalCentavos: true,
      statusPagamento: true,
      criadoEm: true,
    },
  },
};

export const ingressoV1OperacaoModel = {
  // =========================================================================
  // 1. TEMPLATES DE VENDA
  // =========================================================================
  async listSalesTemplates({ estadioId } = {}) {
    const tenantId = await getTenantId();
    return db.templateVendaIngressoV1.findMany({
      where: {
        estadio: { tenantId },
        ...(estadioId ? { estadioId } : {}),
      },
      include: templateVendaInclude,
      orderBy: [{ criadoEm: 'desc' }],
    });
  },

  async createSalesTemplate(actorId, { estadioId, nome, descricao = '', ativo = true, regrasSetor = [] }) {
    const tenantId = await getTenantId();
    const estadio = await db.estadioIngressoV1.findFirst({
      where: { id: estadioId, tenantId },
      include: { setores: true },
    });
    if (!estadio) {
      throw new AppError(404, 'ESTADIO_NAO_ENCONTRADO', 'Estádio não encontrado.');
    }

    try {
      const created = await db.templateVendaIngressoV1.create({
        data: {
          estadioId,
          nome: nome.trim(),
          descricao: descricao?.trim() || '',
          ativo,
          regrasSetor: {
            create: regrasSetor.map((r) => ({
              setorId: r.setorId,
              capacidadeLiberadaPadrao: r.capacidadeLiberadaPadrao,
              precoBaseCentavos: r.precoBaseCentavos,
              ativo: r.ativo ?? true,
              categorias: {
                create: (r.categorias || []).map((c) => ({
                  nome: c.nome.trim(),
                  tipoCategoria: c.tipoCategoria,
                  percentualDesconto: c.percentualDesconto ?? 0,
                  limiteCota: c.limiteCota ?? null,
                  ativo: c.ativo ?? true,
                })),
              },
            })),
          },
        },
        include: templateVendaInclude,
      });
      await audit(actorId, 'INGRESSO_V1_TEMPLATE_VENDA_CRIADO', created.id, { nome: created.nome });
      return created;
    } catch (error) {
      if (error?.code === 'P2002') {
        throw new AppError(409, 'TEMPLATE_VENDA_DUPLICADO', 'Já existe um template de venda com esse nome para este estádio.');
      }
      throw error;
    }
  },

  async updateSalesTemplate(actorId, { id, nome, descricao, ativo, regrasSetor }) {
    const tenantId = await getTenantId();
    const current = await db.templateVendaIngressoV1.findFirst({
      where: { id, estadio: { tenantId } },
    });
    if (!current) {
      throw new AppError(404, 'TEMPLATE_VENDA_NAO_ENCONTRADO', 'Template de venda não encontrado.');
    }

    const updated = await db.$transaction(async (tx) => {
      if (Array.isArray(regrasSetor)) {
        await tx.regraSetorTemplateIngressoV1.deleteMany({ where: { templateId: id } });
      }
      return tx.templateVendaIngressoV1.update({
        where: { id },
        data: {
          ...(nome !== undefined ? { nome: nome.trim() } : {}),
          ...(descricao !== undefined ? { descricao: descricao?.trim() || '' } : {}),
          ...(ativo !== undefined ? { ativo } : {}),
          ...(Array.isArray(regrasSetor)
            ? {
                regrasSetor: {
                  create: regrasSetor.map((r) => ({
                    setorId: r.setorId,
                    capacidadeLiberadaPadrao: r.capacidadeLiberadaPadrao,
                    precoBaseCentavos: r.precoBaseCentavos,
                    ativo: r.ativo ?? true,
                    categorias: {
                      create: (r.categorias || []).map((c) => ({
                        nome: c.nome.trim(),
                        tipoCategoria: c.tipoCategoria,
                        percentualDesconto: c.percentualDesconto ?? 0,
                        limiteCota: c.limiteCota ?? null,
                        ativo: c.ativo ?? true,
                      })),
                    },
                  })),
                },
              }
            : {}),
        },
        include: templateVendaInclude,
      });
    });

    await audit(actorId, 'INGRESSO_V1_TEMPLATE_VENDA_ATUALIZADO', id, { nome: updated.nome });
    return updated;
  },

  async deleteSalesTemplate(actorId, id) {
    const tenantId = await getTenantId();
    const current = await db.templateVendaIngressoV1.findFirst({
      where: { id, estadio: { tenantId } },
      include: { _count: { select: { partidas: true } } },
    });
    if (!current) {
      throw new AppError(404, 'TEMPLATE_VENDA_NAO_ENCONTRADO', 'Template de venda não encontrado.');
    }
    if (current._count.partidas > 0) {
      throw new AppError(
        409,
        'TEMPLATE_VENDA_EM_USO',
        'Não é possível excluir um template de venda já vinculado a partidas.'
      );
    }
    const deleted = await db.templateVendaIngressoV1.delete({ where: { id } });
    await audit(actorId, 'INGRESSO_V1_TEMPLATE_VENDA_EXCLUIDO', id, { nome: current.nome });
    return deleted;
  },

  // =========================================================================
  // 2. PARTIDAS V1
  // =========================================================================
  async listMatches({ estadioId, status } = {}) {
    const tenantId = await getTenantId();
    return db.partidaIngressoV1.findMany({
      where: {
        estadio: { tenantId },
        ...(estadioId ? { estadioId } : {}),
        ...(status && status !== 'all' ? { status } : {}),
      },
      include: partidaInclude,
      orderBy: [{ dataPartida: 'desc' }],
    });
  },

  async createMatch(
    actorId,
    {
      estadioId,
      templateVendaId = null,
      timeMandante,
      timeVisitante,
      dataPartida,
      inicioVendas = null,
      fimVendas = null,
      status = 'PUBLICADA',
      vendasAtivas = true,
      alocacoesSetor = [],
    }
  ) {
    const tenantId = await getTenantId();
    const estadio = await db.estadioIngressoV1.findFirst({
      where: { id: estadioId, tenantId },
      include: { setores: { where: { ativo: true } } },
    });
    if (!estadio) {
      throw new AppError(404, 'ESTADIO_NAO_ENCONTRADO', 'Estádio não encontrado.');
    }

    let alocacoesInput = alocacoesSetor;
    if ((!alocacoesInput || alocacoesInput.length === 0) && templateVendaId) {
      const tplVenda = await db.templateVendaIngressoV1.findFirst({
        where: { id: templateVendaId, estadioId },
        include: { regrasSetor: { where: { ativo: true }, include: { categorias: { where: { ativo: true } } } } },
      });
      if (tplVenda) {
        alocacoesInput = tplVenda.regrasSetor.map((regra) => ({
          setorId: regra.setorId,
          capacidadeLiberada: regra.capacidadeLiberadaPadrao,
          lotes:
            regra.categorias.length > 0
              ? regra.categorias.map((cat) => ({
                  nome: cat.nome,
                  tipoCategoria: cat.tipoCategoria,
                  precoCentavos: Math.max(
                    0,
                    Math.round((regra.precoBaseCentavos * (100 - (cat.percentualDesconto || 0))) / 100)
                  ),
                  quantidadeMaxima: cat.limiteCota || regra.capacidadeLiberadaPadrao,
                  ativo: true,
                }))
              : [
                  {
                    nome: 'Inteira',
                    tipoCategoria: 'INTEIRA',
                    precoCentavos: regra.precoBaseCentavos,
                    quantidadeMaxima: regra.capacidadeLiberadaPadrao,
                    ativo: true,
                  },
                ],
        }));
      }
    }

    if (!alocacoesInput || alocacoesInput.length === 0) {
      alocacoesInput = estadio.setores.map((s) => {
        const cap = s.capacidadeVendaPadrao || s.capacidadeFisica;
        return {
          setorId: s.id,
          capacidadeLiberada: cap,
          lotes: [
            {
              nome: 'Inteira',
              tipoCategoria: 'INTEIRA',
              precoCentavos: 6000,
              quantidadeMaxima: cap,
              ativo: true,
            },
            {
              nome: 'Meia-Entrada',
              tipoCategoria: 'MEIA',
              precoCentavos: 3000,
              quantidadeMaxima: Math.max(1, Math.floor(cap * 0.4)),
              ativo: true,
            },
          ],
        };
      });
    }

    const created = await db.partidaIngressoV1.create({
      data: {
        estadioId,
        templateVendaId: templateVendaId || null,
        timeMandante: timeMandante.trim(),
        timeVisitante: timeVisitante.trim(),
        dataPartida: new Date(dataPartida),
        inicioVendas: inicioVendas ? new Date(inicioVendas) : null,
        fimVendas: fimVendas ? new Date(fimVendas) : null,
        status,
        vendasAtivas,
        alocacoesSetor: {
          create: alocacoesInput.map((a) => ({
            setorId: a.setorId,
            capacidadeLiberada: a.capacidadeLiberada,
            lotes: {
              create: (a.lotes || []).map((l) => ({
                nome: l.nome.trim(),
                tipoCategoria: l.tipoCategoria,
                precoCentavos: l.precoCentavos,
                quantidadeMaxima: l.quantidadeMaxima || a.capacidadeLiberada,
                ativo: l.ativo ?? true,
              })),
            },
          })),
        },
      },
      include: partidaInclude,
    });

    await audit(actorId, 'INGRESSO_V1_PARTIDA_CRIADA', created.id, {
      jogo: `${created.timeMandante} x ${created.timeVisitante}`,
    });
    return created;
  },

  async updateMatch(
    actorId,
    {
      id,
      timeMandante,
      timeVisitante,
      dataPartida,
      inicioVendas,
      fimVendas,
      status,
      vendasAtivas,
      alocacoesSetor,
    }
  ) {
    const tenantId = await getTenantId();
    const current = await db.partidaIngressoV1.findFirst({
      where: { id, estadio: { tenantId } },
      include: { alocacoesSetor: true },
    });
    if (!current) {
      throw new AppError(404, 'PARTIDA_NAO_ENCONTRADA', 'Partida não encontrada.');
    }

    const updated = await db.$transaction(async (tx) => {
      if (Array.isArray(alocacoesSetor)) {
        for (const a of alocacoesSetor) {
          const existingAloc = current.alocacoesSetor.find((x) => x.setorId === a.setorId);
          if (existingAloc) {
            await tx.alocacaoSetorPartidaIngressoV1.update({
              where: { id: existingAloc.id },
              data: { capacidadeLiberada: a.capacidadeLiberada },
            });
            if (Array.isArray(a.lotes)) {
              for (const l of a.lotes) {
                if (l.id) {
                  await tx.loteIngressoPartidaV1.update({
                    where: { id: l.id },
                    data: {
                      nome: l.nome.trim(),
                      tipoCategoria: l.tipoCategoria,
                      precoCentavos: l.precoCentavos,
                      quantidadeMaxima: l.quantidadeMaxima || a.capacidadeLiberada,
                      ativo: l.ativo ?? true,
                    },
                  });
                } else {
                  await tx.loteIngressoPartidaV1.create({
                    data: {
                      alocacaoId: existingAloc.id,
                      nome: l.nome.trim(),
                      tipoCategoria: l.tipoCategoria,
                      precoCentavos: l.precoCentavos,
                      quantidadeMaxima: l.quantidadeMaxima || a.capacidadeLiberada,
                      ativo: l.ativo ?? true,
                    },
                  });
                }
              }
            }
          } else {
            await tx.alocacaoSetorPartidaIngressoV1.create({
              data: {
                partidaId: id,
                setorId: a.setorId,
                capacidadeLiberada: a.capacidadeLiberada,
                lotes: {
                  create: (a.lotes || []).map((l) => ({
                    nome: l.nome.trim(),
                    tipoCategoria: l.tipoCategoria,
                    precoCentavos: l.precoCentavos,
                    quantidadeMaxima: l.quantidadeMaxima || a.capacidadeLiberada,
                    ativo: l.ativo ?? true,
                  })),
                },
              },
            });
          }
        }
      }

      return tx.partidaIngressoV1.update({
        where: { id },
        data: {
          ...(timeMandante !== undefined ? { timeMandante: timeMandante.trim() } : {}),
          ...(timeVisitante !== undefined ? { timeVisitante: timeVisitante.trim() } : {}),
          ...(dataPartida !== undefined ? { dataPartida: new Date(dataPartida) } : {}),
          ...(inicioVendas !== undefined ? { inicioVendas: inicioVendas ? new Date(inicioVendas) : null } : {}),
          ...(fimVendas !== undefined ? { fimVendas: fimVendas ? new Date(fimVendas) : null } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(vendasAtivas !== undefined ? { vendasAtivas } : {}),
        },
        include: partidaInclude,
      });
    });

    await audit(actorId, 'INGRESSO_V1_PARTIDA_ATUALIZADA', id, {
      jogo: `${updated.timeMandante} x ${updated.timeVisitante}`,
    });
    return updated;
  },

  async deleteMatch(actorId, id) {
    const tenantId = await getTenantId();
    const current = await db.partidaIngressoV1.findFirst({
      where: { id, estadio: { tenantId } },
      include: { _count: { select: { ingressos: true } } },
    });
    if (!current) {
      throw new AppError(404, 'PARTIDA_NAO_ENCONTRADA', 'Partida não encontrada.');
    }
    if (current._count.ingressos > 0) {
      throw new AppError(
        409,
        'PARTIDA_COM_INGRESSOS',
        'Não é possível excluir uma partida que já possui ingressos emitidos.'
      );
    }
    const deleted = await db.partidaIngressoV1.delete({ where: { id } });
    await audit(actorId, 'INGRESSO_V1_PARTIDA_EXCLUIDA', id, {
      jogo: `${current.timeMandante} x ${current.timeVisitante}`,
    });
    return deleted;
  },

  // =========================================================================
  // 3. MAPA DE BLOCO EM TEMPO REAL (MATRIZ EM MEMÓRIA + SELECT OCUPADOS)
  // =========================================================================
  async getBlockSeatMap({ alocacaoId, numeroBloco }) {
    const alocacao = await db.alocacaoSetorPartidaIngressoV1.findUnique({
      where: { id: alocacaoId },
      include: {
        setor: {
          include: {
            template: {
              include: {
                nivelRegras: {
                  include: { excecoes: true },
                  orderBy: { blocoInicio: 'asc' },
                },
              },
            },
          },
        },
      },
    });
    if (!alocacao) {
      throw new AppError(404, 'ALOCACAO_NAO_ENCONTRADA', 'Alocação de setor não encontrada.');
    }

    const regras = extrairRegrasNivelDoSetor(alocacao.setor);
    const todosBlocos = [];
    for (const r of regras) {
      const ini = Math.min(r.blocoInicio, r.blocoFim);
      const fim = Math.max(r.blocoInicio, r.blocoFim);
      for (let b = ini; b <= fim; b += 1) {
        const ex = (r.excecoes || []).find((e) => Number(e.numeroBloco) === b);
        const cadeirasPorFileira = ex ? ex.cadeirasPorFileira : r.cadeirasPorFileira;
        const fileiras = listarFileiras(r.fileiraInicio, r.fileiraFim);
        todosBlocos.push({
          numeroBloco: b,
          nomeNivel: r.nomeNivel,
          fileiraInicio: r.fileiraInicio,
          fileiraFim: r.fileiraFim,
          fileiras,
          cadeirasPorFileira,
          capacidadeBloco: fileiras.length * cadeirasPorFileira,
          possuiExcecao: Boolean(ex),
        });
      }
    }

    const targetBloco = numeroBloco
      ? todosBlocos.find((b) => b.numeroBloco === Number(numeroBloco)) || todosBlocos[0]
      : todosBlocos[0];

    if (!targetBloco) {
      return {
        blocosDisponiveis: [],
        blocoSelecionado: null,
        assentosOcupados: [],
      };
    }

    const vendidosNoBloco = await db.ingressoV1.findMany({
      where: {
        alocacaoId,
        blocoEscolhido: targetBloco.numeroBloco,
        status: { in: ['RESERVADO', 'VENDIDO', 'UTILIZADO'] },
      },
      select: {
        fileiraEscolhida: true,
        assentoEscolhido: true,
        status: true,
        nomeTitular: true,
      },
    });

    return {
      blocosDisponiveis: todosBlocos.map((b) => ({
        numeroBloco: b.numeroBloco,
        nomeNivel: b.nomeNivel,
        capacidadeBloco: b.capacidadeBloco,
        cadeirasPorFileira: b.cadeirasPorFileira,
        fileiraInicio: b.fileiraInicio,
        fileiraFim: b.fileiraFim,
        possuiExcecao: b.possuiExcecao,
      })),
      blocoSelecionado: targetBloco,
      assentosOcupados: vendidosNoBloco.map((v) => ({
        fileira: v.fileiraEscolhida,
        assento: v.assentoEscolhido,
        status: v.status,
      })),
    };
  },

  // =========================================================================
  // 4. EMISSÃO E GESTÃO DE INGRESSOS V1
  // =========================================================================
  async listTickets({ partidaId, alocacaoId, status } = {}) {
    const tenantId = await getTenantId();
    return db.ingressoV1.findMany({
      where: {
        partida: { estadio: { tenantId } },
        ...(partidaId ? { partidaId } : {}),
        ...(alocacaoId ? { alocacaoId } : {}),
        ...(status && status !== 'all' ? { status } : {}),
      },
      include: ingressoInclude,
      orderBy: [{ criadoEm: 'desc' }],
      take: 250,
    });
  },

  async issueTicket(
    actorId,
    {
      partidaId,
      alocacaoId,
      loteId,
      nomeTitular,
      cpfTitular = null,
      blocoEscolhido = null,
      fileiraEscolhida = null,
      assentoEscolhido = null,
    }
  ) {
    const tenantId = await getTenantId();
    const alocacao = await db.alocacaoSetorPartidaIngressoV1.findFirst({
      where: {
        id: alocacaoId,
        partidaId,
        partida: { estadio: { tenantId } },
      },
      include: {
        partida: true,
        setor: {
          include: {
            template: {
              include: {
                nivelRegras: { include: { excecoes: true } },
              },
            },
          },
        },
        lotes: true,
      },
    });
    if (!alocacao) {
      throw new AppError(404, 'ALOCACAO_NAO_ENCONTRADA', 'Setor da partida não encontrado.');
    }

    const saldoSetor =
      alocacao.capacidadeLiberada - alocacao.quantidadeVendida - alocacao.quantidadeReservada;
    if (saldoSetor < 1) {
      throw new AppError(409, 'SETOR_ESGOTADO', 'A capacidade liberada deste setor está esgotada.');
    }

    const lote = alocacao.lotes.find((l) => l.id === loteId) || alocacao.lotes[0];
    if (!lote) {
      throw new AppError(404, 'LOTE_NAO_ENCONTRADO', 'Lote de ingresso não encontrado para este setor.');
    }
    if (lote.quantidadeVendida >= lote.quantidadeMaxima) {
      throw new AppError(409, 'LOTE_ESGOTADO', 'A cota deste lote está esgotada.');
    }

    let numBloco = blocoEscolhido !== null && blocoEscolhido !== undefined ? Number(blocoEscolhido) : null;
    let fileiraStr = fileiraEscolhida ? String(fileiraEscolhida).trim().toUpperCase() : null;
    let numAssento =
      assentoEscolhido !== null && assentoEscolhido !== undefined ? Number(assentoEscolhido) : null;

    if (alocacao.setor.numerado) {
      if (!numBloco || !fileiraStr || !numAssento) {
        throw new AppError(
          422,
          'ASSENTO_OBRIGATORIO',
          'Este setor possui assento marcado. Escolha o Bloco, a Fileira e o Número do assento.'
        );
      }

      const regras = extrairRegrasNivelDoSetor(alocacao.setor);
      let blocoValido = null;
      for (const r of regras) {
        const ini = Math.min(r.blocoInicio, r.blocoFim);
        const fim = Math.max(r.blocoInicio, r.blocoFim);
        if (numBloco >= ini && numBloco <= fim) {
          const ex = (r.excecoes || []).find((e) => Number(e.numeroBloco) === numBloco);
          const maxCadeiras = ex ? ex.cadeirasPorFileira : r.cadeirasPorFileira;
          const fileirasValidas = listarFileiras(r.fileiraInicio, r.fileiraFim);
          blocoValido = { maxCadeiras, fileirasValidas };
          break;
        }
      }

      if (!blocoValido) {
        throw new AppError(422, 'BLOCO_INVALIDO', `O Bloco ${numBloco} não pertence às regras deste setor.`);
      }
      if (!blocoValido.fileirasValidas.includes(fileiraStr)) {
        throw new AppError(
          422,
          'FILEIRA_INVALIDA',
          `A fileira ${fileiraStr} não existe no Bloco ${numBloco}.`
        );
      }
      if (numAssento < 1 || numAssento > blocoValido.maxCadeiras) {
        throw new AppError(
          422,
          'ASSENTO_INVALIDO',
          `O assento ${numAssento} excede o limite de ${blocoValido.maxCadeiras} cadeiras da fileira ${fileiraStr} no Bloco ${numBloco}.`
        );
      }

      const ocupado = await db.ingressoV1.findFirst({
        where: {
          alocacaoId,
          blocoEscolhido: numBloco,
          fileiraEscolhida: fileiraStr,
          assentoEscolhido: numAssento,
          status: { in: ['RESERVADO', 'VENDIDO', 'UTILIZADO'] },
        },
      });
      if (ocupado) {
        throw new AppError(
          409,
          'ASSENTO_JA_OCUPADO',
          `O assento Bloco ${numBloco} · Fileira ${fileiraStr} · Cadeiras ${numAssento} já está ocupado.`
        );
      }
    } else {
      numBloco = null;
      fileiraStr = null;
      numAssento = null;
    }

    const chaveQr = signTicketV1Token({
      partidaId,
      alocacaoId,
      blocoEscolhido: numBloco,
      fileiraEscolhida: fileiraStr,
      assentoEscolhido: numAssento,
      tipoValidacao: alocacao.setor.tipoValidacao || 'QR_CODE_ESTATICO',
    });

    const ingresso = await db.$transaction(async (tx) => {
      const pedido = await tx.pedidoIngressoV1.create({
        data: {
          usuarioId: actorId,
          partidaId,
          valorTotalCentavos: lote.precoCentavos,
          statusPagamento: 'PAGO',
        },
      });

      await tx.alocacaoSetorPartidaIngressoV1.update({
        where: { id: alocacaoId },
        data: {
          quantidadeVendida: { increment: 1 },
          versao: { increment: 1 },
        },
      });

      await tx.loteIngressoPartidaV1.update({
        where: { id: lote.id },
        data: { quantidadeVendida: { increment: 1 } },
      });

      const createdTicket = await tx.ingressoV1.create({
        data: {
          partidaId,
          alocacaoId,
          loteId: lote.id,
          pedidoId: pedido.id,
          blocoEscolhido: numBloco,
          fileiraEscolhida: fileiraStr,
          assentoEscolhido: numAssento,
          nomeTitular: nomeTitular.trim(),
          cpfTitular: cpfTitular?.trim() || null,
          status: 'VENDIDO',
          chaveQr,
        },
        include: ingressoInclude,
      });

      await audit(
        actorId,
        'INGRESSO_V1_EMITIDO',
        createdTicket.id,
        {
          chaveQr,
          setor: createdTicket.alocacao.setor.nome,
          bloco_escolhido: numBloco,
          fileira_escolhida: fileiraStr,
          assento_escolhido: numAssento,
        },
        tx
      );

      return createdTicket;
    });

    return ingresso;
  },

  async cancelTicket(actorId, id) {
    const tenantId = await getTenantId();
    const current = await db.ingressoV1.findFirst({
      where: { id, partida: { estadio: { tenantId } } },
    });
    if (!current) {
      throw new AppError(404, 'INGRESSO_NAO_ENCONTRADO', 'Ingresso não encontrado.');
    }
    if (current.status === 'CANCELADO') {
      return db.ingressoV1.findUnique({ where: { id }, include: ingressoInclude });
    }
    if (current.status === 'UTILIZADO') {
      throw new AppError(
        409,
        'INGRESSO_JA_UTILIZADO',
        'Não é possível cancelar um ingresso que já passou na catraca.'
      );
    }

    return db.$transaction(async (tx) => {
      await tx.alocacaoSetorPartidaIngressoV1.update({
        where: { id: current.alocacaoId },
        data: {
          quantidadeVendida: { decrement: 1 },
          versao: { increment: 1 },
        },
      });

      if (current.loteId) {
        await tx.loteIngressoPartidaV1.update({
          where: { id: current.loteId },
          data: { quantidadeVendida: { decrement: 1 } },
        });
      }

      const updated = await tx.ingressoV1.update({
        where: { id },
        data: {
          status: 'CANCELADO',
          blocoEscolhido: null,
          fileiraEscolhida: null,
          assentoEscolhido: null,
        },
        include: ingressoInclude,
      });

      await audit(actorId, 'INGRESSO_V1_CANCELADO', id, { chaveQr: current.chaveQr }, tx);
      return updated;
    });
  },

  // =========================================================================
  // 5. PORTARIA V1 (INSPEÇÃO E VALIDAÇÃO DE ACESSO)
  // =========================================================================
  async inspectTicket({ chaveQr, partidaId }) {
    const tenantId = await getTenantId();
    const cleanCode = (chaveQr || '').trim();

    // 1. Se for token assinado INGV1.<payload>.<hmac>, verifica assinatura HMAC-SHA256 em tempo constante
    const verification = verifyTicketV1TokenSignature(cleanCode);

    const ingresso = await db.ingressoV1.findFirst({
      where: {
        chaveQr: verification.isSignedFormat ? cleanCode : cleanCode.toUpperCase(),
        partida: {
          estadio: { tenantId },
          ...(partidaId ? { id: partidaId } : {}),
        },
      },
      include: ingressoInclude,
    });
    if (!ingresso) {
      throw new AppError(404, 'INGRESSO_NAO_ENCONTRADO', 'Token QR não encontrado para esta partida.');
    }

    // 2. Cruzamento das claims assinadas contra o registro do banco (anti-tampering)
    if (verification.isSignedFormat && verification.claims) {
      const c = verification.claims;
      if (
        c.mid !== ingresso.partidaId ||
        c.alc !== ingresso.alocacaoId ||
        (c.blk ?? null) !== (ingresso.blocoEscolhido ?? null) ||
        (c.row ?? null) !== (ingresso.fileiraEscolhida ?? null) ||
        (c.seat ?? null) !== (ingresso.assentoEscolhido ?? null)
      ) {
        throw new AppError(
          422,
          'INVALID_TICKET_QR',
          'Os dados criptográficos do QR não correspondem ao assento/setor registrado.'
        );
      }
    }

    return ingresso;
  },

  async admitTicket(actorId, { chaveQr, partidaId, catracaId = 'CATRACA-01' }) {
    const ingresso = await this.inspectTicket({ chaveQr, partidaId });
    if (ingresso.status === 'UTILIZADO') {
      throw new AppError(
        409,
        'INGRESSO_JA_UTILIZADO',
        `Ingresso já utilizado em ${new Date(ingresso.utilizadoEm).toLocaleString('pt-BR')} (${ingresso.catracaId || 'Catraca'}).`
      );
    }
    if (ingresso.status !== 'VENDIDO') {
      throw new AppError(
        409,
        'INGRESSO_INVALIDO_ACESSO',
        `Ingresso com status ${ingresso.status} não está liberado para acesso.`
      );
    }

    const updated = await db.ingressoV1.update({
      where: { id: ingresso.id },
      data: {
        status: 'UTILIZADO',
        utilizadoEm: new Date(),
        catracaId: catracaId?.trim() || 'CATRACA-01',
      },
      include: ingressoInclude,
    });

    await audit(actorId, 'INGRESSO_V1_ACESSO_LIBERADO', updated.id, {
      chaveQr: updated.chaveQr,
      catracaId: updated.catracaId,
      bloco: updated.blocoEscolhido,
      fileira: updated.fileiraEscolhida,
      assento: updated.assentoEscolhido,
    });

    return updated;
  },
};

