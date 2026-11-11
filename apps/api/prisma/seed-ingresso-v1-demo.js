import { db } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { ingressoV1Service as service } from '../src/services/ingresso-v1.service.js';
import * as schema from '../src/validators/ingresso-v1.js';

// Explicit, local-only fixtures. Reuse existing records without resetting admin
// edits, payments or admissions. No gateway calls or changes to legacy tickets.
const names = {
  sectorTemplate: '[TESTE LOCAL] Arquibancada numerada V1',
  stadium: '[TESTE LOCAL] Arena Esporte V1',
  sector: '[TESTE LOCAL] Arquibancada principal',
  salesTemplate: '[TESTE LOCAL] Venda de ingressos V1',
  home: '[TESTE LOCAL] Esporte',
  away: 'Adversário de demonstração',
};
async function main() {
  const database = new URL(env.DATABASE_URL);
  if (env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname))
    throw new Error('Este seed é exclusivo do banco local de desenvolvimento.');
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) throw new Error('Configure ADMIN_EMAIL no .env da API para identificar o responsável pelo seed.');
  const actor = await db.user.findFirst({ where: { email, role: 'ADMIN', active: true }, select: { id: true, role: true, active: true } });
  if (!actor) throw new Error('Administrador configurado não encontrado ou inativo. Prepare a conta administrativa primeiro.');

  let template = (await service.templatesSetor(actor, { ativo: 'all' })).find((row) => row.slug === 'teste-local-arquibancada-v1' || row.nome === names.sectorTemplate);
  if (!template) template = await service.criarTemplateSetor(actor, schema.templateSetorV1CreateSchema.parse({
    slug: 'teste-local-arquibancada-v1', nome: names.sectorTemplate,
    descricao: 'Exemplo local: um bloco, duas fileiras e dez cadeiras por fileira. Sem evento real.',
    corSetorHex: '#BE1E2D', tipoTorcida: 'MANDANTE', numerado: true,
    exigeBlocoModulo: true, exigeNivelAnel: true, nivel: 'Térreo',
    capacidadeFisica: 20, capacidadeVendaPadrao: 20,
    possuiCadeiras: true, modeloCadeira: 'Plástica com encosto', corCadeira: 'Vermelha', larguraCadeiraCm: 45, possuiEncosto: true,
    acessoExterno: 'Acesso de demonstração', portaoEntrada: 'Portão Teste 01', portoesAcesso: ['Portão Teste 01'],
    instrucaoAcomodacao: 'Confira bloco, fileira e cadeira indicados no ingresso de teste.',
    avisosObrigatoriosSetor: 'TESTE LOCAL — não representa acesso a uma partida real.',
    tipoValidacao: 'QR_CODE_ESTATICO', orientacaoSolar: 'SOMBRA', ativo: true,
    nivelRegras: [{ nomeNivel: 'Térreo', blocoInicio: 101, blocoFim: 101, fileiraInicio: 'A', fileiraFim: 'B', cadeirasPorFileira: 10, excecoes: [] }],
  }));

  let stadium = (await service.estadios(actor, { ativo: 'all' })).find((row) => row.nome === names.stadium);
  if (!stadium) stadium = await service.criarEstadio(actor, schema.estadioV1CreateSchema.parse({
    nome: names.stadium, nomePopular: 'Arena de testes', cidade: 'Patos', estado: 'PB',
    descricao: 'Cadastro fictício para testar a gestão V1. Endereço e laudo não representam um estádio real.',
    capacidadeMaxima: 20, capacidadeOperacionalLaudo: 20, quantidadePortoes: 1,
    templatesSetorIds: [template.id],
    setoresConfig: [{ templateId: template.id, nome: names.sector, acessoExterno: 'Acesso de demonstração', portaoEntrada: 'Portão Teste 01', localizacao: 'Térreo — bloco 101' }],
    ativo: true,
  }));
  let sectors = await service.setores(actor, { estadioId: stadium.id, incluirInativos: 'true' });
  if (!sectors.length) {
    await service.atualizarEstadio(actor, schema.estadioV1UpdateSchema.parse({ id: stadium.id, templatesSetorIds: [template.id], setoresConfig: [{ templateId: template.id, nome: names.sector }] }));
    sectors = await service.setores(actor, { estadioId: stadium.id, incluirInativos: 'true' });
  }
  const sector = sectors.find((row) => row.templateId === template.id || row.nome === names.sector);
  if (!sector) throw new Error('O setor de teste foi removido ou substituído. Confira o estádio antes de repetir o seed.');
  let seats = await service.assentos(actor, { setorId: sector.id, incluirInativos: 'true' });
  if (!seats.length) {
    await service.gerarAssentos(actor, schema.assentosV1GerarSchema.parse({ setorId: sector.id, bloco: '101', fileiraInicial: 'A', quantidadeFileiras: 2, numeroInicial: 1, quantidadePorFileira: 10, tipo: 'Cadeira de demonstração' }));
    seats = await service.assentos(actor, { setorId: sector.id, incluirInativos: 'true' });
  }

  let sales = (await service.templatesVenda(actor, { estadioId: stadium.id })).find((row) => row.nome === names.salesTemplate);
  if (!sales) sales = await service.criarTemplateVenda(actor, schema.templateVendaV1CreateSchema.parse({
    estadioId: stadium.id, nome: names.salesTemplate, descricao: 'Inteira R$ 30,00, meia R$ 15,00 e cortesia R$ 0,00. Somente teste local.',
    regrasSetor: [{ setorId: sector.id, capacidadeLiberadaPadrao: 20, precoBaseCentavos: 3000, categorias: [
      { nome: 'Inteira de teste', tipoCategoria: 'INTEIRA', percentualDesconto: 0, limiteCota: 16 },
      { nome: 'Meia de teste', tipoCategoria: 'MEIA', percentualDesconto: 50, limiteCota: 2 },
      { nome: 'Cortesia de teste', tipoCategoria: 'CORTESIA', percentualDesconto: 100, limiteCota: 2 },
    ] }],
  }));
  let match = (await service.partidas(actor, { estadioId: stadium.id, status: 'all' })).find((row) => row.templateVendaId === sales.id && row.timeMandante === names.home && row.timeVisitante === names.away);
  if (!match) {
    const kickoff = new Date(); kickoff.setUTCDate(kickoff.getUTCDate() + 7); kickoff.setUTCHours(19, 0, 0, 0);
    match = await service.criarPartida(actor, schema.partidaV1CreateSchema.parse({
      estadioId: stadium.id, templateVendaId: sales.id, timeMandante: names.home, timeVisitante: names.away,
      dataPartida: kickoff.toISOString(), inicioVendas: new Date().toISOString(), fimVendas: new Date(kickoff.getTime() - 3600000).toISOString(),
      status: 'PUBLICADA', vendasAtivas: true, portariaAtiva: true, portariaAbreEm: new Date(Date.now() - 60000).toISOString(),
    }));
  }
  // Only this explicit test fixture is opened ahead of kickoff. Never changes real matches.
  if (!match.portariaAtiva) match = await service.atualizarPartida(actor, schema.partidaV1UpdateSchema.parse({ id: match.id, portariaAtiva: true, portariaAbreEm: new Date(Date.now() - 60000).toISOString() }));
  const allocation = match.alocacoesSetor.find((row) => row.setorId === sector.id);
  const complimentary = allocation?.lotes.find((row) => row.tipoCategoria === 'CORTESIA' && row.precoCentavos === 0 && row.ativo);
  if (!complimentary) throw new Error('O lote gratuito de teste foi alterado. Nenhum ingresso pago será emitido pelo seed.');
  const tickets = await service.ingressos(actor, { partidaId: match.id, status: 'all' });
  const examples = [];
  for (const [seat, holder, alreadyUsed] of [[1, 'Torcedor Teste Local V1 — disponível', false], [2, 'Torcedor Teste Local V1 — utilizado', true]]) {
    let ticket = tickets.find((row) => row.nomeTitular === holder);
    const created = !ticket;
    if (!ticket) ticket = await service.emitirIngresso(actor, schema.ingressoV1EmitirSchema.parse({
      partidaId: match.id, alocacaoId: allocation.id, loteId: complimentary.id, nomeTitular: holder,
      blocoEscolhido: 101, fileiraEscolhida: 'A', assentoEscolhido: seat,
    }));
    // Only mark a newly created example as used; a rerun never resets admission.
    if (created && alreadyUsed) ticket = (await service.liberarPortaria(actor, schema.portariaV1LiberarSchema.parse({ chaveQr: ticket.chaveQr, partidaId: match.id, alocacaoId: allocation.id, requestKey: `seed-v1-${ticket.id}`, catracaId: 'TESTE-LOCAL-01' }))).ticket;
    const inspected = ticket.status === 'VENDIDO' ? await service.inspecionarPortaria(actor, schema.portariaV1InspecionarSchema.parse({ chaveQr: ticket.chaveQr, partidaId: match.id, alocacaoId: allocation.id })) : ticket;
    examples.push({ id: inspected.id, titular: inspected.nomeTitular, status: inspected.status, bloco: inspected.blocoEscolhido, fileira: inspected.fileiraEscolhida, assento: inspected.assentoEscolhido });
  }
  console.log(JSON.stringify({
    estadio: stadium.nome, templateSetor: template.nome, templateVenda: sales.nome, assentos: seats.length,
    partida: `${match.timeMandante} x ${match.timeVisitante}`, dataPartida: match.dataPartida,
    lotes: allocation.lotes.map((row) => ({ nome: row.nome, precoCentavos: row.precoCentavos, quantidade: row.quantidadeMaxima })),
    ingressos: examples,
    observacao: 'Abra Pedidos e ingressos V1 para ver o QR. Use o ingresso disponível na Portaria unificada V1. Nenhuma cobrança externa foi criada.',
  }, null, 2));
}
try { await main(); }
catch (error) {
  console.error(error?.name === 'PrismaClientValidationError' ? 'Cliente Prisma incompatível com o schema. Execute npm run db:generate.' : `${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
} finally { await db.$disconnect(); }
