import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAdminTicketStore } from '../src/models/admin-ticket.store.js';
import { adminTicketRevision } from '../src/lib/admin-ticket-revision.js';
import { saleQuoteSchema, saleUpdateSchema, saleDeleteSchema } from '../src/validators/admin.js';
import { createApp } from '../src/http/app.js';
import { inject } from './helpers/inject.js';
import { AppError } from '../src/lib/errors.js';
import { assertTicketPaid, assertAdmission, occupiedQuantity } from '../src/lib/ticket-rules.js';

const start = new Date('2026-11-03T18:00:00Z');
function fixture() {
  const ticketId = randomUUID(), matchId = randomUUID(), sectorId = randomUUID(), otherId = randomUUID(), userId = randomUUID();
  let clock = start, tail = Promise.resolve(), failAudit = false, afterAggregate = () => {};
  let state = {
    ticket: { id: ticketId, userId, matchId, sectorId, quantity: 2, priceCents: 5000, status: 'PENDING', usedQuantity: 0, entryVersion: 0, entryToken: null, createdAt: start, expiresAt: new Date(start.getTime() + 900000), payment: null, deletedAt: null, voidedQuantity: 0 },
    user: { id: userId, name: 'Titular', email: 'test@example.local', passwordHash: 'never expose', active: true, role: 'USER', membership: null },
    match: { id: matchId, published: true, salesEnabled: true, startsAt: new Date(start.getTime() + 7200000), salesOpenAt: null, salesCloseAt: null, sectors: [
      { id: sectorId, matchId, name: 'Sol', priceCents: 2500, capacity: 4, salesEnabled: true },
      { id: otherId, matchId, name: 'Sombra', priceCents: 4000, capacity: 5, salesEnabled: true },
    ] }, others: { [sectorId]: 1, [otherId]: 0 }, admissions: 0, codes: ['old'], audits: [],
  };
  const view = () => state.ticket ? structuredClone({ ...state.ticket, user: state.user, match: state.match, sector: state.match.sectors.find((sector) => sector.id === state.ticket.sectorId) }) : null;
  const tx = {
    ticket: {
      findUnique: async ({ where }) => where.id === ticketId ? view() : null,
      aggregate: async ({ where }) => {
        assert.equal(where.id.not, ticketId);
        assert.ok(Array.isArray(where.OR));
        const occupied = state.others[where.sectorId] || 0;
        afterAggregate(); return { _sum: { quantity: occupied } };
      },
      update: async ({ data }) => { for (const [key, value] of Object.entries(data)) state.ticket[key] = value?.increment !== undefined ? state.ticket[key] + value.increment : value; },
      delete: async () => { assert.equal(state.ticket.payment, null); assert.equal(state.admissions, 0); state.ticket = null; state.codes = []; },
    },
    ticketAdmission: { aggregate: async () => ({ _sum: { quantity: state.admissions } }) },
    ticketAccessCode: { deleteMany: async () => { state.codes = []; } },
    ticketPayment: { create: async ({ data }) => { state.ticket.payment = { ...data, id: randomUUID(), confirmedAt: clock }; } },
    auditLog: { create: async ({ data }) => { if (failAudit) throw new Error('audit unavailable'); state.audits.push(structuredClone(data)); } },
  };
  const client = { $transaction(work, options) {
    assert.equal(options.isolationLevel, 'Serializable');
    const result = tail.then(async () => { const before = structuredClone(state); try { return await work(tx); } catch (err) { state = before; throw err; } });
    tail = result.catch(() => {}); return result;
  } };
  return {
    store: createAdminTicketStore(client, { now: () => clock }), state: () => state, otherId, ticketId,
    input: () => ({ ticketId, revision: adminTicketRevision(state.ticket), sectorId: state.ticket.sectorId, quantity: 2 }),
    advance: (ms) => { clock = new Date(start.getTime() + ms); },
    afterAggregate: (fn) => { afterAggregate = fn; }, breakAudit: () => { failAudit = true; },
  };
}

test('sales quote excludes its own reservation, computes discounts and never writes', async () => {
  const f = fixture();
  f.state().user.membership = { status: 'ACTIVE', validUntil: new Date(start.getTime() + 30000), plan: { discountPercent: 15 } };
  f.state().match.sectors[0].priceCents = 999;
  const quote = await f.store.quote({ ...f.input(), quantity: 3 });
  assert.equal(quote.available, 3); assert.equal(quote.unitPriceCents, 849); assert.equal(quote.totalCents, 2547);
  assert.equal(quote.expiresAt, f.state().user.membership.validUntil.toISOString());
  assert.equal(f.state().ticket.quantity, 2); assert.equal(f.state().audits.length, 0);
  await assert.rejects(f.store.quote({ ...f.input(), quantity: 4 }), { code: 'SECTOR_SOLD_OUT' });
});

test('sales edits move inventory, preserve deadline, invalidate codes and audit before/after', async () => {
  const f = fixture(), originalExpiry = f.state().ticket.expiresAt;
  const input = { ...f.input(), sectorId: f.otherId, quantity: 3, expectedTotalCents: 12000, reason: 'Trocar setor solicitado' };
  const result = await f.store.update('admin', input);
  assert.equal(result.sector.id, f.otherId); assert.equal(result.quantity, 3); assert.equal(result.priceCents, 12000);
  assert.equal(result.expiresAt.getTime(), originalExpiry.getTime()); assert.equal(result.status, 'PENDING');
  assert.notEqual(result.revision, input.revision); assert.equal(f.state().ticket.entryVersion, 1); assert.deepEqual(f.state().codes, []);
  assert.equal(f.state().audits[0].actorId, 'admin'); assert.equal(f.state().audits[0].details.before.totalCents, 5000);
  assert.equal(f.state().audits[0].details.after.totalCents, 12000); assert.equal(f.state().audits[0].details.reason, input.reason);
  assert.equal(result.user.passwordHash, undefined); assert.equal(result.entryQr, null);
  assert.equal(result.entryVersion, undefined);
});

test('sales price review cannot override server prices or revive an expired reservation', async () => {
  const f = fixture(), input = { ...f.input(), expectedTotalCents: 1, reason: 'Tentativa de preço' };
  await assert.rejects(f.store.update('admin', input), { code: 'TICKET_PRICE_CHANGED' });
  assert.equal(f.state().ticket.priceCents, 5000); assert.equal(f.state().audits.length, 0);
  f.advance(900001);
  await assert.rejects(f.store.update('admin', { ...input, expectedTotalCents: 5000 }), { code: 'RESERVATION_EXPIRED' });
  const g = fixture();
  g.afterAggregate(() => g.advance(900001));
  await assert.rejects(g.store.update('admin', { ...g.input(), expectedTotalCents: 5000, reason: 'Prazo encerrado' }), { code: 'RESERVATION_EXPIRED' });
});

test('sales edit validates same match, live holder and open sales', async () => {
  const f = fixture();
  await assert.rejects(f.store.quote({ ...f.input(), sectorId: randomUUID() }), { code: 'INVALID_SECTOR' });
  f.state().user.active = false;
  await assert.rejects(f.store.quote(f.input()), { code: 'HOLDER_DISABLED' });
  f.state().user.active = true; f.state().match.salesEnabled = false;
  await assert.rejects(f.store.quote(f.input()), { code: 'SALES_CLOSED' });
});

function markPaid(f, used = 0) {
  Object.assign(f.state().ticket, { status: used === 2 ? 'USED' : 'ISSUED', usedQuantity: used, expiresAt: null, payment: { id: randomUUID(), method: 'MANUAL', amountCents: 5000, confirmedById: 'admin', reference: 'original receipt', confirmedAt: start } });
  f.state().admissions = used;
}

test('paid sales can change sector and quantity while keeping the original receipt and total', async () => {
  const f = fixture(); markPaid(f); const receipt = structuredClone(f.state().ticket.payment);
  f.state().match.salesEnabled = false; f.state().user.active = false;
  const input = { ...f.input(), sectorId: f.otherId, quantity: 3 };
  const quote = await f.store.quote(input);
  assert.equal(quote.priceLocked, true); assert.equal(quote.totalCents, 5000); assert.equal(quote.unitPriceCents, null);
  const edited = await f.store.update('admin', { ...input, expectedTotalCents: 5000, reason: 'Correção administrativa' });
  assert.equal(edited.quantity, 3); assert.equal(edited.sector.id, f.otherId); assert.equal(edited.status, 'ISSUED');
  assert.deepEqual(f.state().ticket.payment, receipt); assert.equal(edited.priceCents, 5000); assert.equal(edited.expiresAt, null);
  assert.equal(f.state().ticket.entryVersion, 1); assert.deepEqual(f.state().codes, []);
  await assert.rejects(f.store.update('admin', { ...f.input(), expectedTotalCents: 1, reason: 'Não altera recibo' }), { code: 'TICKET_PRICE_CHANGED' });
});

test('paid edits preserve consumed entrances and never transfer an already used sector', async () => {
  const f = fixture(); markPaid(f, 2);
  await assert.rejects(f.store.quote({ ...f.input(), quantity: 1 }), { code: 'QUANTITY_BELOW_USED' });
  await assert.rejects(f.store.quote({ ...f.input(), sectorId: f.otherId }), { code: 'USED_SECTOR_PROTECTED' });
  const edited = await f.store.update('admin', { ...f.input(), quantity: 3, expectedTotalCents: 5000, reason: 'Entrada adicional autorizada' });
  assert.equal(edited.usedQuantity, 2); assert.equal(edited.status, 'ISSUED'); assert.equal(edited.remainingQuantity, 1);
  assert.equal(f.state().admissions, 2);
});

test('inconsistent payments or entry counters reject edits without losing history', async () => {
  const f = fixture(); markPaid(f); f.state().ticket.payment.amountCents = 100;
  await assert.rejects(f.store.quote(f.input()), { code: 'SALE_PAYMENT_INCONSISTENT' });
  const g = fixture(); g.state().admissions = 1;
  await assert.rejects(g.store.remove('admin', { ...g.input(), reason: 'Conferir registros' }), { code: 'SALE_ENTRY_INCONSISTENT' });
  assert.equal(g.state().ticket.deletedAt, null);
});

test('free edits issue a receipt atomically and allow logical deletion without removing that receipt', async () => {
  const f = fixture(); f.state().match.sectors[0].priceCents = 0;
  const result = await f.store.update('admin', { ...f.input(), expectedTotalCents: 0, reason: 'Troca para cortesia' });
  assert.equal(result.status, 'ISSUED'); assert.equal(result.expiresAt, null); assert.equal(result.payment.method, 'FREE');
  await f.store.remove('admin', { ...f.input(), reason: 'Excluir cortesia' });
  assert.equal(f.state().ticket.payment.method, 'FREE'); assert.ok(f.state().ticket.deletedAt);
});

test('unpaid active, expired and cancelled sales delete while their audit is preserved', async () => {
  for (const status of ['PENDING', 'EXPIRED', 'CANCELED']) {
    const f = fixture();
    if (status === 'CANCELED') f.state().ticket.status = status;
    if (status === 'EXPIRED') f.advance(900001);
    const result = await f.store.remove('admin', { ...f.input(), reason: 'Reserva duplicada' });
    assert.equal(result.ticketId, f.ticketId); assert.equal(result.deleted, true); assert.ok(f.state().ticket.deletedAt);
    assert.equal(f.state().ticket.status, 'CANCELED'); assert.equal(f.state().ticket.voidedQuantity, 2);
    assert.equal(f.state().audits[0].action, 'TICKET_SALE_DELETED'); assert.equal(f.state().audits[0].details.totalCents, 5000);
    assert.deepEqual(f.state().codes, []);
  }
});

test('paid deletion preserves receipt and admissions, holds used places and invalidates access', async () => {
  for (const used of [0, 1, 2]) {
    const f = fixture(); markPaid(f, used); const receipt = structuredClone(f.state().ticket.payment);
    await f.store.remove('admin', { ...f.input(), reason: 'Excluir venda paga' });
    const ticket = f.state().ticket;
    assert.deepEqual(ticket.payment, receipt); assert.equal(f.state().admissions, used);
    assert.equal(ticket.quantity, 2); assert.equal(ticket.usedQuantity, used); assert.equal(ticket.voidedQuantity, 2 - used);
    assert.equal(occupiedQuantity({ quantity: ticket.quantity, voidedQuantity: ticket.voidedQuantity }), used);
    assert.equal(ticket.entryVersion, 1); assert.deepEqual(f.state().codes, []);
    assert.throws(() => assertTicketPaid(ticket), { code: 'SALE_DELETED' });
    assert.throws(() => assertAdmission(ticket, 1), { code: 'SALE_DELETED' });
    await assert.rejects(f.store.quote(f.input()), { code: 'SALE_DELETED' });
    await assert.rejects(f.store.remove('admin', { ...f.input(), reason: 'Repetição da exclusão' }), { code: 'SALE_DELETED' });
  }
});

test('edit and deletion roll back if the audit cannot be recorded', async () => {
  for (const action of ['update', 'remove']) {
    const f = fixture(); f.breakAudit(); const before = structuredClone(f.state());
    await assert.rejects(f.store[action]('admin', { ...f.input(), sectorId: f.otherId, expectedTotalCents: 8000, reason: 'Auditoria obrigatória' }), /audit unavailable/);
    assert.deepEqual(f.state(), before);
  }
});

test('stale operators and reused reservation IDs cannot delete a newer generation', async () => {
  const f = fixture(), original = f.input();
  const outcomes = await Promise.allSettled([
    f.store.update('admin', { ...original, sectorId: f.otherId, expectedTotalCents: 8000, reason: 'Primeira alteração' }),
    f.store.remove('admin', { ...original, reason: 'Exclusão desatualizada' }),
  ]);
  assert.equal(outcomes[0].status, 'fulfilled'); assert.equal(outcomes[1].reason.code, 'SALE_CHANGED'); assert.ok(f.state().ticket);
  const g = fixture(), old = g.input(); g.state().ticket.createdAt = new Date(start.getTime() + 1);
  await assert.rejects(g.store.remove('admin', { ...old, reason: 'Nova reserva no mesmo ID' }), { code: 'SALE_CHANGED' });
});

test('strict sales schemas reject price injection, transfer, empty reasons and oversized quantities', () => {
  const f = fixture(), input = f.input();
  assert.ok(saleQuoteSchema.safeParse(input).success);
  assert.ok(saleDeleteSchema.safeParse({ ticketId: input.ticketId, revision: input.revision, reason: 'Pedido incorreto' }).success);
  for (const extra of [{ quantity: 5 }, { quantity: 0 }, { quantity: 1.5 }, { priceCents: 10 }, { userId: randomUUID() }, { matchId: randomUUID() }, { status: 'ISSUED' }, { revision: 'old' }]) assert.equal(saleQuoteSchema.safeParse({ ...input, ...extra }).success, false);
  assert.equal(saleUpdateSchema.safeParse({ ...input, expectedTotalCents: 5000, reason: '   ' }).success, false);
});

test('DELETE and PATCH sales use authenticated admin access, JSON validation and browser preflight', async () => {
  let role = 'USER'; const f = fixture();
  const routes = [
    { method: 'PATCH', path: '/sales', private: true, admin: true, handler: async ({ body, user }) => ({ data: await f.store.update(user.id, saleUpdateSchema.parse(body)) }) },
    { method: 'DELETE', path: '/sales', private: true, admin: true, handler: async ({ body, user }) => ({ data: await f.store.remove(user.id, saleDeleteSchema.parse(body)) }) },
  ];
  const app = createApp({ routes, corsOrigins: ['http://localhost:8082'], authenticate: async (token) => { if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Login necessário.'); return { user: { id: 'admin', role, active: true } }; }, logger: { info() {}, error() {} } });
  const input = { ticketId: f.ticketId, revision: f.input().revision, reason: 'Reserva removida' };
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer test.header.signature', Origin: 'http://localhost:8082' };
  const preflight = await inject(app, '/sales', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8082', 'Access-Control-Request-Method': 'DELETE' } });
  assert.equal(preflight.status, 204); assert.ok(preflight.headers.get('access-control-allow-methods').includes('DELETE'));
  assert.equal((await inject(app, '/sales', { method: 'DELETE', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } })).status, 401);
  for (role of ['USER', 'GATE']) assert.equal((await inject(app, '/sales', { method: 'DELETE', body: JSON.stringify(input), headers })).status, 403);
  role = 'ADMIN';
  assert.equal((await inject(app, '/sales', { method: 'DELETE', body: '{}', headers })).status, 422);
  const edited = await inject(app, '/sales', { method: 'PATCH', body: JSON.stringify({ ...f.input(), sectorId: f.otherId, expectedTotalCents: 8000, reason: 'Trocar setor' }), headers });
  assert.equal(edited.status, 200);
  const deleted = await inject(app, '/sales', { method: 'DELETE', body: JSON.stringify({ ...input, revision: f.input().revision }), headers });
  assert.equal(deleted.status, 200); assert.equal((await deleted.json()).data.deleted, true); assert.ok(f.state().ticket.deletedAt);
});
