import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import { serializable } from '../lib/business-rules.js';
import { inventoryWhere, occupiedQuantity } from '../lib/ticket-rules.js';
import { AppError } from '../lib/errors.js';
import { authenticateAsaasWebhook, protectDocument, validTaxId, cents } from '../payments/asaas-client.js';
import { settleShopOrder, reverseShopOrder, shopOrderInclude } from '../lib/shop-inventory.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const providerId = z.string().regex(/^[A-Za-z0-9_-]{3,100}$/);
const webhookSchema = z.object({ id: z.string().min(1).max(200), event: z.string().min(1).max(100), payment: z.object({ id: providerId, externalReference: z.string().max(200).nullable().optional() }).passthrough().optional() }).passthrough();
export const ticketGeneration = (ticket) => hash(JSON.stringify([ticket.id, ticket.createdAt, ticket.sectorId, ticket.quantity, ticket.priceCents, ticket.expiresAt]));
export const billingSchema = z.object({ document: z.string().max(25).transform((value) => value.replace(/\D/g, '')).refine(validTaxId, 'Informe um CPF ou CNPJ válido.') }).strict();
const terminal = ['CANCELED', 'REFUNDED'];
const reference = (intent) => `socio:${intent.id}`;
const dateInPatos = (instant) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
const error = (code, message) => new AppError(409, code, message);
export function publicIntent(intent, now = new Date()) {
  const payable = intent.state === 'PENDING' && !intent.cancelRequestedAt && !intent.refundRequestedAt && intent.expiresAt > now;
  return { id: intent.id, ticketId: intent.ticketId, chargeId: intent.chargeId, shopOrderId: intent.shopOrderId || null, environment: intent.environment, state: intent.state, amountCents: intent.amountCents, refundedCents: intent.refundedCents, pixPayload: payable ? intent.pixPayload : null, expiresAt: intent.expiresAt, failureCode: intent.failureCode, serverTime: now.toISOString() };
}
export function createAsaasStore(client, { settings, api, now = () => new Date() }) {
  const environment = settings.ASAAS_ENVIRONMENT, docs = protectDocument(settings.ASAAS_DATA_SECRET || 'disabled');
  const enabled = () => { if (settings.PAYMENT_MODE !== 'asaas') throw new AppError(503, 'ASAAS_DISABLED', 'O pagamento Pix não está habilitado.'); };
  const audit = (tx, actorId, action, entityId, details) => tx.auditLog.create({ data: { actorId, action, entityId, details } });
  function assertLease(row, token) {
    if (!row || row.lockToken !== token || !row.lockedUntil || row.lockedUntil <= now()) throw error('ASAAS_LEASE_LOST', 'A conciliação será retomada por outro processo.');
  }
  // Fence standalone intent/customer writes, including markers BEFORE financial POSTs.
  // An expired worker cannot overwrite a newer worker or start another charge.
  async function leaseWrite(model, id, token, data, extra = {}) {
    const result = await model.updateMany({ where: { id, lockToken: token, lockedUntil: { gt: now() }, ...extra }, data });
    if (result.count !== 1) throw error('ASAAS_LEASE_LOST', 'A conciliação será retomada por outro processo.');
    const current = await model.findUnique({ where: { id } });
    assertLease(current, token);
    return current;
  }
  async function assertPayment(db, intent, remote) {
    const customer = await db.billingCustomer.findUnique({ where: { id: intent.customerId } });
    if (!customer?.providerReference || customer.environment !== environment || remote.customer !== customer.providerReference ||
        (intent.providerReference && remote.id !== intent.providerReference) || !providerId.safeParse(remote.id).success ||
        remote.externalReference !== reference(intent) || remote.billingType !== 'PIX' || cents(remote.value) !== intent.amountCents ||
        (remote.deleted && ['RECEIVED', 'CONFIRMED'].includes(remote.status))) {
      throw error('ASAAS_PAYMENT_MISMATCH', 'A cobrança do provedor diverge do pedido.');
    }
  }
  async function billing(userId) {
    const customer = await client.billingCustomer.findUnique({ where: { userId_environment: { userId, environment } } });
    if (!customer) throw error('BILLING_REQUIRED', 'Cadastre o CPF ou CNPJ do pagador antes de gerar o Pix.');
    return customer;
  }
  async function customerId(id) {
    const instant = now(), token = randomUUID();
    const claim = await client.billingCustomer.updateMany({ where: { id, OR: [{ lockedUntil: null }, { lockedUntil: { lt: instant } }] }, data: { lockedUntil: new Date(instant.getTime() + 120000), lockToken: token } });
    if (!claim.count) throw error('BILLING_BUSY', 'O cadastro do pagador está sendo processado.');
    try {
      const customer = await client.billingCustomer.findUnique({ where: { id }, include: { user: true } });
      if (customer.providerReference) return customer.providerReference;
      const externalReference = `socio-user:${customer.userId}`;
      const found = await api.findCustomer(externalReference);
      const matches = (found.data || []).filter((row) => row.externalReference === externalReference && !row.deleted);
      if (found.hasMore || matches.length > 1) throw error('ASAAS_CUSTOMER_REVIEW', 'Há cadastros duplicados do pagador no provedor.');
      let remote = matches[0];
      if (!remote) {
        if (customer.creationStartedAt) throw error('ASAAS_CUSTOMER_UNCERTAIN', 'O cadastro está em conciliação. Nenhuma criação duplicada será enviada.');
        await leaseWrite(client.billingCustomer, id, token, { creationStartedAt: now() }, { creationStartedAt: null });
        try { remote = await api.createCustomer({ name: customer.user.name, email: customer.user.email, cpfCnpj: docs.decrypt(customer.documentEncrypted), externalReference, notificationDisabled: true }); }
        catch (err) { if (err.code === 'ASAAS_REJECTED' || err.code === 'ASAAS_ACCESS_DENIED') await leaseWrite(client.billingCustomer, id, token, { creationStartedAt: null }); throw err; }
      }
      providerId.parse(remote.id);
      await leaseWrite(client.billingCustomer, id, token, { providerReference: remote.id });
      return remote.id;
    } finally { await client.billingCustomer.updateMany({ where: { id, lockToken: token }, data: { lockedUntil: null, lockToken: null } }); }
  }
  async function invalidateTicket(tx, intent, refundedCents) {
    const ticket = await tx.ticket.findUnique({ where: { id: intent.ticketId }, include: { payment: true } });
    // A payment for a prior reservation generation cannot cancel a new purchase.
    if (!ticket?.payment || ticket.payment.reference !== `ASAAS:${intent.providerReference}`) return;
    if (ticket.status === 'CANCELED' && ticket.payment.refundedCents >= refundedCents) return;
    await tx.ticketPayment.update({ where: { ticketId: ticket.id }, data: { refundedCents: Math.max(ticket.payment.refundedCents, refundedCents) } });
    await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'CANCELED', voidedQuantity: ticket.quantity - ticket.usedQuantity, entryVersion: { increment: 1 }, entryToken: null } });
    await tx.ticketAccessCode.deleteMany({ where: { ticketId: ticket.id } });
  }
  async function syncTicket(tx, intent, remote, refunded) {
    const ticket = await tx.ticket.findUnique({ where: { id: intent.ticketId }, include: { payment: true, user: true, match: true, sector: true } });
    const sameReceipt = ticket?.payment?.reference === `ASAAS:${remote.id}`;
    if (refunded > 0) { await invalidateTicket(tx, intent, refunded); return; }
    if (sameReceipt) return;
    if (remote.status !== 'RECEIVED' || remote.deleted) return;
    const generationMatches = ticket && `${environment}:${ticketGeneration(ticket)}` === intent.generation;
    let canIssue = generationMatches && !ticket.payment && !ticket.deletedAt && ticket.status === 'PENDING' && ticket.user.active && !intent.cancelRequestedAt && !intent.refundRequestedAt && intent.expiresAt > now() && ticket.match.startsAt > now();
    if (canIssue) {
      const occupied = await tx.ticket.aggregate({ where: { id: { not: ticket.id }, sectorId: ticket.sectorId, ...inventoryWhere(now()) }, _sum: { quantity: true, voidedQuantity: true } });
      canIssue = occupiedQuantity(occupied._sum) + ticket.quantity <= ticket.sector.capacity;
    }
    // Database waits must not extend a reservation or allow issuance after kickoff.
    canIssue = canIssue && intent.expiresAt > now() && ticket.match.startsAt > now();
    if (!canIssue) {
      await tx.gatewayIntent.update({ where: { id: intent.id }, data: { refundRequestedAt: intent.refundRequestedAt || now(), state: 'REFUNDING', failureCode: 'TICKET_NO_LONGER_PAYABLE' } });
      return;
    }
    await tx.ticketPayment.create({ data: { ticketId: ticket.id, method: 'ASAAS', amountCents: intent.amountCents, reference: `ASAAS:${remote.id}`, confirmedAt: now() } });
    await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'ISSUED', expiresAt: null, entryToken: null, entryVersion: { increment: 1 } } });
    await audit(tx, ticket.userId, 'TICKET_ASAAS_RECEIVED', ticket.id, { intentId: intent.id, providerReference: remote.id, amountCents: intent.amountCents });
  }
  async function syncShop(tx, intent, remote, refunded) {
    if (refunded > 0) { await reverseShopOrder(tx, intent, refunded, now); return; }
    if (remote.status !== 'RECEIVED' || remote.deleted) return;
    const order = await tx.shopOrder.findUnique({ where: { id: intent.shopOrderId }, include: shopOrderInclude });
    if (order?.payment?.reference === `ASAAS:${remote.id}`) return;
    if (order && !intent.cancelRequestedAt && !intent.refundRequestedAt && intent.expiresAt > now()) {
      try { await settleShopOrder(tx, order, { method: 'ASAAS', reference: `ASAAS:${remote.id}`, amountCents: intent.amountCents, actorId: order.userId, now }); return; }
      catch (err) { if (!['SHOP_NOT_PAYABLE', 'SHOP_OUT_OF_STOCK'].includes(err.code)) throw err; }
    }
    await tx.gatewayIntent.update({ where: { id: intent.id }, data: { refundRequestedAt: intent.refundRequestedAt || now(), state: 'REFUNDING', failureCode: 'SHOP_NO_LONGER_PAYABLE' } });
  }
  async function syncCash(tx, intent, remote, refunded) {
    const charge = await tx.paymentCharge.findUnique({ where: { id: intent.chargeId } });
    if (!charge) return;
    const expected = intent.snapshot;
    const splits = remote.split || [];
    const merchantAmount = cents(remote.netValue) - charge.cashbackCents - charge.commissionCents;
    const settled = remote.status === 'RECEIVED' && merchantAmount >= 0 && (merchantAmount === 0 ? splits.length === 0 : splits.length === 1 && splits[0].walletId === expected.merchantWallet && cents(splits[0].fixedValue) === merchantAmount && splits[0].status === 'DONE' && !splits[0].cancellationReason && !splits[0].refusalReason);
    const credit = await tx.cashEntry.findUnique({ where: { chargeId_kind: { chargeId: charge.id, kind: 'CASHBACK' } } });
    if (refunded > 0) {
      if (credit && charge.walletId) {
        const target = Math.round(charge.cashbackCents * refunded / charge.grossCents);
        const previous = await tx.cashEntry.findUnique({ where: { chargeId_kind: { chargeId: charge.id, kind: 'REVERSAL' } } });
        const delta = target + (previous?.amountCents || 0);
        if (delta > 0) {
          const wallet = await tx.cashWallet.update({ where: { id: charge.walletId }, data: { balanceCents: { decrement: delta } } });
          await tx.cashEntry.upsert({ where: { chargeId_kind: { chargeId: charge.id, kind: 'REVERSAL' } }, create: { chargeId: charge.id, walletId: wallet.id, kind: 'REVERSAL', amountCents: -target, balanceAfterCents: wallet.balanceCents }, update: { amountCents: -target, balanceAfterCents: wallet.balanceCents } });
        }
      }
      if (refunded === intent.amountCents) await tx.paymentCharge.update({ where: { id: charge.id }, data: { status: 'REFUNDED', refundedAt: now() } });
      return;
    }
    if (remote.status === 'RECEIVED' && !settled) {
      await tx.gatewayIntent.update({ where: { id: intent.id }, data: { state: 'REVIEW', failureCode: 'ASAAS_SPLIT_PENDING' } });
      return;
    }
    if (!settled || charge.status !== 'PENDING') return;
    if (!charge.walletId || intent.cancelRequestedAt || intent.refundRequestedAt || intent.expiresAt <= now()) {
      await tx.gatewayIntent.update({ where: { id: intent.id }, data: { refundRequestedAt: now(), state: 'REFUNDING', failureCode: 'CASH_NO_LONGER_PAYABLE' } }); return;
    }
    if (charge.cashbackCents > 0 && !credit) {
      const wallet = await tx.cashWallet.update({ where: { id: charge.walletId }, data: { balanceCents: { increment: charge.cashbackCents } } });
      await tx.cashEntry.create({ data: { walletId: wallet.id, chargeId: charge.id, kind: 'CASHBACK', amountCents: charge.cashbackCents, balanceAfterCents: wallet.balanceCents } });
    }
    await tx.paymentCharge.update({ where: { id: charge.id }, data: { status: 'PAID', paidAt: now() } });
  }
  async function applyRemote(id, remote, token) {
    return serializable(client, async (tx) => {
      const intent = await tx.gatewayIntent.findUnique({ where: { id } });
      assertLease(intent, token);
      await assertPayment(tx, intent, remote);
      const rawRefunded = remote.status === 'REFUNDED' ? intent.amountCents : (remote.refunds || []).filter((refund) => refund.status === 'DONE').reduce((total, refund) => total + cents(refund.value), 0);
      const refunded = Math.max(intent.refundedCents, rawRefunded);
      if (refunded > intent.amountCents) throw error('ASAAS_REFUND_MISMATCH', 'Estorno acima do pagamento.');
      if (intent.state === 'REFUNDED' && refunded !== intent.amountCents) return;
      const state = refunded === intent.amountCents ? 'REFUNDED' : refunded > 0 ? 'PARTIAL_REFUND' : intent.refundRequestedAt || remote.status === 'REFUND_REQUESTED' || remote.status === 'REFUND_IN_PROGRESS' ? 'REFUNDING' : remote.deleted ? 'CANCELED' : remote.status === 'RECEIVED' ? 'RECEIVED' : remote.status === 'CONFIRMED' ? 'PROCESSING' : 'PENDING';
      // Any reversal/chargeback prevents admission immediately, even before settlement completes.
      const unsafe = ['REFUND_REQUESTED', 'REFUND_IN_PROGRESS', 'CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL'].includes(remote.status) || (remote.refunds || []).some((refund) => ['PENDING', 'AWAITING_CRITICAL_ACTION_AUTHORIZATION', 'IN_PROGRESS'].includes(refund.status));
      await tx.gatewayIntent.update({ where: { id }, data: { state: unsafe ? 'REVIEW' : state, refundedCents: refunded, netCents: remote.netValue == null ? null : cents(remote.netValue), pixPayload: state === 'PENDING' && !unsafe ? intent.pixPayload : null, failureCode: unsafe ? 'ASAAS_REVERSAL_REVIEW' : null } });
      if (intent.ticketId) {
        if (unsafe) await invalidateTicket(tx, intent, refunded);
        else await syncTicket(tx, intent, remote, refunded);
      } else if (intent.shopOrderId) {
        if (unsafe) await reverseShopOrder(tx, intent, refunded, now);
        else await syncShop(tx, intent, remote, refunded);
      } else if (!unsafe) await syncCash(tx, intent, remote, refunded);
      assertLease(intent, token);
    });
  }
  return {
    async profile(userId) {
      const profile = await client.billingCustomer.findUnique({ where: { userId_environment: { userId, environment } } });
      return { enabled: settings.PAYMENT_MODE === 'asaas', environment, configured: Boolean(profile), documentLast4: profile?.documentLast4 || null };
    },
    async saveProfile(userId, document) {
      enabled();
      if (!validTaxId(document)) throw new AppError(422, 'INVALID_TAX_ID', 'Informe CPF ou CNPJ válido.');
      const digits = document.replace(/\D/g, '');
      return serializable(client, async (tx) => {
        const existing = await tx.billingCustomer.findUnique({ where: { userId_environment: { userId, environment } } });
        if (existing && docs.decrypt(existing.documentEncrypted) !== digits && (existing.providerReference || existing.creationStartedAt)) throw error('BILLING_DOCUMENT_LOCKED', 'O documento deste cadastro já foi enviado ao provedor. Solicite a correção ao atendimento.');
        const data = { documentEncrypted: docs.encrypt(digits), documentLast4: digits.slice(-4) };
        await tx.billingCustomer.upsert({ where: { userId_environment: { userId, environment } }, create: { userId, environment, ...data }, update: data });
        return { enabled: true, environment, configured: true, documentLast4: data.documentLast4 };
      });
    },
    async ticketPix(userId, ticketId) {
      enabled(); const customer = await billing(userId);
      return serializable(client, async (tx) => {
        const ticket = await tx.ticket.findFirst({ where: { id: ticketId, userId }, include: { payment: true } });
        if (!ticket || ticket.deletedAt) throw new AppError(404, 'TICKET_NOT_FOUND', 'Pedido não encontrado.');
        if (ticket.payment || ticket.status !== 'PENDING' || !ticket.expiresAt || ticket.expiresAt <= now() || ticket.priceCents <= 0) throw error('TICKET_NOT_PAYABLE', 'Este pedido não está disponível para pagamento.');
        const generation = `${environment}:${ticketGeneration(ticket)}`;
        const intent = await tx.gatewayIntent.upsert({ where: { generation }, update: {}, create: { environment, generation, ticketId, customerId: customer.id, amountCents: ticket.priceCents, expiresAt: ticket.expiresAt, snapshot: { userId, sectorId: ticket.sectorId, quantity: ticket.quantity } } });
        return publicIntent(intent, now());
      });
    },
    async cashPix(userId, chargeId) {
      enabled(); const customer = await billing(userId);
      return serializable(client, async (tx) => {
        const charge = await tx.paymentCharge.findFirst({ where: { id: chargeId, wallet: { userId } }, include: { offer: true } });
        if (!charge || charge.provider !== 'asaas') throw new AppError(404, 'SALE_NOT_FOUND', 'Venda não encontrada.');
        if (charge.status !== 'PENDING' || charge.expiresAt <= now()) throw error('SALE_CLOSED', 'Esta venda não está disponível para pagamento.');
        const merchantWallet = settings.asaasMerchantWallets[charge.offer.merchantId];
        if (!merchantWallet) throw error('ASAAS_MERCHANT_NOT_CONFIGURED', 'O recebedor da loja ainda não foi configurado.');
        const prior = await tx.gatewayIntent.findUnique({ where: { chargeId } });
        if (prior && prior.environment !== environment) throw error('ASAAS_ENVIRONMENT_MISMATCH', 'Esta venda pertence a outro ambiente de pagamento.');
        const intent = await tx.gatewayIntent.upsert({ where: { chargeId }, update: {}, create: { environment, generation: `${environment}:cash:${chargeId}`, chargeId, customerId: customer.id, amountCents: charge.grossCents, expiresAt: charge.expiresAt, snapshot: { userId, merchantWallet, cashbackCents: charge.cashbackCents, commissionCents: charge.commissionCents } } });
        return publicIntent(intent, now());
      });
    },
    async shopPix(userId, orderId) {
      enabled(); const customer = await billing(userId);
      return serializable(client, async (tx) => {
        const order = await tx.shopOrder.findFirst({ where: { id: orderId, userId }, include: { payment: true } });
        if (!order) throw new AppError(404, 'SHOP_NOT_FOUND', 'Pedido não encontrado.');
        if (order.status !== 'PENDING' || order.payment || order.expiresAt <= now() || order.totalCents <= 0) throw error('SHOP_NOT_PAYABLE', 'Este pedido não está disponível para pagamento.');
        const previous = await tx.gatewayIntent.findUnique({ where: { shopOrderId: orderId } });
        if (previous && previous.environment !== environment) throw error('ASAAS_ENVIRONMENT_MISMATCH', 'Este pedido pertence a outro ambiente.');
        const intent = await tx.gatewayIntent.upsert({ where: { shopOrderId: orderId }, update: {}, create: { environment, generation: `${environment}:shop:${orderId}`, shopOrderId: orderId, customerId: customer.id, amountCents: order.totalCents, expiresAt: order.expiresAt, snapshot: { userId } } });
        return publicIntent(intent, now());
      });
    },
    async shopIntent(userId, orderId) {
      const order = await client.shopOrder.findFirst({ where: { id: orderId, userId } });
      if (!order) throw new AppError(404, 'SHOP_NOT_FOUND', 'Pedido não encontrado.');
      const intent = await client.gatewayIntent.findFirst({ where: { shopOrderId: orderId, environment } });
      return intent ? publicIntent(intent, now()) : null;
    },
    async ownIntent(userId, id) {
      const intent = await client.gatewayIntent.findFirst({ where: { id, environment, OR: [{ ticket: { userId } }, { charge: { wallet: { userId } } }, { shopOrder: { userId } }] } });
      if (!intent) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Pagamento não encontrado na sua conta.');
      return publicIntent(intent, now());
    },
    async ticketIntent(userId, ticketId) {
      const ticket = await client.ticket.findFirst({ where: { id: ticketId, userId }, include: { payment: true } });
      if (!ticket) throw new AppError(404, 'TICKET_NOT_FOUND', 'Pedido não encontrado.');
      const receiptReference = ticket.payment?.method === 'ASAAS' ? ticket.payment.reference.replace(/^ASAAS:/, '') : null;
      const intent = await client.gatewayIntent.findFirst({ where: { ticketId, environment, OR: [{ generation: `${environment}:${ticketGeneration(ticket)}` }, ...(receiptReference ? [{ providerReference: receiptReference }] : [])] }, orderBy: { createdAt: 'desc' } });
      return intent ? publicIntent(intent, now()) : null;
    },
    async webhook(header, body) {
      enabled(); authenticateAsaasWebhook(header, settings.ASAAS_WEBHOOK_TOKEN);
      const event = webhookSchema.parse(body);
      const data = { environment, externalId: event.id, event: event.event, paymentId: event.payment?.id || null, externalReference: event.payment?.externalReference || null };
      const fingerprint = hash(JSON.stringify([data.event, data.paymentId, data.externalReference]));
      const existing = await client.gatewayWebhook.findUnique({ where: { environment_externalId: { environment, externalId: event.id } } });
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw error('WEBHOOK_ID_CONFLICT', 'Evento com identificador conflitante.');
        return { received: true, duplicate: true };
      }
      try { await client.gatewayWebhook.create({ data: { ...data, fingerprint } }); }
      catch (err) {
        if (err.code !== 'P2002') throw err;
        const previous = await client.gatewayWebhook.findUnique({ where: { environment_externalId: { environment, externalId: event.id } } });
        if (previous.fingerprint !== fingerprint) throw error('WEBHOOK_ID_CONFLICT', 'Evento com identificador conflitante.');
        return { received: true, duplicate: true };
      }
      return { received: true, duplicate: false };
    },
    async requestRefund(actorId, id, reason) {
      return serializable(client, async (tx) => {
        const intent = await tx.gatewayIntent.findFirst({ where: { id, environment } });
        if (!intent) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Pagamento não encontrado.');
        await tx.gatewayIntent.update({ where: { id }, data: { refundRequestedAt: intent.refundRequestedAt || now(), nextAttemptAt: now(), pixPayload: null, wakeVersion: { increment: 1 } } });
        if (intent.ticketId) await invalidateTicket(tx, intent, intent.refundedCents);
        if (intent.shopOrderId) await reverseShopOrder(tx, intent, intent.refundedCents, now);
        await audit(tx, actorId, 'ASAAS_REFUND_REQUESTED', id, { reason, amountCents: intent.amountCents, ticketId: intent.ticketId, chargeId: intent.chargeId, shopOrderId: intent.shopOrderId });
        return { requested: true };
      });
    },
    async adminList({ limit, offset }) {
      const rows = await client.gatewayIntent.findMany({ where: { environment }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit, skip: offset });
      return rows.map((row) => ({ ...publicIntent(row, now()), providerReference: row.providerReference, attempts: row.attempts, updatedAt: row.updatedAt }));
    },
    async retry(id) { await client.gatewayIntent.updateMany({ where: { id, environment }, data: { nextAttemptAt: now(), wakeVersion: { increment: 1 } } }); return { queued: true }; },
    async tick() {
      enabled();
      // Inbox is persisted before HTTP 200. Awakening an intent and acknowledging
      // the notification share one transaction, so a crash cannot lose the wakeup.
      const inbox = await client.gatewayWebhook.findMany({ where: { environment, processedAt: null }, orderBy: { createdAt: 'asc' }, take: 100 });
      for (const event of inbox) await serializable(client, async (tx) => {
        const intentId = /^socio:([a-f\d-]{36})$/i.exec(event.externalReference || '')?.[1];
        const intent = await tx.gatewayIntent.findFirst({ where: { environment, OR: [...(event.paymentId ? [{ providerReference: event.paymentId }] : []), ...(intentId ? [{ id: intentId }] : [])] } });
        if (intent) await tx.gatewayIntent.update({ where: { id: intent.id }, data: { nextAttemptAt: now(), wakeVersion: { increment: 1 } } });
        await tx.gatewayWebhook.update({ where: { id: event.id }, data: { processedAt: now() } });
      });
      const due = await client.gatewayIntent.findMany({ where: { environment, nextAttemptAt: { lte: now() }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now() } }] }, orderBy: { nextAttemptAt: 'asc' }, take: 20 });
      for (const row of due) await this.process(row.id);
      return { inbox: inbox.length, intents: due.length };
    },
    async process(id) {
      const token = randomUUID(), instant = now();
      const claim = await client.gatewayIntent.updateMany({ where: { id, environment, OR: [{ lockedUntil: null }, { lockedUntil: { lt: instant } }] }, data: { lockToken: token, lockedUntil: new Date(instant.getTime() + 300000), attempts: { increment: 1 } } });
      if (!claim.count) return;
      let delay = 30000, wakeVersion;
      try {
        let intent = await client.gatewayIntent.findUnique({ where: { id } });
        wakeVersion = intent.wakeVersion;
        // Even a logically deleted ticket must have its bank charge canceled.
        const ticket = intent.ticketId ? await client.ticket.findUnique({ where: { id: intent.ticketId }, include: { payment: true } }) : null;
        const shopOrder = intent.shopOrderId ? await client.shopOrder.findUnique({ where: { id: intent.shopOrderId }, include: { payment: true } }) : null;
        const received = ticket ? ticket.payment?.reference === `ASAAS:${intent.providerReference}` : intent.shopOrderId ? shopOrder?.payment?.reference === `ASAAS:${intent.providerReference}` : (await client.paymentCharge.findUnique({ where: { id: intent.chargeId } }))?.status === 'PAID';
        // Deleting an already paid administrative sale does not request a refund.
        const cancel = Boolean(intent.cancelRequestedAt || intent.refundRequestedAt || (!received && (intent.expiresAt <= now() || (intent.shopOrderId && (!shopOrder || shopOrder.status !== 'PENDING')) || (ticket && (ticket.deletedAt || ticket.status === 'CANCELED' || `${environment}:${ticketGeneration(ticket)}` !== intent.generation)))));
        let remote;
        if (!intent.providerReference) {
          const found = await api.findPayments(reference(intent));
          const matches = (found.data || []).filter((row) => row.externalReference === reference(intent));
          if (found.hasMore || matches.length > 1) throw error('ASAAS_DUPLICATE_REVIEW', 'Mais de uma cobrança foi localizada para este pedido.');
          remote = matches[0];
          if (!remote && cancel && !intent.creationStartedAt) { await leaseWrite(client.gatewayIntent, id, token, { state: 'CANCELED' }); delay = 86400000; return; }
          if (!remote && intent.creationStartedAt) throw error('ASAAS_CREATION_UNCERTAIN', 'Criação em conciliação; nenhuma segunda cobrança foi enviada.');
          if (!remote) {
            const customer = await customerId(intent.customerId);
            // Persist before POST. Never blindly replay an ambiguous monetary request.
            await leaseWrite(client.gatewayIntent, id, token, { creationStartedAt: now(), state: 'CREATING' }, { creationStartedAt: null });
            try { remote = await api.createPayment({ customer, billingType: 'PIX', value: intent.amountCents / 100, dueDate: dateInPatos(intent.expiresAt), externalReference: reference(intent), description: intent.ticketId ? `Ingresso ${intent.ticketId}` : intent.shopOrderId ? `Pedido loja ${shopOrder.number}` : `Compra ${intent.chargeId}`, interest: { value: 0 }, fine: { value: 0 }, discount: { value: 0 } }); }
            catch (err) { if (['ASAAS_REJECTED', 'ASAAS_ACCESS_DENIED'].includes(err.code)) await leaseWrite(client.gatewayIntent, id, token, { creationStartedAt: null }); throw err; }
          }
          providerId.parse(remote.id);
          await assertPayment(client, intent, remote);
          intent = await leaseWrite(client.gatewayIntent, id, token, { providerReference: remote.id });
        }
        remote = await api.payment(intent.providerReference);
        // Validate ownership and immutable payment fields before mutating the provider.
        await assertPayment(client, intent, remote);
        // Configure a fixed split using actual netValue; percentages are on net,
        // while the agreed cashback/commission are calculated on the gross price.
        if (intent.chargeId && !intent.pixPayload && remote.status === 'PENDING' && !remote.deleted && !cancel) {
          const net = cents(remote.netValue), retained = intent.snapshot.cashbackCents + intent.snapshot.commissionCents;
          if (net < retained || net > intent.amountCents) throw error('ASAAS_FEE_EXCEEDS_SPLIT', 'A tarifa supera o saldo disponível para a divisão.');
          const merchantCents = net - retained;
          await leaseWrite(client.gatewayIntent, id, token, { state: intent.state });
          remote = await api.updatePayment(remote.id, { split: merchantCents > 0 ? [{ walletId: intent.snapshot.merchantWallet, fixedValue: merchantCents / 100, externalReference: id }] : [] });
          await assertPayment(client, intent, remote);
          await client.paymentCharge.update({ where: { id: intent.chargeId }, data: { providerReference: remote.id, merchantCents, gatewayFeeCents: intent.amountCents - net } });
        }
        await applyRemote(id, remote, token);
        intent = await client.gatewayIntent.findUnique({ where: { id } });
        if ((cancel || intent.refundRequestedAt) && remote.status === 'RECEIVED' && intent.refundedCents < intent.amountCents) {
          if (!intent.refundStartedAt) {
            await leaseWrite(client.gatewayIntent, id, token, { refundStartedAt: now(), refundRequestedAt: intent.refundRequestedAt || now(), state: 'REFUNDING', pixPayload: null }, { refundStartedAt: null });
            try { await api.refund(remote.id, (intent.amountCents - intent.refundedCents) / 100); }
            catch (err) { if (['ASAAS_REJECTED', 'ASAAS_ACCESS_DENIED'].includes(err.code)) await leaseWrite(client.gatewayIntent, id, token, { refundStartedAt: null }); throw err; }
            await applyRemote(id, await api.payment(remote.id), token);
          } else { await leaseWrite(client.gatewayIntent, id, token, { state: 'REFUNDING', failureCode: 'ASAAS_REFUND_PROCESSING', pixPayload: null }); }
        } else if (cancel && ['PENDING', 'OVERDUE'].includes(remote.status) && !remote.deleted) {
          await leaseWrite(client.gatewayIntent, id, token, { cancelRequestedAt: intent.cancelRequestedAt || now(), pixPayload: null });
          try { await api.cancel(remote.id); await leaseWrite(client.gatewayIntent, id, token, { state: 'CANCELED' }); }
          catch (err) { if (err.code !== 'ASAAS_NOT_FOUND') throw err; }
        } else if (!cancel && !intent.refundRequestedAt && remote.status === 'PENDING' && !remote.deleted && !intent.pixPayload) {
          const pix = await api.pix(remote.id);
          if (typeof pix.payload !== 'string' || pix.payload.length < 20 || pix.payload.length > 2000) throw error('ASAAS_INVALID_PIX', 'O provedor retornou um Pix inválido.');
          await leaseWrite(client.gatewayIntent, id, token, { pixPayload: pix.payload, state: 'PENDING' });
          if (intent.chargeId) await client.paymentCharge.update({ where: { id: intent.chargeId }, data: { pixPayload: pix.payload } });
        }
        const current = await client.gatewayIntent.findUnique({ where: { id } });
        if (terminal.includes(current.state)) delay = 86400000;
        else if (current.state === 'RECEIVED') delay = 6 * 3600000;
      } catch (err) {
        const code = /^[A-Z_]{3,80}$/.test(err.code || '') ? err.code : 'ASAAS_PROCESSING_ERROR';
        await client.gatewayIntent.updateMany({ where: { id, lockToken: token, lockedUntil: { gt: now() } }, data: { failureCode: code, state: 'REVIEW', pixPayload: null } });
        delay = 60000;
      } finally {
        await serializable(client, async (tx) => {
          const current = await tx.gatewayIntent.findUnique({ where: { id } });
          await tx.gatewayIntent.updateMany({ where: { id, lockToken: token }, data: { lockedUntil: null, lockToken: null, nextAttemptAt: current.wakeVersion !== wakeVersion ? now() : new Date(now().getTime() + delay) } });
        });
      }
    },
  };
}
