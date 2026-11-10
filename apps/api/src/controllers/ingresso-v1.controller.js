import { ingressoV1Service } from '../services/ingresso-v1.service.js';
import {
  assentoV1DeleteSchema,
  assentosV1GerarSchema,
  assentosV1QuerySchema,
  estadioV1CreateSchema,
  estadioV1DeleteSchema,
  estadioV1QuerySchema,
  estadioV1UpdateSchema,
  ingressoV1EmitirSchema,
  ingressosV1QuerySchema,
  mapaBlocoV1QuerySchema,
  partidaV1CreateSchema,
  partidaV1QuerySchema,
  partidaV1UpdateSchema,
  portariaV1InspecionarSchema,
  portariaV1LiberarSchema,
  setorV1CreateSchema,
  setorV1DeleteSchema,
  setorV1QuerySchema,
  setorV1UpdateSchema,
  templateSetorV1CreateSchema,
  templateSetorV1QuerySchema,
  templateSetorV1UpdateSchema,
  templateVendaV1CreateSchema,
  templateVendaV1QuerySchema,
  templateVendaV1UpdateSchema,
} from '../validators/ingresso-v1.js';

const query = (url) => Object.fromEntries(url.searchParams);

export const ingressoV1Controller = {
  templatesSetor: async ({ user, url }) => ({
    data: await ingressoV1Service.templatesSetor(user, templateSetorV1QuerySchema.parse(query(url))),
  }),
  criarTemplateSetor: async ({ user, body }) => ({
    status: 201,
    data: await ingressoV1Service.criarTemplateSetor(user, templateSetorV1CreateSchema.parse(body)),
  }),
  atualizarTemplateSetor: async ({ user, body }) => ({
    data: await ingressoV1Service.atualizarTemplateSetor(user, templateSetorV1UpdateSchema.parse(body)),
  }),
  excluirTemplateSetor: async ({ user, body }) => ({
    data: await ingressoV1Service.excluirTemplateSetor(user, estadioV1DeleteSchema.parse(body)),
  }),
  estadios: async ({ user, url }) => ({
    data: await ingressoV1Service.estadios(user, estadioV1QuerySchema.parse(query(url))),
  }),
  criarEstadio: async ({ user, body }) => ({
    status: 201,
    data: await ingressoV1Service.criarEstadio(user, estadioV1CreateSchema.parse(body)),
  }),
  atualizarEstadio: async ({ user, body }) => ({
    data: await ingressoV1Service.atualizarEstadio(user, estadioV1UpdateSchema.parse(body)),
  }),
  excluirEstadio: async ({ user, body }) => ({
    data: await ingressoV1Service.excluirEstadio(user, estadioV1DeleteSchema.parse(body)),
  }),
  setores: async ({ user, url }) => ({
    data: await ingressoV1Service.setores(user, setorV1QuerySchema.parse(query(url))),
  }),
  criarSetor: async ({ user, body }) => ({
    status: 201,
    data: await ingressoV1Service.criarSetor(user, setorV1CreateSchema.parse(body)),
  }),
  atualizarSetor: async ({ user, body }) => ({
    data: await ingressoV1Service.atualizarSetor(user, setorV1UpdateSchema.parse(body)),
  }),
  excluirSetor: async ({ user, body }) => ({
    data: await ingressoV1Service.excluirSetor(user, setorV1DeleteSchema.parse(body)),
  }),
  assentos: async ({ user, url }) => ({
    data: await ingressoV1Service.assentos(user, assentosV1QuerySchema.parse(query(url))),
  }),
  gerarAssentos: async ({ user, body }) => ({
    status: 201,
    data: await ingressoV1Service.gerarAssentos(user, assentosV1GerarSchema.parse(body)),
  }),
  excluirAssento: async ({ user, body }) => ({
    data: await ingressoV1Service.excluirAssento(user, assentoV1DeleteSchema.parse(body)),
  }),

  // Templates de Venda
  templatesVenda: async ({ user, url }) => ({
    data: await ingressoV1Service.templatesVenda(user, templateVendaV1QuerySchema.parse(query(url))),
  }),
  criarTemplateVenda: async ({ user, body }) => ({
    status: 201,
    data: await ingressoV1Service.criarTemplateVenda(user, templateVendaV1CreateSchema.parse(body)),
  }),
  atualizarTemplateVenda: async ({ user, body }) => ({
    data: await ingressoV1Service.atualizarTemplateVenda(user, templateVendaV1UpdateSchema.parse(body)),
  }),
  excluirTemplateVenda: async ({ user, body }) => ({
    data: await ingressoV1Service.excluirTemplateVenda(user, estadioV1DeleteSchema.parse(body)),
  }),

  // Partidas V1
  partidas: async ({ user, url }) => ({
    data: await ingressoV1Service.partidas(user, partidaV1QuerySchema.parse(query(url))),
  }),
  criarPartida: async ({ user, body }) => ({
    status: 201,
    data: await ingressoV1Service.criarPartida(user, partidaV1CreateSchema.parse(body)),
  }),
  atualizarPartida: async ({ user, body }) => ({
    data: await ingressoV1Service.atualizarPartida(user, partidaV1UpdateSchema.parse(body)),
  }),
  excluirPartida: async ({ user, body }) => ({
    data: await ingressoV1Service.excluirPartida(user, estadioV1DeleteSchema.parse(body)),
  }),

  // Mapa de Bloco e Ingressos V1
  mapaBloco: async ({ user, url }) => ({
    data: await ingressoV1Service.mapaBloco(user, mapaBlocoV1QuerySchema.parse(query(url))),
  }),
  ingressos: async ({ user, url }) => ({
    data: await ingressoV1Service.ingressos(user, ingressosV1QuerySchema.parse(query(url))),
  }),
  emitirIngresso: async ({ user, body }) => ({
    status: 201,
    data: await ingressoV1Service.emitirIngresso(user, ingressoV1EmitirSchema.parse(body)),
  }),
  cancelarIngresso: async ({ user, body }) => ({
    data: await ingressoV1Service.cancelarIngresso(user, estadioV1DeleteSchema.parse(body)),
  }),

  // Portaria V1
  inspecionarPortaria: async ({ user, body }) => ({
    data: await ingressoV1Service.inspecionarPortaria(user, portariaV1InspecionarSchema.parse(body)),
  }),
  liberarPortaria: async ({ user, body }) => ({
    data: await ingressoV1Service.liberarPortaria(user, portariaV1LiberarSchema.parse(body)),
  }),
};
