import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTicketCheckoutStore } from '../src/models/ticket-checkout.store.js';
import { ticketSchema, ticketPurchaseSchema } from '../src/validators/index.js';
const start = new Date('2026-10-30T18:00:00Z');

function fixture() {
  const matchId = randomUUID(), sectorId = randomUUID(), userId = randomUUID();
  let clock = start, tail = Promise.resolve(), afterAggregate = () => {}, failAudit = false;
  let state = {
    user: { id: userId, active: true, role: 'USER', membership: null }, occupied: 0, order: null, audits: [],
    match: { id: matchId, homeTeam: 'Nacional', awayTeam: 'Visitante', startsAt: new Date(start.getTime() + 7200000), published: true, salesEnabled: true, salesOpenAt: null, salesCloseAt: null, sectors: [{ id: sectorId, matchId, name: 'Sol', capacity: 4, priceCents: 2500, salesEnabled: true }] },
  };
  const view = () => state.order ? structuredClone({ ...state.order, match: state.match, sector: state.match.sectors[0] }) : null;
  const tx = {
    match: { findUnique: async ({ where }) => where.id === matchId ? structuredClone(state.match) : null },
    user: { findUnique: async () => structuredClone(state.user) },
    ticket: {
      findFirst: async ({ where }) => { assert.equal(where.deletedAt, null); return state.order?.deletedAt ? null : view(); },
      findUnique: async () => view(),
      aggregate: async () => { const quantity = state.occupied; afterAggregate(); return { _sum: { quantity } }; },
      create: async ({ data }) => { state.order = { ...data, id: randomUUID(), createdAt: clock, payment: null }; return view(); },
      update: async ({ data }) => { Object.assign(state.order, data); return view(); },
    },
    ticketPayment: { create: async ({ data }) => { state.order.payment = { ...data, confirmedAt: clock }; } },
    auditLog: { create: async ({ data }) => { if (failAudit) throw new Error('audit unavailable'); state.audits.push(data); } },
  };
  const client = { $transaction(work, options) {
    assert.equal(options.isolationLevel, 'Serializable');
    const result = tail.then(async () => { const before = structuredClone(state); try { return await work(tx); } catch (error) { state = before; throw error; } });
    tail = result.catch(() => {}); return result;
  } };
  return { store: createTicketCheckoutStore(client, { now: () => clock }), input: { matchId, sectorId, quantity: 2 }, userId, state: () => state, advance: (ms) => { clock = new Date(start.getTime() + ms); }, afterAggregate: (fn) => { afterAggregate = fn; }, breakAudit: () => { failAudit = true; } };
}

test('checkout quote rounds each discounted unit, exposes actual capacity and never holds stock', async () => {
  const f = fixture(), state = f.state();
  state.match.sectors[0].priceCents = 999;
  state.user.membership = { status: 'ACTIVE', validUntil: new Date(start.getTime() + 30000), plan: { discountPercent: 15 } };
  const quote = await f.store.quote(f.userId, { ...f.input, quantity: 4 });
  assert.equal(quote.available, 4); assert.equal(quote.unitPriceCents, 849); assert.equal(quote.totalCents, 3396); assert.equal(quote.subtotalCents, 3996); assert.equal(quote.discountCents, 600);
  assert.equal(quote.expiresAt, state.user.membership.validUntil.toISOString());
  assert.equal(state.order, null); assert.equal(state.audits.length, 0);
  assert.ok(!JSON.stringify(quote).includes('password'));
});

test('only live buyer accounts can quote; draft, wrong sector and unavailable sales cannot reserve', async () => {
  const f = fixture();
  f.state().user.active = false;
  await assert.rejects(f.store.quote(f.userId, f.input), { code: 'TICKET_ACCOUNT_REQUIRED' });
  f.state().user.active = true; f.state().user.role = 'GATE';
  await assert.rejects(f.store.reserve(f.userId, f.input), { code: 'TICKET_ACCOUNT_REQUIRED' });
  f.state().user.role = 'USER';
  await assert.rejects(f.store.quote(f.userId, { ...f.input, sectorId: randomUUID() }), { code: 'INVALID_SECTOR' });
  f.state().match.published = false;
  await assert.rejects(f.store.quote(f.userId, f.input), { code: 'SALES_CLOSED' });
  assert.equal(f.state().order, null);
});

test('a price changed since review is rejected atomically and cannot be overridden by client totals', async () => {
  const f = fixture();
  const quote = await f.store.quote(f.userId, f.input);
  f.state().match.sectors[0].priceCents = 3000;
  await assert.rejects(f.store.reserve(f.userId, { ...f.input, expectedTotalCents: quote.totalCents }), { code: 'TICKET_PRICE_CHANGED' });
  assert.equal(f.state().order, null); assert.equal(f.state().audits.length, 0);
  const fresh = await f.store.quote(f.userId, f.input);
  assert.equal((await f.store.reserve(f.userId, { ...f.input, expectedTotalCents: fresh.totalCents })).priceCents, 6000);
});

test('a quote does not guarantee stock: capacity is checked again inside reservation', async () => {
  const f = fixture();
  await f.store.quote(f.userId, f.input);
  f.state().occupied = 3;
  await assert.rejects(f.store.reserve(f.userId, { ...f.input, expectedTotalCents: 5000 }), { code: 'SECTOR_SOLD_OUT' });
  assert.equal(f.state().order, null);
});

test('membership expiry and closing during DB waits cannot preserve an outdated checkout price/window', async () => {
  const f = fixture();
  f.state().user.membership = { status: 'ACTIVE', validUntil: new Date(start.getTime() + 1000), plan: { discountPercent: 20 } };
  f.afterAggregate(() => f.advance(1000));
  await assert.rejects(f.store.reserve(f.userId, { ...f.input, expectedTotalCents: 4000 }), { code: 'TICKET_PRICE_CHANGED' });
  assert.equal(f.state().order, null);
  const g = fixture();
  g.state().match.salesCloseAt = new Date(start.getTime() + 1000); g.afterAggregate(() => g.advance(1000));
  await assert.rejects(g.store.reserve(g.userId, g.input), { code: 'SALES_CLOSED' });
  assert.equal(g.state().order, null);
});

test('paid checkout reserves until the sale deadline, records an audit and never claims payment', async () => {
  const f = fixture();
  f.state().match.salesCloseAt = new Date(start.getTime() + 5 * 60000);
  const result = await f.store.reserve(f.userId, { ...f.input, expectedTotalCents: 5000 });
  assert.equal(result.status, 'PENDING'); assert.equal(result.payment, null); assert.equal(result.priceCents, 5000);
  assert.equal(result.expiresAt.toISOString(), f.state().match.salesCloseAt.toISOString());
  assert.equal(f.state().audits[0].action, 'TICKET_RESERVED');
  assert.ok(!Object.hasOwn(result, 'entryToken')); assert.equal(result.entryQr, null);
  await assert.rejects(f.store.reserve(f.userId, f.input), { code: 'TICKET_EXISTS' });
});

test('free checkout emits one paid-zero receipt, blocks duplicates, and audit failure rolls back everything', async () => {
  const f = fixture(); f.state().match.sectors[0].priceCents = 0;
  const result = await f.store.reserve(f.userId, { ...f.input, expectedTotalCents: 0 });
  assert.equal(result.status, 'ISSUED'); assert.equal(result.payment.method, 'FREE'); assert.equal(result.payment.amountCents, 0); assert.equal(result.expiresAt, null);
  assert.equal(f.state().audits[0].action, 'TICKET_FREE_ISSUED');
  await assert.rejects(f.store.reserve(f.userId, f.input), { code: 'TICKET_EXISTS' });
  const g = fixture(); g.state().match.sectors[0].priceCents = 0; g.breakAudit();
  await assert.rejects(g.store.reserve(g.userId, g.input), /audit unavailable/);
  assert.equal(g.state().order, null); assert.equal(g.state().audits.length, 0);
});

test('a cancelled unpaid reservation can be replaced; validators reject forged price/discount fields', async () => {
  const f = fixture(), previousId = randomUUID();
  f.state().order = { id: previousId, status: 'CANCELED', payment: null, createdAt: new Date(start.getTime() - 60000) };
  const replaced = await f.store.reserve(f.userId, f.input);
  assert.equal(replaced.id, previousId); assert.equal(replaced.status, 'PENDING');
  assert.equal(ticketSchema.safeParse({ ...f.input, priceCents: 1 }).success, false);
  assert.equal(ticketPurchaseSchema.safeParse({ ...f.input, expectedTotalCents: 0 }).success, true);
  assert.equal(ticketPurchaseSchema.safeParse({ ...f.input, expectedTotalCents: -1 }).success, false);
  assert.equal(ticketPurchaseSchema.safeParse({ ...f.input, discountPercent: 100 }).success, false);
});
