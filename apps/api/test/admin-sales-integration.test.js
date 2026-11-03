import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('PostgreSQL: sales inventory, audit, stale edits and payment/delete races', { skip: process.env.RUN_DB_TESTS !== 'true', timeout: 30000 }, async (t) => {
  const { db } = await import('../src/config/database.js');
  const { env } = await import('../src/config/env.js');
  if (env.NODE_ENV === 'production') throw new Error('Use somente banco de desenvolvimento.');
  const { createAdminTicketStore } = await import('../src/models/admin-ticket.store.js');
  const { adminTicketRevision } = await import('../src/lib/admin-ticket-revision.js');
  const { ticketModel, withAvailability } = await import('../src/models/ticket.model.js');
  const { ticketInclude } = await import('../src/lib/ticket-serializers.js');
  const suffix = randomUUID(), users = [], matchIds = [];
  t.after(async () => {
    try {
      await db.$transaction([
        db.auditLog.deleteMany({ where: { actorId: { in: users } } }),
        db.ticketAdmission.deleteMany({ where: { ticket: { matchId: { in: matchIds } } } }),
        db.ticketPayment.deleteMany({ where: { ticket: { matchId: { in: matchIds } } } }),
        db.ticket.deleteMany({ where: { matchId: { in: matchIds } } }),
        db.match.deleteMany({ where: { id: { in: matchIds } } }),
        db.user.deleteMany({ where: { id: { in: users } } }),
      ]);
    } finally { await db.$disconnect(); }
  });
  const admin = await db.user.create({ data: { name: 'Teste vendas admin', email: `sales-admin-${suffix}@test.local`, role: 'ADMIN', passwordHash: 'test-only-no-login' } }); users.push(admin.id);
  const match = await db.match.create({ data: { slug: `test-sales-${suffix}`, homeTeam: 'Teste', awayTeam: 'Teste visitante', stadium: 'Teste', competition: 'Teste', published: true, startsAt: new Date(Date.now() + 86400000), sectors: { create: [{ name: 'Sol', capacity: 5, priceCents: 2500 }, { name: 'Sombra', capacity: 4, priceCents: 4000 }, { name: 'Cortesia', capacity: 4, priceCents: 0 }] } }, include: { sectors: true } }); matchIds.push(match.id);
  const sol = match.sectors.find((sector) => sector.name === 'Sol'), sombra = match.sectors.find((sector) => sector.name === 'Sombra'), free = match.sectors.find((sector) => sector.name === 'Cortesia');
  const store = createAdminTicketStore(db);
  let number = 0;
  async function reserve() {
    const user = await db.user.create({ data: { name: 'Comprador teste', email: `sales-buyer-${++number}-${suffix}@test.local`, passwordHash: 'test-only-no-login' } }); users.push(user.id);
    return db.ticket.create({ data: { userId: user.id, matchId: match.id, sectorId: sol.id, quantity: 2, priceCents: 5000, expiresAt: new Date(Date.now() + 900000) }, include: ticketInclude });
  }
  const input = (ticket) => ({ ticketId: ticket.id, revision: adminTicketRevision(ticket), sectorId: ticket.sectorId, quantity: ticket.quantity });
  const first = await reserve(), originalExpiry = first.expiresAt;
  const quote = await store.quote({ ...input(first), sectorId: sombra.id, quantity: 3 }); assert.equal(quote.totalCents, 12000);
  const edited = await store.update(admin.id, { ...input(first), sectorId: sombra.id, quantity: 3, expectedTotalCents: quote.totalCents, reason: 'Troca solicitada no teste' });
  assert.equal(edited.expiresAt.getTime(), originalExpiry.getTime());
  const available = (await withAvailability(db, [match]))[0].sectors;
  assert.equal(available.find((sector) => sector.id === sol.id).available, 5);
  assert.equal(available.find((sector) => sector.id === sombra.id).available, 1);
  await assert.rejects(store.remove(admin.id, { ticketId: first.id, revision: input(first).revision, reason: 'Versão antiga' }), { code: 'SALE_CHANGED' });
  await store.remove(admin.id, { ticketId: first.id, revision: edited.revision, reason: 'Excluir pedido de teste' });
  assert.equal(await db.ticket.count({ where: { id: first.id } }), 0);
  assert.equal(await db.auditLog.count({ where: { entityId: first.id, action: 'TICKET_SALE_DELETED' } }), 1);

  const second = await reserve();
  const race = await Promise.allSettled([
    store.update(admin.id, { ...input(second), quantity: 3, expectedTotalCents: 7500, reason: 'Concorrência com pagamento' }),
    ticketModel.confirm(admin.id, { ticketId: second.id, receivedCents: 5000, reference: `PAY-${suffix}` }),
  ]);
  assert.equal(race.filter((result) => result.status === 'fulfilled').length, 1);
  const winner = await db.ticket.findUnique({ where: { id: second.id }, include: ticketInclude });
  assert.ok(winner.payment ? winner.status === 'ISSUED' && winner.priceCents === winner.payment.amountCents : winner.status === 'PENDING' && winner.priceCents === 7500);

  const third = await reserve();
  const deletionRace = await Promise.allSettled([
    store.remove(admin.id, { ticketId: third.id, revision: input(third).revision, reason: 'Concorrência de exclusão' }),
    ticketModel.confirm(admin.id, { ticketId: third.id, receivedCents: 5000, reference: `PAY-DELETE-${suffix}` }),
  ]);
  assert.equal(deletionRace.filter((result) => result.status === 'fulfilled').length, 1);
  const survivor = await db.ticket.findUnique({ where: { id: third.id }, include: ticketInclude });
  if (survivor) { assert.equal(survivor.status, 'ISSUED'); assert.ok(survivor.payment); }
  else assert.equal(await db.ticketPayment.count({ where: { ticketId: third.id } }), 0);

  const fourth = await reserve();
  const courtesy = await store.update(admin.id, { ...input(fourth), sectorId: free.id, expectedTotalCents: 0, reason: 'Cortesia de teste' });
  assert.equal(courtesy.payment.method, 'FREE'); assert.equal(courtesy.status, 'ISSUED');
  await assert.rejects(store.remove(admin.id, { ticketId: fourth.id, revision: courtesy.revision, reason: 'Cortesia protegida' }), { code: 'PAID_TICKET_PROTECTED' });
});
