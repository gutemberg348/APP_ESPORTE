import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { serializable } from '../lib/business-rules.js';
import { inventoryWhere, occupiedQuantity } from '../lib/ticket-rules.js';
import { recordTicketFinancial } from '../lib/ticket-finance.js';
import { settleShopOrder, reverseShopOrder, shopOrderInclude } from '../lib/shop-inventory.js';
import { pixCents, txidPattern, e2ePattern } from '../payments/sicredi/client.js';
import { ticketGeneration, publicIntent } from '../payments/pix-contract.js';

const fault = (code, message, status = 409) => new AppError(status, code, message);
const webhookSchema = z.object({ pix: z.array(z.object({ txid: z.string().regex(txidPattern), endToEndId: z.string().regex(e2ePattern) }).passthrough()).max(100) }).passthrough();
const receiptRef = (intent) => `SICREDI:${intent.providerReference}`;
const owner = (userId) => ({ OR: [{ ticket: { userId } }, { shopOrder: { userId } }] });
const opaque = (prefix) => `${prefix}${randomUUID().replace(/-/g, '')}`;
export function createSicrediStore(db, { settings, api, now = () => new Date() }) {
  const environment = settings.SICREDI_PIX_ENV;
  const scope = { provider: 'sicredi', environment };
  const active = () => { if (settings.PAYMENT_MODE !== 'sicredi') throw fault('SICREDI_DISABLED', 'O Pix Sicredi não está habilitado.', 503); };
  const audit = (tx, actorId, action, entityId, details) => tx.auditLog.create({ data: { actorId, action, entityId, details } });
  function fence(row, token) {
    if (!row || row.provider !== 'sicredi' || row.environment !== environment || row.lockToken !== token || row.lockedUntil <= now()) throw fault('SICREDI_LEASE_LOST', 'Outro processo retomou esta conciliação.');
  }
  async function write(id, token, data) {
    if ((await db.gatewayIntent.updateMany({ where: { id, ...scope, lockToken: token, lockedUntil: { gt: now() } }, data })).count !== 1) throw fault('SICREDI_LEASE_LOST', 'Outro processo retomou esta conciliação.');
    const current = await db.gatewayIntent.findUnique({ where: { id } }); fence(current, token); return current;
  }
  async function createIntent(userId, id, shop = false) {
    active();
    return serializable(db, async (tx) => {
      const item = shop ? await tx.shopOrder.findFirst({ where: { id, userId }, include: { payment: true } }) : await tx.ticket.findFirst({ where: { id, userId }, include: { payment: true } });
      if (!item || item.deletedAt) throw fault('PAYMENT_NOT_FOUND', 'Pedido não encontrado.', 404);
      const amountCents = shop ? item.totalCents : item.priceCents;
      if (item.payment || item.status !== 'PENDING' || !item.expiresAt || item.expiresAt <= now() || amountCents <= 0) throw fault('ORDER_NOT_PAYABLE', 'Este pedido não está disponível para pagamento.');
      const where = shop ? { shopOrderId: id } : { ticketId: id };
      const previous = await tx.gatewayIntent.findFirst({ where, orderBy: { createdAt: 'desc' } });
      const generation = `sicredi:${environment}:${shop ? `shop:${id}` : ticketGeneration(item)}`;
      if (previous) {
        if ((previous.provider !== 'sicredi' || previous.environment !== environment) && (shop || !['CANCELED', 'REFUNDED'].includes(previous.state))) throw fault('PAYMENT_PROVIDER_CONFLICT', 'Este pedido já tem cobrança em outro provedor ou ambiente. Concilie a cobrança original antes de gerar outra.');
        if (previous.provider === 'sicredi' && previous.environment === environment && previous.generation === generation) return publicIntent(previous, now());
        if (!['CANCELED', 'REFUNDED'].includes(previous.state)) throw fault('PAYMENT_GENERATION_CONFLICT', 'A cobrança anterior deste pedido ainda precisa ser conciliada.');
      }
      const intent = await tx.gatewayIntent.create({ data: { ...scope, ...where, generation, amountCents, expiresAt: item.expiresAt, providerReference: opaque(settings.SICREDI_PIX_TXID_PREFIX), snapshot: { userId, receivingKeyHash: createHash('sha256').update(settings.SICREDI_PIX_RECEIVING_KEY).digest('hex'), ...(shop ? {} : { reservationGeneration: ticketGeneration(item) }) } } });
      return publicIntent(intent, now());
    });
  }
  async function checkedRemote(intent) {
    const charge = await api.charge(intent.providerReference);
    if (!charge) return null;
    if (charge.txid !== intent.providerReference || charge.chave !== settings.SICREDI_PIX_RECEIVING_KEY || pixCents(charge.valor?.original) !== intent.amountCents || charge.valor.modalidadeAlteracao !== 0 || !['ATIVA', 'CONCLUIDA', 'REMOVIDA_PELO_USUARIO_RECEBEDOR', 'REMOVIDA_PELO_PSP'].includes(charge.status)) throw fault('SICREDI_PAYMENT_MISMATCH', 'A cobrança bancária diverge do pedido.');
    const expectedKey = createHash('sha256').update(settings.SICREDI_PIX_RECEIVING_KEY).digest('hex');
    if (intent.snapshot.receivingKeyHash !== expectedKey) throw fault('SICREDI_ACCOUNT_CHANGED', 'A conta recebedora desta cobrança foi alterada. Concilie na conta original.');
    const receipts = charge.pix || [];
    if (receipts.length > 1 || (charge.status === 'CONCLUIDA' && receipts.length !== 1)) throw fault('SICREDI_RECEIPT_REVIEW', 'Recebimentos divergentes exigem conferência no banco.');
    if (charge.status === 'ATIVA' && charge.pixCopiaECola != null && (typeof charge.pixCopiaECola !== 'string' || charge.pixCopiaECola.length > 4096 || !charge.pixCopiaECola.startsWith('000201'))) throw fault('SICREDI_QR_UNAVAILABLE', 'O banco ainda não forneceu um Pix copia e cola válido.');
    if (receipts.length && charge.status !== 'CONCLUIDA') throw fault('SICREDI_RECEIPT_REVIEW', 'O banco ainda não concluiu esta cobrança.');
    let received = null;
    if (receipts.length) {
      const hint = receipts[0];
      if (!e2ePattern.test(hint.endToEndId || '') || hint.txid !== intent.providerReference || pixCents(hint.valor) !== intent.amountCents) throw fault('SICREDI_RECEIPT_MISMATCH', 'O recebimento Pix diverge da cobrança.');
      received = await api.pix(hint.endToEndId);
      if (!received || received.endToEndId !== hint.endToEndId || received.txid !== intent.providerReference || pixCents(received.valor) !== intent.amountCents || !Number.isFinite(Date.parse(received.horario))) throw fault('SICREDI_RECEIPT_MISMATCH', 'Não foi possível confirmar TXID, valor e E2E no banco.');
      if (intent.pixEndToEndId && intent.pixEndToEndId !== received.endToEndId) throw fault('SICREDI_RECEIPT_MISMATCH', 'O E2E recebido diverge da confirmação anterior.');
    }
    return { charge, received };
  }
  function refunded(received, intent) {
    const refunds = received?.devolucoes || [], ids = new Set(); let total = 0;
    for (const row of refunds) {
      if (typeof row.id !== 'string' || ids.has(row.id) || !['EM_PROCESSAMENTO', 'DEVOLVIDO', 'NAO_REALIZADO'].includes(row.status)) throw fault('SICREDI_REFUND_MISMATCH', 'Devoluções bancárias inconsistentes.');
      ids.add(row.id); if (row.status === 'DEVOLVIDO') total += pixCents(row.valor);
    }
    if (total > intent.amountCents || total < intent.refundedCents) throw fault('SICREDI_REFUND_MISMATCH', 'O valor devolvido diverge da conciliação anterior.');
    return { total, pending: refunds.some((row) => row.status === 'EM_PROCESSAMENTO') };
  }
  async function apply(id, token, remote) {
    return serializable(db, async (tx) => {
      const intent = await tx.gatewayIntent.findUnique({ where: { id } }); fence(intent, token);
      const { charge, received } = remote, refunds = refunded(received, intent);
      // A paid observation cannot regress because of a stale provider response.
      if (!received && (intent.pixEndToEndId || ['RECEIVED', 'REFUNDED', 'PARTIAL_REFUND'].includes(intent.state))) throw fault('SICREDI_STATE_REGRESSION', 'O banco retornou uma situação anterior ao recebimento já confirmado.');
      let state = refunds.total === intent.amountCents ? 'REFUNDED' : refunds.total > 0 ? 'PARTIAL_REFUND' : refunds.pending || intent.refundRequestedAt ? 'REFUNDING' : received && charge.status === 'CONCLUIDA' ? 'RECEIVED' : charge.status === 'ATIVA' ? 'PENDING' : 'CANCELED';
      const reference = receiptRef(intent), blocked = refunds.pending || Boolean(intent.refundRequestedAt) || refunds.total > 0;
      if (intent.ticketId) {
        const ticket = await tx.ticket.findUnique({ where: { id: intent.ticketId }, include: { payment: true, user: true, match: true, sector: true } });
        if (ticket?.payment?.reference === reference) {
          if (blocked && (ticket.status !== 'CANCELED' || ticket.payment.refundedCents < refunds.total)) {
            await tx.ticketPayment.update({ where: { ticketId: ticket.id }, data: { refundedCents: refunds.total } });
            await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'CANCELED', voidedQuantity: ticket.quantity - ticket.usedQuantity, entryVersion: { increment: 1 }, entryToken: null } });
            await tx.ticketAccessCode.deleteMany({ where: { ticketId: ticket.id } });
          }
        } else if (state === 'RECEIVED') {
          let payable = ticket && !ticket.payment && !ticket.deletedAt && ticket.user.active && ticket.status === 'PENDING' && intent.snapshot.reservationGeneration === ticketGeneration(ticket) && !intent.cancelRequestedAt && intent.expiresAt > now() && ticket.match.startsAt > now();
          if (payable) {
            const occupied = await tx.ticket.aggregate({ where: { id: { not: ticket.id }, sectorId: ticket.sectorId, ...inventoryWhere(now()) }, _sum: { quantity: true, voidedQuantity: true } });
            payable = occupiedQuantity(occupied._sum) + ticket.quantity <= ticket.sector.capacity && intent.expiresAt > now() && ticket.match.startsAt > now();
          }
          if (payable) {
            await tx.ticketPayment.create({ data: { ticketId: ticket.id, method: 'SICREDI', amountCents: intent.amountCents, reference, confirmedAt: now() } });
            await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'ISSUED', expiresAt: null, entryVersion: { increment: 1 }, entryToken: null } });
            await audit(tx, ticket.userId, 'TICKET_SICREDI_RECEIVED', ticket.id, { intentId: id, txid: intent.providerReference, endToEndId: received.endToEndId, amountCents: intent.amountCents });
          } else { state = 'REFUNDING'; await tx.gatewayIntent.update({ where: { id }, data: { refundRequestedAt: intent.refundRequestedAt || now(), failureCode: 'TICKET_NO_LONGER_PAYABLE' } }); }
        }
        const financialTicket = await tx.ticket.findUnique({ where: { id: intent.ticketId }, include: { payment: true } });
        if (financialTicket?.payment?.reference === reference) await recordTicketFinancial(tx, financialTicket, { blocked: blocked && state !== 'REFUNDED', reason: 'Pix Sicredi conciliado; tarifa estimada conforme configuração financeira' });
      } else if (intent.shopOrderId) {
        if (blocked) await reverseShopOrder(tx, intent, refunds.total, now);
        else if (state === 'RECEIVED') {
          const order = await tx.shopOrder.findUnique({ where: { id: intent.shopOrderId }, include: shopOrderInclude });
          if (order?.payment?.reference !== reference) {
            let valid = false;
            if (order && !intent.cancelRequestedAt && intent.expiresAt > now()) {
              try { await settleShopOrder(tx, order, { method: 'SICREDI', reference, amountCents: intent.amountCents, actorId: order.userId, now }); valid = true; }
              catch (err) { if (!['SHOP_NOT_PAYABLE', 'SHOP_OUT_OF_STOCK'].includes(err.code)) throw err; }
            }
            if (!valid) { state = 'REFUNDING'; await tx.gatewayIntent.update({ where: { id }, data: { refundRequestedAt: intent.refundRequestedAt || now(), failureCode: 'SHOP_NO_LONGER_PAYABLE' } }); }
          }
        }
      }
      if (intent.state !== state || refunds.total !== intent.refundedCents || (received && !intent.pixEndToEndId)) await audit(tx, intent.snapshot.userId, 'SICREDI_PAYMENT_RECONCILED', id, { state, txid: intent.providerReference, endToEndId: received?.endToEndId || null, refundedCents: refunds.total });
      // Fence again after stock/finance waits; losing a lease rolls back issuance.
      if ((await tx.gatewayIntent.updateMany({ where: { id, ...scope, lockToken: token, lockedUntil: { gt: now() } }, data: { state, refundedCents: refunds.total, ...(received ? { pixEndToEndId: received.endToEndId } : {}), pixPayload: state === 'PENDING' && !intent.cancelRequestedAt ? charge.pixCopiaECola || intent.pixPayload || null : null } })).count !== 1) throw fault('SICREDI_LEASE_LOST', 'A conciliação perdeu sua autorização.');
      return state;
    });
  }
  const store = {
    profile: async () => ({ enabled: settings.PAYMENT_MODE === 'sicredi', provider: 'sicredi', environment, configured: true, documentLast4: null }),
    saveProfile: async () => { active(); return store.profile(); }, // The Pix API doesn't require creating a payer at the bank.
    ticketPix: (userId, id) => createIntent(userId, id),
    shopPix: (userId, id) => createIntent(userId, id, true),
    cashPix: async () => { throw fault('SICREDI_SPLIT_UNAVAILABLE', 'O Pix Sicredi de recebimento não confirma split de parceiros. Cashback com split não está habilitado.'); },
    async ownIntent(userId, id) {
      const row = await db.gatewayIntent.findFirst({ where: { id, ...scope, ...owner(userId) } });
      if (!row) throw fault('PAYMENT_NOT_FOUND', 'Pagamento não encontrado na sua conta.', 404);
      return publicIntent(row, now());
    },
    async ticketIntent(userId, ticketId) {
      if (!await db.ticket.findFirst({ where: { id: ticketId, userId } })) throw fault('TICKET_NOT_FOUND', 'Pedido não encontrado.', 404);
      const item = await db.ticket.findUnique({ where: { id: ticketId }, include: { payment: true } });
      const ref = item.payment?.method === 'SICREDI' ? item.payment.reference.slice(8) : null;
      const row = await db.gatewayIntent.findFirst({ where: { ticketId, ...scope, OR: [{ generation: `sicredi:${environment}:${ticketGeneration(item)}` }, ...(ref ? [{ providerReference: ref }] : [])] }, orderBy: { createdAt: 'desc' } }); return row ? publicIntent(row, now()) : null;
    },
    async shopIntent(userId, shopOrderId) {
      if (!await db.shopOrder.findFirst({ where: { id: shopOrderId, userId } })) throw fault('SHOP_NOT_FOUND', 'Pedido não encontrado.', 404);
      const row = await db.gatewayIntent.findFirst({ where: { shopOrderId, ...scope } }); return row ? publicIntent(row, now()) : null;
    },
    async adminList({ limit, offset }) { return (await db.gatewayIntent.findMany({ where: scope, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, skip: offset })).map((row) => ({ ...publicIntent(row, now()), providerReference: row.providerReference, pixEndToEndId: row.pixEndToEndId, attempts: row.attempts, updatedAt: row.updatedAt })); },
    async retry(id) { active(); await db.gatewayIntent.updateMany({ where: { id, ...scope }, data: { nextAttemptAt: now(), wakeVersion: { increment: 1 } } }); return { queued: true }; },
    async requestRefund(actorId, id, reason) {
      active(); return serializable(db, async (tx) => {
        const intent = await tx.gatewayIntent.findFirst({ where: { id, ...scope } });
        if (!intent || !intent.pixEndToEndId || intent.refundedCents >= intent.amountCents) throw fault('SICREDI_REFUND_UNAVAILABLE', 'Não há recebimento confirmado disponível para devolução.');
        await tx.gatewayIntent.update({ where: { id }, data: { refundRequestedAt: intent.refundRequestedAt || now(), state: 'REFUNDING', pixPayload: null, wakeVersion: { increment: 1 }, nextAttemptAt: now() } });
        if (intent.ticketId) {
          const ticket = await tx.ticket.findUnique({ where: { id: intent.ticketId }, include: { payment: true } });
          if (ticket?.payment?.reference === receiptRef(intent)) { await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'CANCELED', voidedQuantity: ticket.quantity - ticket.usedQuantity, entryVersion: { increment: 1 }, entryToken: null } }); await tx.ticketAccessCode.deleteMany({ where: { ticketId: ticket.id } }); await recordTicketFinancial(tx, ticket, { blocked: true, reason: 'Devolução Sicredi solicitada' }); }
        } else if (intent.shopOrderId) await reverseShopOrder(tx, intent, intent.refundedCents, now);
        await audit(tx, actorId, 'SICREDI_REFUND_REQUESTED', id, { reason }); return { requested: true };
      });
    },
    async webhook(token, body) {
      active();
      const expected = Buffer.from(settings.SICREDI_PIX_WEBHOOK_TOKEN || ''), supplied = Buffer.from(typeof token === 'string' ? token : '');
      if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) throw fault('SICREDI_WEBHOOK_UNAUTHORIZED', 'Notificação não autorizada.', 401);
      const events = webhookSchema.parse(body).pix;
      for (const event of events) {
        const id = createHash('sha256').update(`${environment}:${event.txid}:${event.endToEndId}`).digest('hex');
        // Only known references wake the worker. Webhook values never settle money.
        await db.gatewayIntent.updateMany({ where: { ...scope, providerReference: event.txid }, data: { nextAttemptAt: now(), wakeVersion: { increment: 1 } } });
        await db.gatewayWebhook.upsert({ where: { environment_externalId: { environment, externalId: `sicredi:${id}` } }, create: { environment, provider: 'sicredi', externalId: `sicredi:${id}`, fingerprint: id, event: 'PIX_RECEIVED', paymentId: event.txid, externalReference: null, processedAt: now() }, update: {} });
      }
      return { received: true };
    },
    async tick() {
      active();
      const due = await db.gatewayIntent.findMany({ where: { ...scope, nextAttemptAt: { lte: now() }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now() } }] }, orderBy: { nextAttemptAt: 'asc' }, take: 20 });
      for (const row of due) await store.process(row.id);
      return { intents: due.length };
    },
    async process(id) {
      active(); const token = randomUUID();
      const claimed = await db.gatewayIntent.updateMany({ where: { id, ...scope, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now() } }] }, data: { lockToken: token, lockedUntil: new Date(now().getTime() + 300000), attempts: { increment: 1 } } });
      if (!claimed.count) return;
      let delay = 10000, wakeVersion;
      try {
        let intent = await db.gatewayIntent.findUnique({ where: { id } }); fence(intent, token); wakeVersion = intent.wakeVersion;
        let remote = await checkedRemote(intent);
        const ticket = intent.ticketId ? await db.ticket.findUnique({ where: { id: intent.ticketId }, include: { payment: true } }) : null;
        const order = intent.shopOrderId ? await db.shopOrder.findUnique({ where: { id: intent.shopOrderId }, include: { payment: true } }) : null;
        const settled = (ticket?.payment || order?.payment)?.reference === receiptRef(intent);
        const cancel = intent.cancelRequestedAt || (!settled && (intent.expiresAt <= now() || (ticket && (ticket.deletedAt || ticket.status !== 'PENDING' || intent.snapshot.reservationGeneration !== ticketGeneration(ticket))) || (order && order.status !== 'PENDING')));
        if (!remote) {
          if (intent.pixEndToEndId || intent.creationStartedAt) throw fault('SICREDI_CREATION_UNCERTAIN', 'O banco ainda não confirmou esta referência. Nenhuma segunda cobrança será criada.');
          if (cancel) { await write(id, token, { state: 'CANCELED', pixPayload: null }); delay = 86400000; return; }
          intent = await write(id, token, { state: 'CREATING', creationStartedAt: now() });
          const created = await api.create(intent.providerReference, intent.amountCents, Math.ceil((intent.expiresAt - now()) / 1000), intent.ticketId ? `Ingresso ${intent.ticketId}` : `Pedido da loja ${order.number}`);
          remote = await checkedRemote(intent);
          if (!remote) throw fault('SICREDI_CREATION_UNCERTAIN', 'Cobrança em conciliação pelo mesmo TXID.');
          if (!remote.charge.pixCopiaECola && created?.txid === intent.providerReference && typeof created.pixCopiaECola === 'string' && created.pixCopiaECola.startsWith('000201') && created.pixCopiaECola.length <= 4096) remote.charge.pixCopiaECola = created.pixCopiaECola;
        }
        if (cancel && !remote.received && remote.charge.status === 'ATIVA') { await write(id, token, { cancelRequestedAt: intent.cancelRequestedAt || now() }); await api.cancel(intent.providerReference); remote = await checkedRemote(intent); if (!remote) throw fault('SICREDI_CANCEL_UNCERTAIN', 'Cancelamento em conciliação.'); }
        await apply(id, token, remote);
        intent = await db.gatewayIntent.findUnique({ where: { id } }); fence(intent, token);
        if (intent.refundRequestedAt && remote.received && intent.refundedCents < intent.amountCents) {
          if (!intent.refundId) intent = await write(id, token, { refundId: opaque('R'), refundAmountCents: intent.amountCents - intent.refundedCents, refundStartedAt: now() });
          const existing = await api.refundStatus(intent.pixEndToEndId, intent.refundId);
          if (!existing) { await write(id, token, {}); await api.refund(intent.pixEndToEndId, intent.refundId, intent.refundAmountCents); }
          else if (existing.id !== intent.refundId || pixCents(existing.valor) !== intent.refundAmountCents || !['EM_PROCESSAMENTO', 'DEVOLVIDO'].includes(existing.status)) throw fault('SICREDI_REFUND_REVIEW', 'A devolução precisa de conferência no banco.');
          remote = await checkedRemote(intent); if (remote) await apply(id, token, remote);
        }
        intent = await db.gatewayIntent.findUnique({ where: { id } });
        if (intent.state === 'PENDING' && (!intent.pixPayload || typeof intent.pixPayload !== 'string' || intent.pixPayload.length > 4096 || !intent.pixPayload.startsWith('000201'))) throw fault('SICREDI_QR_UNAVAILABLE', 'O banco ainda não forneceu um Pix copia e cola válido.');
        delay = ['RECEIVED', 'PARTIAL_REFUND', 'CANCELED', 'REFUNDED'].includes(intent.state) ? 3600000 : 10000;
        await write(id, token, { failureCode: null });
      } catch (err) {
        delay = 30000;
        if (err.sicrediAuthenticationFailure || ['SICREDI_ACCESS_DENIED', 'SICREDI_REJECTED'].includes(err.code)) await db.gatewayIntent.updateMany({ where: { id, ...scope, state: 'CREATING', lockToken: token, lockedUntil: { gt: now() } }, data: { state: 'QUEUED', creationStartedAt: null } });
        await db.gatewayIntent.updateMany({ where: { id, ...scope, lockToken: token, lockedUntil: { gt: now() } }, data: { failureCode: typeof err.code === 'string' && /^(SICREDI_|P[0-9])/.test(err.code) ? err.code : 'SICREDI_RECONCILIATION_FAILED', pixPayload: null } });
      } finally {
        const nextAttemptAt = new Date(now().getTime() + delay);
        await db.gatewayIntent.updateMany({ where: { id, ...scope, lockToken: token }, data: { lockedUntil: null, lockToken: null } });
        await db.gatewayIntent.updateMany({ where: { id, ...scope, lockToken: null, wakeVersion }, data: { nextAttemptAt } });
      }
    },
  };
  return store;
}
