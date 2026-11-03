import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { decodeJwt, SignJWT } from 'jose';
import { createTicketQr } from '../src/lib/ticket-qr.js';
import { gateWindow, assertGateOpen, assertTicketPaid, assertEntryContext } from '../src/lib/ticket-rules.js';
import { createTicketEntryStore } from '../src/models/ticket-entry.store.js';
import { createTicketCodeStore } from '../src/models/ticket-code.store.js';
import { AppError } from '../src/lib/errors.js';
import { ticketCodeSchema, admissionSchema } from '../src/validators/admin.js';
const baseTime = new Date('2026-10-30T18:00:00Z');
test('camera and typed code consume the same scan and invalidate each other after entry', async () => {
  for (const first of ['camera', 'code']) {
    const f = fixture(), value = f.state().ticket;
    const codec = createTicketQr({ secret: randomBytes(64).toString('hex'), issuer: 'test-api', now: () => baseTime });
    const issued = await codec.issue(value, new Date(baseTime.getTime() + 3600000));
    let row;
    const codes = createTicketCodeStore({ ticketAccessCode: { create: async ({ data }) => { row = data; }, findUnique: async () => ({ ...row, ticket: value }) } }, { now: () => baseTime });
    const code = await codes.create(value, issued);
    const camera = await codec.verify(issued.token), manual = await codes.resolve(code);
    assert.deepEqual(manual, camera);
    const actorId = randomUUID(), input = { matchId: value.matchId, sectorId: value.sectorId, quantity: 1, requestKey: randomUUID() };
    await f.store.inspect(first === 'camera' ? camera : manual, input);
    const result = await f.store.admit(actorId, first === 'camera' ? camera : manual, input);
    assert.equal(result.decision, 'ALLOW');
    const repeat = await f.store.admit(actorId, first === 'camera' ? manual : camera, input);
    assert.equal(repeat.decision, 'ALREADY_RECORDED');
    await assert.rejects(f.store.admit(actorId, first === 'camera' ? manual : camera, { ...input, requestKey: randomUUID() }), { code: 'TICKET_QR_USED' });
    assert.equal(f.state().ticket.usedQuantity, 1);
    assert.equal(f.state().admissions.length, 1);
  }
});

test('assignment revocation after inspection is checked inside admission before consuming or auditing', async () => {
  let allowed = true, authorizations = 0;
  const f = fixture({ authorize: async () => { authorizations++; if (!allowed) throw new AppError(403, 'GATE_SCOPE_DENIED', 'Revoked'); } });
  const value = f.state().ticket, claims = claimsOf(value), input = { matchId: value.matchId, sectorId: value.sectorId, quantity: 1, requestKey: randomUUID() };
  await f.store.inspect(claims, input);
  allowed = false;
  await assert.rejects(f.store.admit(randomUUID(), claims, input), { code: 'GATE_SCOPE_DENIED' });
  assert.equal(authorizations, 1); assert.equal(f.state().ticket.usedQuantity, 0);
  assert.equal(f.state().admissions.length, 0); assert.equal(f.state().audits.length, 0);
});
function ticket() {
  const matchId = randomUUID(), sectorId = randomUUID(), userId = randomUUID();
  return {
    id: randomUUID(), matchId, sectorId, userId, status: 'ISSUED', priceCents: 10000, quantity: 4, usedQuantity: 0, entryVersion: 0,
    entryToken: null, payment: { method: 'MANUAL', amountCents: 10000, confirmedById: randomUUID() },
    user: { id: userId, name: 'Titular teste', active: true }, sector: { id: sectorId, name: 'Sol' },
    match: { id: matchId, homeTeam: 'Nacional', awayTeam: 'Visitante', startsAt: new Date(baseTime.getTime() + 3600000), entryEnabled: true, gateOpenAt: null, gateCloseAt: null },
  };
}
function claimsOf(value) { return { ticketId: value.id, matchId: value.matchId, sectorId: value.sectorId, version: value.entryVersion, scanId: randomUUID(), expiresAt: new Date(baseTime.getTime() + 45000) }; }
function fixture(options = {}) {
  let state = { ticket: ticket(), admissions: [], audits: [] };
  let instant = baseTime, tail = Promise.resolve(), failAudit = false, expireDuringWrite = false;
  const client = {
    ticket: {
      async findUnique() { return structuredClone(state.ticket); },
      async findFirst({ where }) { return where.id === state.ticket.id && where.userId === state.ticket.userId ? structuredClone(state.ticket) : null; },
      async updateMany({ where, data }) {
        const row = state.ticket;
        if (row.entryVersion !== where.entryVersion || row.usedQuantity !== where.usedQuantity || row.status !== where.status) return { count: 0 };
        row.entryVersion += data.entryVersion.increment; row.usedQuantity = data.usedQuantity; row.status = data.status;
        if (expireDuringWrite) instant = new Date(baseTime.getTime() + 46000);
        return { count: 1 };
      },
    },
    ticketAdmission: {
      async findUnique({ where, include }) {
        const result = state.admissions.find((row) => where.scanId ? row.scanId === where.scanId : row.ticketId === where.ticketId_requestKey.ticketId && row.requestKey === where.ticketId_requestKey.requestKey);
        return result ? structuredClone({ ...result, ...(include ? { ticket: state.ticket } : {}) }) : null;
      },
      async create({ data }) { const value = { ...data, id: randomUUID(), createdAt: instant }; state.admissions.push(value); return structuredClone(value); },
    },
    auditLog: { async create({ data }) { if (failAudit) throw new Error('Audit storage unavailable'); state.audits.push(data); return data; } },
    $transaction(work, options) {
      assert.equal(options.isolationLevel, 'Serializable');
      // Execute the real store against atomic, rollback-capable persistence.
      // PostgreSQL SSI behavior is covered separately in integration tests.
      const task = tail.then(async () => { const before = structuredClone(state); try { return await work(client); } catch (error) { state = before; throw error; } });
      tail = task.catch(() => {}); return task;
    },
  };
  return { store: createTicketEntryStore(client, { now: () => instant, ...options }), state: () => state, setTime: (value) => { instant = value; }, breakAudit: () => { failAudit = true; }, expireDuringWrite: () => { expireDuringWrite = true; } };
}
test('ticket JWT is short lived, tied to match/sector/version and rejects tampering and wrong token type', async () => {
  const value = ticket(), secret = randomBytes(64).toString('hex');
  const codec = createTicketQr({ secret, issuer: 'test-api', now: () => baseTime });
  const issued = await codec.issue(value, new Date(baseTime.getTime() + 3600000));
  const claims = await codec.verify(issued.token);
  assert.equal(claims.ticketId, value.id); assert.equal(claims.matchId, value.matchId); assert.equal(claims.version, 0);
  assert.equal(Date.parse(issued.expiresAt) - baseTime.getTime(), 45000);
  const expired = createTicketQr({ secret, issuer: 'test-api', now: () => new Date(baseTime.getTime() + 45000) });
  await assert.rejects(expired.verify(issued.token), { code: 'TICKET_QR_EXPIRED' });
  const parts = issued.token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ ...decodeJwt(issued.token), mid: randomUUID() })).toString('base64url');
  await assert.rejects(codec.verify(`${parts[0]}.${forgedPayload}.${parts[2]}`), { code: 'INVALID_TICKET_QR' });
  const loginType = await new SignJWT(decodeJwt(issued.token)).setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' }).sign(new TextEncoder().encode(secret));
  await assert.rejects(codec.verify(loginType), { code: 'INVALID_TICKET_QR' });
  await assert.rejects(codec.verify(randomBytes(32).toString('base64url')), { code: 'INVALID_TICKET_QR' });
  assert.equal(ticketCodeSchema.safeParse({ token: issued.token, matchId: value.matchId }).success, false);
  assert.equal(ticketCodeSchema.safeParse({ token: issued.token, matchId: value.matchId, sectorId: value.sectorId }).success, true);
  assert.equal(admissionSchema.safeParse({ token: issued.token, matchId: value.matchId, sectorId: value.sectorId, quantity: 5, requestKey: randomUUID() }).success, false);
});
test('gate has explicit enablement and enforces opening/closing boundaries', () => {
  const value = ticket(), gate = gateWindow(value.match);
  assert.equal(value.match.startsAt - gate.opensAt, 2 * 3600000);
  assert.equal(gate.closesAt - value.match.startsAt, 4 * 3600000);
  assert.throws(() => assertGateOpen({ ...value.match, entryEnabled: false }, baseTime), { code: 'GATE_DISABLED' });
  assert.throws(() => assertGateOpen(value.match, new Date(gate.opensAt - 1)), { code: 'GATE_NOT_OPEN' });
  assert.doesNotThrow(() => assertGateOpen(value.match, gate.opensAt));
  assert.throws(() => assertGateOpen(value.match, gate.closesAt), { code: 'GATE_CLOSED' });
});
test('paid status alone is insufficient: receipt, exact amount and active holder are required', () => {
  const value = ticket();
  assert.doesNotThrow(() => assertTicketPaid(value));
  assert.throws(() => assertTicketPaid({ ...value, payment: null }), { code: 'TICKET_PAYMENT_NOT_CONFIRMED' });
  assert.throws(() => assertTicketPaid({ ...value, payment: { ...value.payment, amountCents: 1 } }), { code: 'TICKET_PAYMENT_NOT_CONFIRMED' });
  assert.throws(() => assertTicketPaid({ ...value, payment: { ...value.payment, confirmedById: null } }), { code: 'TICKET_PAYMENT_NOT_CONFIRMED' });
  assert.throws(() => assertTicketPaid({ ...value, user: { ...value.user, active: false } }), { code: 'HOLDER_DISABLED' });
  assert.doesNotThrow(() => assertTicketPaid({ ...value, priceCents: 0, payment: { method: 'FREE', amountCents: 0 } }));
});
test('wrong match, wrong gate sector, stale version and cancelled ticket are rejected', () => {
  const value = ticket(), claims = claimsOf(value);
  assert.throws(() => assertEntryContext(value, claims, randomUUID(), baseTime, value.sectorId), { code: 'WRONG_MATCH' });
  assert.throws(() => assertEntryContext(value, claims, value.matchId, baseTime, randomUUID()), { code: 'WRONG_SECTOR' });
  assert.throws(() => assertEntryContext({ ...value, entryVersion: 1 }, claims, value.matchId, baseTime), { code: 'TICKET_QR_USED' });
  assert.throws(() => assertEntryContext({ ...value, status: 'CANCELED' }, claims, value.matchId, baseTime), { code: 'INVALID_TICKET' });
});
test('only the owner can get QR data; inspection is read-only and never authorizes entrance', async () => {
  const { store, state } = fixture(); const value = state().ticket;
  await assert.rejects(store.ownedTicket(randomUUID(), value.id), { code: 'TICKET_NOT_FOUND' });
  const review = await store.inspect(claimsOf(value), { matchId: value.matchId, sectorId: value.sectorId });
  assert.equal(review.decision, 'REVIEW'); assert.equal(state().ticket.usedQuantity, 0);
  assert.equal(state().admissions.length, 0); assert.equal(review.entryQr, null);
});
test('one QR cannot release twice at concurrent readers, even with several places remaining', async () => {
  const { store, state } = fixture(), value = state().ticket, claims = claimsOf(value);
  const input = { matchId: value.matchId, sectorId: value.sectorId, quantity: 1, requestKey: randomUUID() };
  const results = await Promise.allSettled([store.admit(randomUUID(), claims, input), store.admit(randomUUID(), claims, { ...input, requestKey: randomUUID() })]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(state().ticket.usedQuantity, 1); assert.equal(state().ticket.entryVersion, 1);
  assert.equal(state().admissions.length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.code, 'TICKET_QR_USED');
});
test('retry returns a recorded receipt without a new authorization; keys are bound to operator and QR', async () => {
  const { store, state } = fixture(), value = state().ticket, claims = claimsOf(value), actor = randomUUID();
  const input = { matchId: value.matchId, sectorId: value.sectorId, quantity: 2, requestKey: randomUUID() };
  assert.equal((await store.admit(actor, claims, input)).decision, 'ALLOW');
  const retry = await store.admit(actor, claims, input);
  assert.equal(retry.duplicate, true); assert.equal(retry.decision, 'ALREADY_RECORDED');
  assert.equal(state().ticket.usedQuantity, 2);
  await assert.rejects(store.admit(randomUUID(), claims, input), { code: 'ADMISSION_KEY_CONFLICT' });
  const record = await store.receipt(actor, { ...input, ticketId: value.id });
  assert.equal(record.admission.id, retry.admission.id);
  await assert.rejects(store.receipt(randomUUID(), { ...input, ticketId: value.id }), { code: 'ADMISSION_NOT_FOUND' });
});
test('a refreshed QR can consume remaining places; over-consumption cannot change state', async () => {
  const { store, state } = fixture(), value = state().ticket, actor = randomUUID();
  const input = { matchId: value.matchId, sectorId: value.sectorId, quantity: 2, requestKey: randomUUID() };
  await store.admit(actor, claimsOf(value), input);
  await assert.rejects(store.admit(actor, claimsOf(state().ticket), { ...input, quantity: 3, requestKey: randomUUID() }), { code: 'TICKET_ALREADY_USED' });
  assert.equal(state().ticket.usedQuantity, 2);
  await store.admit(actor, claimsOf(state().ticket), { ...input, requestKey: randomUUID() });
  assert.equal(state().ticket.status, 'USED'); assert.equal(state().ticket.usedQuantity, 4);
});
test('expiry during database wait and audit failure both roll back admission', async () => {
  const first = fixture(), value = first.state().ticket;
  first.expireDuringWrite();
  await assert.rejects(first.store.admit(randomUUID(), claimsOf(value), { matchId: value.matchId, sectorId: value.sectorId, quantity: 1, requestKey: randomUUID() }), { code: 'TICKET_QR_EXPIRED' });
  assert.equal(first.state().ticket.usedQuantity, 0); assert.equal(first.state().admissions.length, 0);
  const second = fixture(), value2 = second.state().ticket;
  second.breakAudit();
  await assert.rejects(second.store.admit(randomUUID(), claimsOf(value2), { matchId: value2.matchId, sectorId: value2.sectorId, quantity: 1, requestKey: randomUUID() }));
  assert.equal(second.state().ticket.usedQuantity, 0); assert.equal(second.state().admissions.length, 0);
});
