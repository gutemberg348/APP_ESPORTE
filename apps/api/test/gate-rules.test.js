import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { newGateCode, normalizeGateCode, assertGateUser, assertGateScope, assertGateRoute } from '../src/lib/gate-rules.js';
import { authorizeGate } from '../src/models/gate-access.model.js';
import { createTicketCodeStore } from '../src/models/ticket-code.store.js';
import { hashToken } from '../src/lib/crypto.js';
import { ticketCodeSchema, admissionSchema } from '../src/validators/admin.js';
import { employeeCreateSchema, employeeAssignmentsSchema } from '../src/validators/staff.js';
import { registerSchema } from '../src/validators/index.js';

test('gate codes have 50 random bits and accept only the normalized 10-character alphabet', () => {
  const generated = Array.from({ length: 1000 }, newGateCode);
  assert.equal(new Set(generated).size, 1000);
  for (const code of generated) assert.match(code, /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
  assert.equal(normalizeGateCode('abcde-fghjk'), 'ABCDEFGHJK');
  assert.equal(normalizeGateCode(' ABCDE FGHJK '), 'ABCDEFGHJK');
  for (const code of ['00000-00000', 'IIIIIOOOOO', '', randomUUID(), undefined]) assert.throws(() => normalizeGateCode(code), { code: 'INVALID_GATE_CODE' });
});

test('entry schemas require exactly one credential and public registration cannot create an employee', () => {
  const context = { matchId: randomUUID(), sectorId: randomUUID() };
  assert.equal(ticketCodeSchema.parse({ ...context, code: 'abcde-fghjk' }).code, 'ABCDEFGHJK');
  assert.equal(ticketCodeSchema.safeParse(context).success, false);
  const token = `${'a'.repeat(20)}.${'b'.repeat(20)}.${'c'.repeat(20)}`;
  assert.equal(ticketCodeSchema.safeParse({ ...context, code: 'ABCDE-FGHJK', token }).success, false);
  assert.equal(admissionSchema.safeParse({ ...context, code: 'ABCDE-FGHJK', quantity: 1, requestKey: randomUUID() }).success, true);
  const account = { name: 'Porteiro', email: 'gate@example.com', password: 'SenhaSegura123' };
  assert.equal(employeeCreateSchema.safeParse(account).success, true);
  assert.equal(employeeCreateSchema.safeParse({ ...account, role: 'ADMIN' }).success, false);
  assert.equal(registerSchema.safeParse({ ...account, role: 'GATE' }).success, false);
  const sectorId = randomUUID();
  assert.equal(employeeAssignmentsSchema.safeParse({ userId: randomUUID(), sectorIds: [sectorId, sectorId] }).success, false);
});

test('gate role has no administrative or fan-account authority and assignments are checked live', async () => {
  const user = { id: randomUUID(), active: true, role: 'GATE' };
  assert.doesNotThrow(() => assertGateUser(user));
  assert.throws(() => assertGateUser({ ...user, role: 'USER' }), { code: 'GATE_REQUIRED' });
  assert.throws(() => assertGateUser({ ...user, active: false }), { code: 'GATE_REQUIRED' });
  assert.throws(() => assertGateScope(user, { userId: randomUUID(), active: true }), { code: 'GATE_SCOPE_DENIED' });
  assert.throws(() => assertGateRoute(user, { admin: true }), { code: 'GATE_ONLY_ACCOUNT' });
  assert.throws(() => assertGateRoute(user, { private: true }), { code: 'GATE_ONLY_ACCOUNT' });
  assert.doesNotThrow(() => assertGateRoute(user, { gate: true }));
  assert.doesNotThrow(() => assertGateRoute(user, { staffSelf: true }));
  let assignment = { userId: user.id, active: true }, correctSector = true;
  const client = { user: { findUnique: async () => user }, sector: { findFirst: async () => correctSector ? { id: 'sector' } : null }, gateAssignment: { findUnique: async () => assignment } };
  const context = { matchId: randomUUID(), sectorId: randomUUID() };
  await authorizeGate(client, user.id, context);
  assignment.active = false;
  await assert.rejects(authorizeGate(client, user.id, context), { code: 'GATE_SCOPE_DENIED' });
  user.role = 'ADMIN'; await authorizeGate(client, user.id, context);
  correctSector = false;
  await assert.rejects(authorizeGate(client, user.id, context), { code: 'GATE_SCOPE_DENIED' });
});

test('manual code stores only its hash, uses the QR scan/version and refuses missing or expired codes', async () => {
  const ticket = { id: randomUUID(), matchId: randomUUID(), sectorId: randomUUID(), entryVersion: 7 };
  let instant = new Date('2026-10-30T18:00:00Z'), saved;
  const client = { ticketAccessCode: {
    create: async ({ data }) => { saved = data; },
    findUnique: async ({ where }) => saved && where.codeHash === saved.codeHash ? { ...saved, ticket } : null,
  } };
  const store = createTicketCodeStore(client, { now: () => instant });
  const issued = { scanId: randomUUID(), expiresAt: new Date(instant.getTime() + 45000).toISOString() };
  const code = await store.create(ticket, issued);
  assert.equal(saved.codeHash, hashToken(normalizeGateCode(code)));
  assert.ok(!JSON.stringify(saved).includes(code));
  const claims = await store.resolve(code.toLowerCase());
  assert.equal(claims.scanId, issued.scanId); assert.equal(claims.version, 7); assert.equal(claims.matchId, ticket.matchId);
  await assert.rejects(store.resolve('ABCDE-FGHJK'), { code: 'GATE_CODE_NOT_FOUND' });
  instant = new Date(issued.expiresAt);
  await assert.rejects(store.resolve(code), { code: 'TICKET_QR_EXPIRED' });
});

test('manual code collisions retry; persistence outages never produce an unregistered code', async () => {
  let attempts = 0;
  const client = { ticketAccessCode: { create: async () => { attempts++; throw Object.assign(new Error('collision'), { code: 'P2002' }); } } };
  const store = createTicketCodeStore(client);
  await assert.rejects(store.create({ id: randomUUID(), entryVersion: 0 }, { scanId: randomUUID(), expiresAt: new Date().toISOString() }), { code: 'GATE_CODE_UNAVAILABLE' });
  assert.equal(attempts, 3);
  client.ticketAccessCode.create = async () => { throw new Error('database offline'); };
  await assert.rejects(store.create({ id: randomUUID(), entryVersion: 0 }, { scanId: randomUUID(), expiresAt: new Date().toISOString() }), /database offline/);
});
