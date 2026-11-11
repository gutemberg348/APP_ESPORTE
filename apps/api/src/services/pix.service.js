import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { createSicrediClient } from '../payments/sicredi/client.js';
import { createSicrediStore } from '../models/sicredi.store.js';
import { publicIntent, ticketGeneration } from '../payments/pix-contract.js';
import { AppError } from '../lib/errors.js';

export const sicrediStore = createSicrediStore(db, { settings: env, api: createSicrediClient(env) });
export const currentPixStore = sicrediStore;
export function createPixQueries(client, settings = env) {
  const render = (row) => {
    const value = publicIntent(row);
    const active = row.provider === 'sicredi' && settings.PAYMENT_MODE === 'sicredi' && row.environment === settings.SICREDI_PIX_ENV;
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
      const intent = await client.gatewayIntent.findFirst({ where: { ticketId, OR: [{ provider: 'asaas', generation: { in: [`sandbox:${generation}`, `production:${generation}`] } }, { generation: `sicredi:${settings.SICREDI_PIX_ENV}:${generation}` }, ...(receipt ? [{ providerReference: receipt }] : [])] }, orderBy: { createdAt: 'desc' } });
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
  const expected = env.SICREDI_PIX_ENV;
  if (intent.provider !== 'sicredi' || intent.environment !== expected || env.PAYMENT_MODE !== 'sicredi') throw new AppError(409, 'PAYMENT_PROVIDER_NOT_ACTIVE', 'Este pagamento está disponível somente para consulta ou pertence a um ambiente inativo. A integração ativa é Sicredi.');
  return sicrediStore;
}
export function startPaymentWorker({ store = currentPixStore, settings = env, logger = console } = {}) {
  if (settings.PAYMENT_MODE !== 'sicredi') return async () => {};
  let stopping = false, timer, active;
  const run = () => {
    active = store.tick().catch(() => logger.error('PIX_WORKER_RETRY: conciliação pendente; a próxima rodada retoma as mesmas referências.')).finally(() => { if (!stopping) timer = setTimeout(run, settings.PAYMENT_WORKER_INTERVAL_MS).unref(); });
  };
  run(); return async () => { stopping = true; clearTimeout(timer); await active; };
}
