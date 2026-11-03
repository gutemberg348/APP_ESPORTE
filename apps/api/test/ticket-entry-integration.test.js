import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createTicketQr } from '../src/lib/ticket-qr.js';
import { createTicketEntryStore } from '../src/models/ticket-entry.store.js';

test('PostgreSQL gate: one live QR cannot authorize two readers while remaining capacity exists', { skip: process.env.RUN_DB_TESTS !== 'true' }, async (t) => {
  const { db } = await import('../src/config/database.js');
  const { env } = await import('../src/config/env.js');
  if (env.NODE_ENV === 'production') throw new Error('Use somente banco de desenvolvimento.');
  const nonce = randomUUID(), userIds = [];
  let matchId, ticketId;
  t.after(async () => {
    await db.$transaction([
      db.auditLog.deleteMany({ where: { actorId: { in: userIds } } }),
      db.ticketAdmission.deleteMany({ where: { ticketId: ticketId || '00000000-0000-4000-8000-000000000000' } }),
      db.ticketPayment.deleteMany({ where: { ticketId: ticketId || '00000000-0000-4000-8000-000000000000' } }),
      db.ticket.deleteMany({ where: { id: ticketId || '00000000-0000-4000-8000-000000000000' } }),
      db.match.deleteMany({ where: { id: matchId || '00000000-0000-4000-8000-000000000000' } }),
      db.user.deleteMany({ where: { id: { in: userIds } } }),
    ]);
    await db.$disconnect();
  });
  async function user(label, role = 'USER') {
    const value = await db.user.create({ data: { name: label, email: `${label}-${nonce}@gate.test.local`, passwordHash: 'unused-test-hash', role } });
    userIds.push(value.id); return value;
  }
  const owner = await user('owner'), firstOperator = await user('operator-one', 'ADMIN'), secondOperator = await user('operator-two', 'ADMIN');
  const instant = new Date();
  const match = await db.match.create({ data: { slug: `gate-${nonce}`, homeTeam: 'Nacional Teste', awayTeam: 'Visitante', startsAt: new Date(instant.getTime() + 3600000), stadium: 'Teste', competition: 'Teste', entryEnabled: true, published: true, gateOpenAt: new Date(instant.getTime() - 60000), gateCloseAt: new Date(instant.getTime() + 7200000), sectors: { create: { name: 'Sol', capacity: 10, priceCents: 2500 } } }, include: { sectors: true } });
  matchId = match.id; const sector = match.sectors[0];
  const ticket = await db.ticket.create({ data: { userId: owner.id, matchId, sectorId: sector.id, status: 'ISSUED', quantity: 4, priceCents: 10000, payment: { create: { method: 'MANUAL', amountCents: 10000, reference: `GATE-${nonce}`, confirmedById: firstOperator.id } } } }); ticketId = ticket.id;
  const store = createTicketEntryStore(db);
  const codec = createTicketQr({ secret: randomBytes(64).toString('hex'), issuer: 'gate-test' });
  const owned = await store.ownedTicket(owner.id, ticket.id);
  await assert.rejects(store.ownedTicket(firstOperator.id, ticket.id), { code: 'TICKET_NOT_FOUND' });
  const token = await codec.issue(owned.ticket, owned.gate.closesAt), claims = await codec.verify(token.token);
  const parallelToken = await codec.issue(owned.ticket, owned.gate.closesAt);
  const input = { matchId, sectorId: sector.id, quantity: 1, requestKey: randomUUID() };
  const input2 = { ...input, requestKey: randomUUID() };
  const attempts = await Promise.allSettled([store.admit(firstOperator.id, claims, input), store.admit(secondOperator.id, claims, input2)]);
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(attempts.find((result) => result.status === 'rejected').reason.code, 'TICKET_QR_USED');
  let stored = await db.ticket.findUnique({ where: { id: ticket.id } });
  assert.equal(stored.usedQuantity, 1); assert.equal(stored.entryVersion, 1); assert.equal(stored.status, 'ISSUED');
  assert.equal(await db.ticketAdmission.count({ where: { ticketId } }), 1);
  const winnerId = attempts[0].status === 'fulfilled' ? firstOperator.id : secondOperator.id;
  const winnerInput = attempts[0].status === 'fulfilled' ? input : input2;
  const retry = await store.admit(winnerId, claims, winnerInput);
  assert.equal(retry.decision, 'ALREADY_RECORDED'); assert.equal(retry.duplicate, true);
  assert.equal((await store.receipt(winnerId, { ...winnerInput, ticketId })).admission.id, retry.admission.id);
  await assert.rejects(store.inspect(await codec.verify(parallelToken.token), input), { code: 'TICKET_QR_USED' });
  const freshOwned = await store.ownedTicket(owner.id, ticket.id);
  const refreshed = await codec.verify((await codec.issue(freshOwned.ticket, freshOwned.gate.closesAt)).token);
  await assert.rejects(store.inspect(refreshed, { ...input, matchId: randomUUID() }), { code: 'WRONG_MATCH' });
  await assert.rejects(store.inspect(refreshed, { ...input, sectorId: randomUUID() }), { code: 'WRONG_SECTOR' });
  await db.match.update({ where: { id: matchId }, data: { entryEnabled: false } });
  await assert.rejects(store.admit(winnerId, refreshed, { ...input, requestKey: randomUUID() }), { code: 'GATE_DISABLED' });
  assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).usedQuantity, 1);
  await db.match.update({ where: { id: matchId }, data: { entryEnabled: true } });
  await db.user.update({ where: { id: owner.id }, data: { active: false } });
  await assert.rejects(store.inspect(refreshed, input), { code: 'HOLDER_DISABLED' });
  await db.user.update({ where: { id: owner.id }, data: { active: true } });
  await db.ticketPayment.update({ where: { ticketId }, data: { amountCents: 1 } });
  await assert.rejects(store.inspect(refreshed, input), { code: 'TICKET_PAYMENT_NOT_CONFIRMED' });
  await db.ticketPayment.update({ where: { ticketId }, data: { amountCents: 10000 } });
  await store.admit(winnerId, refreshed, { ...input, quantity: 3, requestKey: randomUUID() });
  stored = await db.ticket.findUnique({ where: { id: ticket.id } });
  assert.equal(stored.usedQuantity, 4); assert.equal(stored.status, 'USED');
  await assert.rejects(store.ownedTicket(owner.id, ticket.id), { code: 'INVALID_TICKET' });
});
