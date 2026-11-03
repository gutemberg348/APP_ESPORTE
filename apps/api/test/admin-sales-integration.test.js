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
  const { createTicketEntryStore } = await import('../src/models/ticket-entry.store.js');
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
  async function reserve(sectorId = sol.id, quantity = 2, priceCents = 5000) {
    const user = await db.user.create({ data: { name: 'Comprador teste', email: `sales-buyer-${++number}-${suffix}@test.local`, passwordHash: 'test-only-no-login' } }); users.push(user.id);
    return db.ticket.create({ data: { userId: user.id, matchId: match.id, sectorId, quantity, priceCents, expiresAt: new Date(Date.now() + 900000) }, include: ticketInclude });
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
  assert.ok((await db.ticket.findUnique({ where: { id: first.id } })).deletedAt);
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
  if (!survivor.deletedAt) { assert.equal(survivor.status, 'ISSUED'); assert.ok(survivor.payment); }
  else { assert.equal(survivor.status, 'CANCELED'); assert.equal(survivor.payment, null); }

  const fourth = await reserve();
  const courtesy = await store.update(admin.id, { ...input(fourth), sectorId: free.id, expectedTotalCents: 0, reason: 'Cortesia de teste' });
  assert.equal(courtesy.payment.method, 'FREE'); assert.equal(courtesy.status, 'ISSUED');
  await store.remove(admin.id, { ticketId: fourth.id, revision: courtesy.revision, reason: 'Excluir cortesia' });
  assert.equal((await db.ticketPayment.findUnique({ where: { ticketId: fourth.id } })).method, 'FREE');

  // Exercise a real paid edit, actual gate admission and logical deletion.
  const fifth = await reserve();
  await ticketModel.confirm(admin.id, { ticketId: fifth.id, receivedCents: 5000, reference: `PAID-EDIT-${suffix}` });
  let current = await db.ticket.findUnique({ where: { id: fifth.id }, include: ticketInclude });
  const payment = { ...current.payment };
  const paidEdit = await store.update(admin.id, { ...input(current), sectorId: sombra.id, quantity: 3, expectedTotalCents: 5000, reason: 'Troca após pagamento' });
  assert.equal(paidEdit.priceCents, 5000); assert.equal(paidEdit.status, 'ISSUED');
  assert.deepEqual((await db.ticket.findUnique({ where: { id: fifth.id }, include: ticketInclude })).payment, payment);
  await db.match.update({ where: { id: match.id }, data: { entryEnabled: true, gateOpenAt: new Date(Date.now() - 60000), gateCloseAt: new Date(Date.now() + 3600000) } });
  const entry = createTicketEntryStore(db);
  const claimsOf = (ticket) => ({ ticketId: ticket.id, matchId: match.id, sectorId: ticket.sectorId, version: ticket.entryVersion, scanId: randomUUID(), expiresAt: new Date(Date.now() + 45000) });
  current = await db.ticket.findUnique({ where: { id: fifth.id }, include: ticketInclude });
  const claims = claimsOf(current);
  await entry.admit(admin.id, claims, { matchId: match.id, sectorId: sombra.id, quantity: 1, requestKey: randomUUID() });
  current = await db.ticket.findUnique({ where: { id: fifth.id }, include: ticketInclude });
  await assert.rejects(store.quote({ ...input(current), sectorId: sol.id }), { code: 'USED_SECTOR_PROTECTED' });
  const corrected = await store.update(admin.id, { ...input(current), quantity: 2, expectedTotalCents: 5000, reason: 'Ajuste após entrada parcial' });
  assert.equal(corrected.usedQuantity, 1); assert.equal(corrected.remainingQuantity, 1);
  await store.remove(admin.id, { ticketId: fifth.id, revision: corrected.revision, reason: 'Excluir venda após uso parcial' });
  const archived = await db.ticket.findUnique({ where: { id: fifth.id }, include: { ...ticketInclude, admissions: true } });
  assert.ok(archived.deletedAt); assert.equal(archived.voidedQuantity, 1); assert.equal(archived.quantity, 2);
  assert.deepEqual(archived.payment, payment); assert.equal(archived.admissions.length, 1);
  assert.equal((await withAvailability(db, [match]))[0].sectors.find((sector) => sector.id === sombra.id).available, 3);
  await assert.rejects(entry.ownedTicket(fifth.userId, fifth.id), { code: 'SALE_DELETED' });
  await assert.rejects(entry.inspect(claims, { matchId: match.id, sectorId: sombra.id }));
  await assert.rejects(ticketModel.confirm(admin.id, { ticketId: fifth.id, receivedCents: 5000, reference: payment.reference }), { code: 'SALE_DELETED' });
  const repurchase = await ticketModel.reserve(fifth.userId, { matchId: match.id, sectorId: sombra.id, quantity: 1, expectedTotalCents: 4000 });
  assert.notEqual(repurchase.id, fifth.id);
  assert.equal((await ticketModel.tickets(fifth.userId)).some((ticket) => ticket.id === fifth.id), false);
  assert.equal((await ticketModel.tickets(fifth.userId)).some((ticket) => ticket.id === repurchase.id), true);
  await assert.rejects(ticketModel.reserve(fifth.userId, { matchId: match.id, sectorId: sombra.id, quantity: 1 }), { code: 'TICKET_EXISTS' });

  // Deletion and gate admission cannot both authorize the same remaining place.
  const sixth = await reserve(sombra.id, 1, 4000);
  await ticketModel.confirm(admin.id, { ticketId: sixth.id, receivedCents: 4000, reference: `GATE-RACE-${suffix}` });
  current = await db.ticket.findUnique({ where: { id: sixth.id }, include: ticketInclude });
  const gateRace = await Promise.allSettled([
    store.remove(admin.id, { ticketId: sixth.id, revision: input(current).revision, reason: 'Exclusão durante leitura' }),
    entry.admit(admin.id, claimsOf(current), { matchId: match.id, sectorId: sombra.id, quantity: 1, requestKey: randomUUID() }),
  ]);
  assert.equal(gateRace.filter((result) => result.status === 'fulfilled').length, 1);
  current = await db.ticket.findUnique({ where: { id: sixth.id }, include: ticketInclude });
  assert.equal(await db.ticketAdmission.count({ where: { ticketId: sixth.id } }), current.usedQuantity);
  assert.ok(current.deletedAt ? current.usedQuantity === 0 : current.usedQuantity === 1);
});
