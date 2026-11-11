import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { createSicrediClient } from '../payments/sicredi/client.js';
import { createSicrediStore } from '../models/sicredi.store.js';
import { asaasStore } from './asaas.service.js';
import { publicIntent, ticketGeneration } from '../payments/pix-contract.js';
import { AppError } from '../lib/errors.js';

export const sicrediStore = createSicrediStore(db, { settings: env, api: createSicrediClient(env) });
export const currentPixStore = env.PAYMENT_MODE === 'sicredi' ? sicrediStore : asaasStore;
export function createPixQueries(client, settings = env) {
  const render = (row) => {
    const value = publicIntent(row);
    const active = row.provider === settings.PAYMENT_MODE && row.environment === (row.provider === 'sicredi' ? settings.SICREDI_PIX_ENV : settings.ASAAS_ENVIRONMENT);
    return active ? value : { ...value, pixPayload: null, failureCode: value.state === 'PENDING' ? 'PAYMENT_PROVIDER_NOT_ACTIVE' : value.failureCode };
  };
  const owned = (userId) => ({ OR: [{ ticket: { userId } }, { shopOrder: { userId } }, { charge: { wallet: { userId } } }] });
  return {
    async ownIntent(userId, id) {
      const intent = await client.gatewayIntent.findFirst({ where: { id, ...owned(userId) } });
      if (!intent) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Pagamento não encontrado na sua conta.');
      return render(intent);
    },
    async ticketIntent(userId, ticketId) {
      const ticket = await client.ticket.findFirst({ where: { id: ticketId, userId }, include: { payment: true } });
      if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Pedido não encontrado.');
      const generation = ticketGeneration(ticket);
      const receipt = ticket.payment && ['ASAAS', 'SICREDI'].includes(ticket.payment.method) ? ticket.payment.reference.split(':').slice(1).join(':') : null;
      const intent = await client.gatewayIntent.findFirst({ where: { ticketId, OR: [{ generation: `${settings.ASAAS_ENVIRONMENT}:${generation}` }, { generation: `sicredi:${settings.SICREDI_PIX_ENV}:${generation}` }, ...(receipt ? [{ providerReference: receipt }] : [])] }, orderBy: { createdAt: 'desc' } });
      return intent ? render(intent) : null;
    },
    async shopIntent(userId, shopOrderId) {
      if (!await client.shopOrder.findFirst({ where: { id: shopOrderId, userId } })) throw new AppError(404, 'SHOP_NOT_FOUND', 'Pedido não encontrado.');
      const intent = await client.gatewayIntent.findUnique({ where: { shopOrderId } }); return intent ? render(intent) : null;
    },
    async adminList({ limit, offset }) {
      return (await client.gatewayIntent.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, skip: offset })).map((row) => ({ ...publicIntent(row), providerReference: row.providerReference, pixEndToEndId: row.pixEndToEndId, attempts: row.attempts, updatedAt: row.updatedAt }));
    },
  };
}
export const pixQueries = createPixQueries(db);
export async function pixStoreForIntent(id) {
  const intent = await db.gatewayIntent.findUnique({ where: { id } });
  if (!intent) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Pagamento não encontrado.');
  const expected = intent.provider === 'sicredi' ? env.SICREDI_PIX_ENV : env.ASAAS_ENVIRONMENT;
  if (intent.environment !== expected || intent.provider !== env.PAYMENT_MODE) throw new AppError(409, 'PAYMENT_PROVIDER_NOT_ACTIVE', 'Esta cobrança pertence a outro provedor ou ambiente. Consulte o histórico; a conciliação exige a configuração original.');
  return intent.provider === 'sicredi' ? sicrediStore : asaasStore;
}
export function startPaymentWorker({ store = currentPixStore, settings = env, logger = console } = {}) {
  if (!['asaas', 'sicredi'].includes(settings.PAYMENT_MODE)) return async () => {};
  let stopping = false, timer, active;
  const run = () => {
    active = store.tick().catch(() => logger.error('PIX_WORKER_RETRY: conciliação pendente; a próxima rodada retoma as mesmas referências.')).finally(() => { if (!stopping) timer = setTimeout(run, settings.PAYMENT_WORKER_INTERVAL_MS).unref(); });
  };
  run(); return async () => { stopping = true; clearTimeout(timer); await active; };
}
