import { publicIntent } from '../payments/pix-contract.js';
import { processTerminalCommand } from './pagbank-counter.js';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { closeCounterReservation, releaseExpiredCounterOrders } from '../models/counter-reservation.js';
import { readBusinessSettings } from '../lib/business-settings.js';
import { serializable } from '../lib/business-rules.js';
import { AppError } from '../lib/errors.js';
import { issueTicketInTransaction } from '../models/ingresso-v1-operacao.model.js';

const ticketSelect = { id: true, status: true, chaveQr: true, codigoPortaria: true, nomeTitular: true,
  blocoEscolhido: true, fileiraEscolhida: true, assentoEscolhido: true,
  lote: { select: { nome: true } }, alocacao: { select: { setor: { select: { nome: true } } } } };
const orderSelect = { id: true, chaveBalcao: true, criadoEm: true, expiraEm: true, metodoBalcao: true, valorTotalCentavos: true, statusPagamento: true,
  partida: { select: { timeMandante: true, timeVisitante: true, dataPartida: true, estadio: { select: { nome: true } } } } };
const withTickets = { ...orderSelect, ingressos: { select: ticketSelect, orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }] } };

function openMatches(slug, now) {
  return { status: 'PUBLICADA', vendasAtivas: true, estadio: { ativo: true, tenant: { slug, active: true } },
    AND: [{ OR: [{ inicioVendas: null }, { inicioVendas: { lte: now } }] },
      { OR: [{ fimVendas: { gt: now } }, { fimVendas: null, dataPartida: { gt: now } }] }] };
}
export function createTicketCounter(client, slug, settings = env) {
  const own = userId => ({ usuarioId: userId, chaveBalcao: { not: null }, partida: { estadio: { tenant: { slug, active: true } } } });
  async function catalog() {
    await releaseExpiredCounterOrders(client, slug);
    const lots = await client.loteIngressoPartidaV1.findMany({
      where: { ativo: true, alocacao: { partida: openMatches(slug, new Date()), setor: { ativo: true } } },
      select: { id: true, nome: true, precoCentavos: true, quantidadeVendida: true, quantidadeMaxima: true, quantidadeReservada: true, alocacao: {
        select: { capacidadeLiberada: true, quantidadeVendida: true, quantidadeReservada: true,
          partida: { select: { id: true, timeMandante: true, timeVisitante: true, dataPartida: true } },
          setor: { select: { nome: true, numerado: true } } } } },
      orderBy: [{ alocacao: { partida: { dataPartida: 'asc' } } }, { nome: 'asc' }] });
    return lots.map(lot => {
      const a = lot.alocacao;
      return { id: lot.id, name: lot.nome, unitCents: lot.precoCentavos, match: a.partida, sector: a.setor, pixAvailable: settings.PAYMENT_MODE === 'sicredi',
        available: Math.min(lot.quantidadeMaxima - lot.quantidadeVendida - lot.quantidadeReservada, a.capacidadeLiberada - a.quantidadeVendida - a.quantidadeReservada) };
    }).filter(lot => lot.available > 0);
  }
  async function sale(userId, input) {
    await releaseExpiredCounterOrders(client, slug);
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const previous = async tx => {
      const row = await tx.pedidoIngressoV1.findFirst({ where: { ...own(userId), chaveBalcao: input.key }, select: { ...withTickets, resumoBalcao: true } });
      if (!row) return null;
      const { resumoBalcao, ...order } = row;
      if (resumoBalcao !== digest) throw new AppError(409, 'COUNTER_KEY_CONFLICT', 'Esta referência pertence a outra venda. Consulte suas vendas.');
      return order;
    };
    try {
      return await serializable(client, async tx => {
        const actor = await tx.user.findFirst({ where: { id: userId, active: true, role: { in: ['ADMIN', 'TICKET_SELLER'] } }, select: { id: true } });
        if (!actor) throw new AppError(403, 'TICKET_SELLER_REQUIRED', 'Conta de bilheteria indisponível.');
        const saved = await previous(tx);
        if (saved) return saved;
        const lot = await tx.loteIngressoPartidaV1.findFirst({ where: { id: input.lotId, ativo: true,
          alocacao: { setor: { ativo: true }, partida: openMatches(slug, new Date()) } }, include: { alocacao: { include: { setor: true, partida: true } } } });
        if (!lot) throw new AppError(409, 'COUNTER_CLOSED', 'As vendas deste lote estão encerradas.');
        if (lot.precoCentavos !== input.unitCents) throw new AppError(409, 'PRICE_CHANGED', 'O preço mudou. Atualize a bilheteria antes de receber.');
        if (lot.alocacao.setor.numerado !== Boolean(input.seat)) throw new AppError(422, 'INVALID_SEAT', 'Confira a acomodação deste setor.');
        const business = await readBusinessSettings(tx);
        if (input.method === 'PAGBANK' && (!settings.PAGBANK_TERMINAL_TOKEN || input.quantity * lot.precoCentavos < 100)) {
          throw new AppError(422, 'TERMINAL_UNAVAILABLE', 'A Moderninha precisa estar habilitada e o total deve ser de pelo menos R$ 1,00.');
        }
        if (input.method === 'PIX' && settings.PAYMENT_MODE !== 'sicredi') throw new AppError(503, 'SICREDI_DISABLED', 'O Pix Sicredi não está habilitado.');
        if (input.method === 'PIX' && lot.precoCentavos <= 0) throw new AppError(422, 'FREE_TICKET', 'Este lote é gratuito. Emita a cortesia sem gerar Pix.');
        const match = lot.alocacao.partida;
        const expiresAt = new Date(Math.min(Date.now() + business.ticketReservationMinutes * 60000, (match.fimVendas || match.dataPartida).getTime()));
        const order = await tx.pedidoIngressoV1.create({ data: { usuarioId: userId, partidaId: lot.alocacao.partidaId,
          statusPagamento: 'PENDENTE', expiraEm: expiresAt, chaveBalcao: input.key, resumoBalcao: digest, metodoBalcao: input.method, valorTotalCentavos: input.quantity * lot.precoCentavos } });
        if (input.method === 'PIX') {
          await tx.gatewayIntent.create({ data: {
            provider: 'sicredi', environment: settings.SICREDI_PIX_ENV, counterOrderId: order.id, generation: 'counter:' + order.id,
            amountCents: order.valorTotalCentavos, expiresAt, providerReference: settings.SICREDI_PIX_TXID_PREFIX + randomUUID().replaceAll('-', ''),
            snapshot: { userId, receivingKeyHash: createHash('sha256').update(settings.SICREDI_PIX_RECEIVING_KEY).digest('hex') },
          } });
        }
        for (let i = 0; i < input.quantity; i++) {
          await issueTicketInTransaction(tx, userId, { partidaId: order.partidaId, alocacaoId: lot.alocacaoId, loteId: lot.id,
            cpfTitular: input.cpf, nomeTitular: 'CPF final ' + input.cpf.slice(-4),
            ...(input.seat && { blocoEscolhido: input.seat.block, fileiraEscolhida: input.seat.row, assentoEscolhido: input.seat.first + i }) }, order);
        }
        await tx.auditLog.create({ data: { action: 'RESERVA_BALCAO_CRIADA', actorId: userId, entityId: order.id,
          details: { method: input.method, quantity: input.quantity, amountCents: order.valorTotalCentavos } } });
        return tx.pedidoIngressoV1.findUniqueOrThrow({ where: { id: order.id }, select: withTickets });
      });
    } catch (error) {
      if (error.code === 'P2002') {
        const saved = await previous(client);
        if (saved) return saved;
      }
      throw error;
    }
  }
  async function receipt(userId, key) {
    await releaseExpiredCounterOrders(client, slug);
    const result = await client.pedidoIngressoV1.findFirst({ where: { ...own(userId), chaveBalcao: key }, select: withTickets });
    if (!result) throw new AppError(404, 'COUNTER_NOT_FOUND', 'Venda não localizada nesta conta.');
    return result;
  }
  async function settle(userId, key, pay) {
    return serializable(client, async tx => {
      const actor = await tx.user.findFirst({ where: { id: userId, active: true, role: { in: ['ADMIN', 'TICKET_SELLER'] } }, select: { id: true } });
      if (!actor) throw new AppError(403, 'TICKET_SELLER_REQUIRED', 'Conta de bilheteria indisponível.');
      const order = await tx.pedidoIngressoV1.findFirst({ where: { ...own(userId), chaveBalcao: key }, include: { partida: { select: { status: true } } } });
      if (!order) throw new AppError(404, 'COUNTER_NOT_FOUND', 'Reserva não localizada nesta conta.');
      if (order.metodoBalcao === 'PAGBANK' && (pay || order.pagbankTentativa)) throw new AppError(409, 'COUNTER_TERMINAL_ONLY', 'Conclua a cobrança na Moderninha que assumiu a venda.');
      if (order.metodoBalcao === 'PIX' && pay) throw new AppError(409, 'COUNTER_PIX_BANK_ONLY', 'A confirmação do Pix é feita pelo Sicredi.');
      if (order.statusPagamento === 'PENDENTE') {
        if (order.metodoBalcao === 'PIX') await tx.gatewayIntent.update({ where: { counterOrderId: order.id }, data: {
          cancelRequestedAt: new Date(), nextAttemptAt: new Date(), wakeVersion: { increment: 1 }, pixPayload: null } });
        const expired = order.expiraEm <= new Date();
        const canceled = !pay || ['CANCELADA', 'ENCERRADA'].includes(order.partida.status);
        await closeCounterReservation(tx, order, expired ? 'EXPIRADO' : canceled ? 'CANCELADO' : 'PAGO', expired ? null : userId);
      }
      return tx.pedidoIngressoV1.findUniqueOrThrow({ where: { id: order.id }, select: withTickets });
    });
  }
  async function pix(userId, key) {
    const intent = await client.gatewayIntent.findFirst({ where: { counterOrder: { ...own(userId), chaveBalcao: key } } });
    if (!intent) throw new AppError(404, 'COUNTER_PIX_NOT_FOUND', 'Cobrança da bilheteria não localizada.');
    const value = publicIntent(intent);
    if (settings.PAYMENT_MODE !== 'sicredi' || intent.environment !== settings.SICREDI_PIX_ENV) return { ...value, pixPayload: null, failureCode: 'PAYMENT_PROVIDER_NOT_ACTIVE' };
    return value;
  }
  async function terminalQueue(userId, includePix = false) {
    await releaseExpiredCounterOrders(client, slug);
    return client.pedidoIngressoV1.findMany({ where: { ...own(userId), metodoBalcao: { in: includePix ? ['PAGBANK','PIX'] : ['PAGBANK'] }, statusPagamento: 'PENDENTE' },
      select: orderSelect, orderBy: { criadoEm: 'asc' } });
  }
  return { sale, catalog, receipt, settle, pix, terminalQueue,
    terminal: (userId, command) => processTerminalCommand(client, own(userId), userId, command),
    recent: userId => client.pedidoIngressoV1.findMany({ where: own(userId), select: orderSelect, orderBy: { criadoEm: 'desc' }, take: 30 }) };
}
export const ticketCounter = createTicketCounter(db, env.TENANT_SLUG);
