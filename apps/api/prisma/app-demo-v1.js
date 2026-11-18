import { createHash } from 'node:crypto';
const fixtureId = (tenant, key) => {
  const h = createHash('sha256').update(`app-demo-v1:${tenant}:${key}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
};

// Called inside the same transaction as the shop/app fixtures. No paid tickets issued.
export async function seedDemoV1(tx, { tenantSlug, schedule }) {
  const tenant = await tx.tenant.upsert({ where: { slug: tenantSlug }, create: { slug: tenantSlug, name: 'Esporte Clube de Patos' }, update: {} });
  if (!tenant.active) throw new Error('O clube está inativo. Ative-o no admin antes de publicar os exemplos.');
  const stadiumId = fixtureId(tenant.id, 'stadium'), salesId = fixtureId(tenant.id, 'sales');
  const specs = [
    { key: 'arquibancada', nome: '[TESTE APP] Arquibancada', numerado: false, capacidade: 100, preco: 10 },
    { key: 'cadeiras', nome: '[TESTE APP] Cadeiras numeradas', numerado: true, capacidade: 20, preco: 200 },
  ];
  let templatesCreated = 0, stadiumsCreated = 0, salesTemplatesCreated = 0, matchesCreated = 0;
  const sectors = [];
  for (const spec of specs) {
    const templateId = fixtureId(tenant.id, `template-${spec.key}`), sectorId = fixtureId(tenant.id, `sector-${spec.key}`);
    if (!await tx.templateSetorIngressoV1.findUnique({ where: { id: templateId } })) {
      await tx.templateSetorIngressoV1.create({ data: { id: templateId, tenantId: tenant.id, slug: `app-teste-${spec.key}`, nome: spec.nome,
        capacidadeFisica: spec.capacidade, capacidadeVendaPadrao: spec.capacidade, numerado: spec.numerado, possuiCadeiras: spec.numerado,
        descricao: 'Cadastro de TESTE. Não representa acesso a um evento real.', corSetorHex: '#BE1E2D',
        portaoEntrada: 'Portão TESTE', portoesAcesso: ['Portão TESTE'], tipoValidacao: 'QR_CODE_ESTATICO',
        ...(spec.numerado ? { modeloCadeira: 'Plástica com encosto', larguraCadeiraCm: 45, corCadeira: 'Vermelha', possuiEncosto: true, nivel: 'Térreo', bloco: '101', exigeBlocoModulo: true, exigeNivelAnel: true,
          nivelRegras: { create: { nomeNivel: 'Térreo', blocoInicio: 101, blocoFim: 101, fileiraInicio: 'A', fileiraFim: 'B', cadeirasPorFileira: 10 } } } : {}),
      } }); templatesCreated++;
    }
    sectors.push({ ...spec, id: sectorId, templateId });
  }
  if (!await tx.estadioIngressoV1.findUnique({ where: { id: stadiumId } })) {
    await tx.estadioIngressoV1.create({ data: { id: stadiumId, tenantId: tenant.id, nome: '[TESTE APP] Arena Esporte',
      nomePopular: 'Arena de demonstração', cidade: 'Patos', estado: 'PB', capacidadeMaxima: 120, capacidadeOperacionalLaudo: 120,
      quantidadePortoes: 1, descricao: 'Estádio fictício para testar templates, setores e partidas. Não representa um laudo ou evento real.' } }); stadiumsCreated++;
  }
  for (const sector of sectors) {
    if (await tx.setorEstadioIngressoV1.findUnique({ where: { id: sector.id } })) continue;
    await tx.setorEstadioIngressoV1.create({ data: { id: sector.id, estadioId: stadiumId, templateId: sector.templateId, nome: sector.nome,
      capacidadeFisica: sector.capacidade, capacidadeVendaPadrao: sector.capacidade, numerado: sector.numerado, possuiCadeiras: sector.numerado,
      corSetorHex: '#BE1E2D', portaoEntrada: 'Portão TESTE', portoesAcesso: ['Portão TESTE'],
      ...(sector.numerado ? { modeloCadeira: 'Plástica com encosto', larguraCadeiraCm: 45, corCadeira: 'Vermelha', possuiEncosto: true, nivel: 'Térreo', bloco: '101', exigeBlocoModulo: true, exigeNivelAnel: true, assentos: { create: Array.from({ length: 20 }, (_, i) => ({ nivel: 'Térreo', bloco: '101', fileira: i < 10 ? 'A' : 'B', numero: i % 10 + 1 })) } } : {}),
    } });
  }
  const categories = [
    { nome: 'Inteira TESTE', tipoCategoria: 'INTEIRA', percentualDesconto: 0 },
    { nome: 'Meia TESTE', tipoCategoria: 'MEIA', percentualDesconto: 50 },
  ];
  if (!await tx.templateVendaIngressoV1.findUnique({ where: { id: salesId } })) {
    await tx.templateVendaIngressoV1.create({ data: { id: salesId, estadioId: stadiumId, nome: '[TESTE APP] Venda Esporte',
      descricao: 'Inteira e meia para testar a gestão administrativa V1.', regrasSetor: { create: sectors.map(sector => ({
        setorId: sector.id, capacidadeLiberadaPadrao: sector.capacidade, precoBaseCentavos: sector.preco,
        categorias: { create: categories.map(category => ({ ...category, tipoCategoria: category.tipoCategoria, limiteCota: Math.floor(sector.capacidade / 2) })) },
      })) } } }); salesTemplatesCreated++;
  }
  for (const [index, match] of schedule.entries()) {
    const id = fixtureId(tenant.id, `match-${index}`);
    if (await tx.partidaIngressoV1.findUnique({ where: { id } })) continue;
    await tx.partidaIngressoV1.create({ data: { id, estadioId: stadiumId, templateVendaId: salesId,
      timeMandante: '[TESTE] Esporte', timeVisitante: match.awayTeam, dataPartida: match.startsAt,
      inicioVendas: match.salesOpenAt, fimVendas: match.salesCloseAt, status: 'PUBLICADA', vendasAtivas: true,
      portariaAtiva: false,
      alocacoesSetor: { create: sectors.map(sector => ({ setorId: sector.id, capacidadeLiberada: sector.capacidade,
        lotes: { create: categories.map(category => ({ nome: category.nome, tipoCategoria: category.tipoCategoria,
          precoCentavos: Math.round(sector.preco * (100 - category.percentualDesconto) / 100), quantidadeMaxima: Math.floor(sector.capacidade / 2) })) },
      })) },
    } }); matchesCreated++;
  }
  return { templatesCreated, stadiumsCreated, salesTemplatesCreated, matchesCreated };
}
