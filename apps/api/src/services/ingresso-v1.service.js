import { assertAdmin } from '../lib/ticket-rules.js';
import { ingressoV1EstadioModel } from '../models/ingresso-v1-estadio.model.js';
import { ingressoV1OperacaoModel } from '../models/ingresso-v1-operacao.model.js';

const guard = (work) => (user, input) => {
  assertAdmin(user);
  return work(user.id, input);
};

export const ingressoV1Service = {
  templatesSetor: (user, query) => {
    assertAdmin(user);
    return ingressoV1EstadioModel.listSectorTemplates(query);
  },
  criarTemplateSetor: guard((actorId, input) => ingressoV1EstadioModel.createSectorTemplate(actorId, input)),
  atualizarTemplateSetor: guard((actorId, input) => ingressoV1EstadioModel.updateSectorTemplate(actorId, input)),
  excluirTemplateSetor: guard((actorId, { id }) => ingressoV1EstadioModel.deleteSectorTemplate(actorId, id)),
  estadios: (user, query) => {
    assertAdmin(user);
    return ingressoV1EstadioModel.list(query);
  },
  criarEstadio: guard((actorId, input) => ingressoV1EstadioModel.create(actorId, input)),
  atualizarEstadio: guard((actorId, input) => ingressoV1EstadioModel.update(actorId, input)),
  excluirEstadio: guard((actorId, { id }) => ingressoV1EstadioModel.delete(actorId, id)),
  setores: (user, query) => {
    assertAdmin(user);
    return ingressoV1EstadioModel.setores(query);
  },
  criarSetor: guard((actorId, input) => ingressoV1EstadioModel.createSector(actorId, input)),
  atualizarSetor: guard((actorId, input) => ingressoV1EstadioModel.updateSector(actorId, input)),
  excluirSetor: guard((actorId, { id }) => ingressoV1EstadioModel.deleteSector(actorId, id)),
  assentos: (user, query) => {
    assertAdmin(user);
    return ingressoV1EstadioModel.seats(query);
  },
  gerarAssentos: guard((actorId, input) => ingressoV1EstadioModel.generateSeats(actorId, input)),
  excluirAssento: guard((actorId, input) => ingressoV1EstadioModel.deleteSeat(actorId, input)),

  // Templates de venda
  templatesVenda: (user, query) => {
    assertAdmin(user);
    return ingressoV1OperacaoModel.listSalesTemplates(query);
  },
  criarTemplateVenda: guard((actorId, input) => ingressoV1OperacaoModel.createSalesTemplate(actorId, input)),
  atualizarTemplateVenda: guard((actorId, input) => ingressoV1OperacaoModel.updateSalesTemplate(actorId, input)),
  excluirTemplateVenda: guard((actorId, { id }) => ingressoV1OperacaoModel.deleteSalesTemplate(actorId, id)),

  // Partidas V1
  partidas: (user, query) => {
    assertAdmin(user);
    return ingressoV1OperacaoModel.listMatches(query);
  },
  criarPartida: guard((actorId, input) => ingressoV1OperacaoModel.createMatch(actorId, input)),
  atualizarPartida: guard((actorId, input) => ingressoV1OperacaoModel.updateMatch(actorId, input)),
  excluirPartida: guard((actorId, { id }) => ingressoV1OperacaoModel.deleteMatch(actorId, id)),

  // Mapa de Bloco e Ingressos V1
  mapaBloco: (user, query) => {
    assertAdmin(user);
    return ingressoV1OperacaoModel.getBlockSeatMap(query);
  },
  ingressos: (user, query) => {
    assertAdmin(user);
    return ingressoV1OperacaoModel.listTickets(query);
  },
  emitirIngresso: guard((actorId, input) => ingressoV1OperacaoModel.issueTicket(actorId, input)),
  cancelarIngresso: guard((actorId, { id }) => ingressoV1OperacaoModel.cancelTicket(actorId, id)),

  // Portaria V1
  inspecionarPortaria: (user, input) => {
    assertAdmin(user);
    return ingressoV1OperacaoModel.inspectTicket(input);
  },
  liberarPortaria: guard((actorId, input) => ingressoV1OperacaoModel.admitTicket(actorId, input)),
};
