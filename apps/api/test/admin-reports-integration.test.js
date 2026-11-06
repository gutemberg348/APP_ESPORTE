import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('PostgreSQL reports: complete totals, paginated sales, archived receipts, admissions and denied protocols', { skip: process.env.RUN_DB_TESTS !== 'true', timeout: 30000 }, async (t) => {
  const { db } = await import('../src/config/database.js');
  const { env } = await import('../src/config/env.js');
  if (env.NODE_ENV === 'production') throw new Error('Use somente banco de desenvolvimento.');
  const { createAdminReportsStore } = await import('../src/models/admin-reports.store.js');
  const { createTicketEntryStore } = await import('../src/models/ticket-entry.store.js');
  const { createApp } = await import('../src/http/app.js');
  const { routes } = await import('../src/routes/index.js');
  const { inject } = await import('./helpers/inject.js');
  const suffix = randomUUID(), userIds = [], matchIds = [], instant = new Date();
  t.after(async () => {
    try { await db.$transaction([
      db.auditLog.deleteMany({ where: { actorId: { in: userIds } } }), db.ticketAdmission.deleteMany({ where: { ticket: { matchId: { in: matchIds } } } }),
      db.ticketPayment.deleteMany({ where: { ticket: { matchId: { in: matchIds } } } }), db.ticket.deleteMany({ where: { matchId: { in: matchIds } } }),
      db.match.deleteMany({ where: { id: { in: matchIds } } }), db.user.deleteMany({ where: { id: { in: userIds } } }),
    ]); } finally { await db.$disconnect(); }
  });
  async function user(name, role = 'USER') {
    const row = await db.user.create({ data: { name, email: `report-${userIds.length}-${suffix}@test.local`, passwordHash: 'test-only-no-login', role } }); userIds.push(row.id); return row;
  }
  const admin = await user('Admin relatório', 'ADMIN'), gate = await user('Porteiro histórico', 'GATE');
  const match = await db.match.create({ data: { slug: `report-${suffix}`, homeTeam: 'Esporte relatório', awayTeam: 'Visitante', stadium: 'Teste', competition: 'Teste', startsAt: new Date(instant.getTime() + 86400000), sectors: { create: [{ name: 'Sol', capacity: 20, priceCents: 1000 }, { name: 'Sombra', capacity: 10, priceCents: 2000 }] } }, include: { sectors: true } }); matchIds.push(match.id);
  const sol = match.sectors.find((sector) => sector.name === 'Sol'), sombra = match.sectors.find((sector) => sector.name === 'Sombra');
  const store = createAdminReportsStore(db, { now: () => instant });
  const since = new Date(instant.getTime() - 60000), until = new Date(instant.getTime() + 60000);
  async function ticket(name, data, payment) {
    const holder = await user(name);
    return db.ticket.create({ data: { userId: holder.id, matchId: match.id, sectorId: sol.id, quantity: 2, priceCents: 2000, createdAt: instant, ...data, ...(payment ? { payment: { create: { method: 'MANUAL', amountCents: data.priceCents ?? 2000, confirmedById: admin.id, reference: randomUUID(), ...payment } } } : {}) } });
  }
  const paid = await ticket('Alice Compradora', { status: 'ISSUED', usedQuantity: 1 }, {});
  await ticket('Bob Reserva', { expiresAt: new Date(instant.getTime() + 60000), quantity: 3 });
  await ticket('Carlos Expirado', { expiresAt: new Date(instant.getTime() - 1) });
  const archived = await ticket('Dora Excluída', { status: 'CANCELED', deletedAt: instant, voidedQuantity: 1, usedQuantity: 1, priceCents: 3000 }, {});
  await ticket('Eva Cortesia', { status: 'ISSUED', quantity: 1, priceCents: 0, sectorId: sombra.id }, { method: 'FREE', confirmedById: null, amountCents: 0 });
  const query = { matchId: match.id, limit: 1, offset: 0, deleted: 'all' };
  const report = await store.sales(query);
  assert.equal(report.pagination.total, 5); assert.equal(report.items.length, 1); assert.equal(report.pagination.hasMore, true);
  assert.deepEqual(report.summary, { orders: 5, soldQuantity: 3, reservedQuantity: 3, freeQuantity: 1, confirmedRevenueCents: 5000, refundedRevenueCents: 0, archivedRevenueCents: 3000 });
  assert.equal(report.inventory.capacity, 30); assert.equal(report.inventory.occupied, 7); assert.equal(report.inventory.available, 23);
  const solReport = report.inventory.sectors.find((sector) => sector.id === sol.id);
  assert.equal(solReport.soldQuantity, 2); assert.equal(solReport.reservedQuantity, 3); assert.equal(solReport.usedQuantity, 2); assert.equal(solReport.available, 14);
  const next = await store.sales({ ...query, offset: 1 }); assert.notEqual(next.items[0].id, report.items[0].id); assert.deepEqual(next.summary, report.summary);
  const search = await store.sales({ ...query, search: 'ALICE' }); assert.equal(search.pagination.total, 1); assert.equal(search.items[0].id, paid.id); assert.equal(search.summary.confirmedRevenueCents, 2000); assert.equal(search.inventory.available, 23);
  assert.equal((await store.sales({ ...query, search: paid.id })).items[0].id, paid.id);
  assert.equal((await store.sales({ ...query, search: paid.id, payment: 'UNPAID' })).pagination.total, 0);
  assert.equal((await store.sales({ ...query, status: 'EXPIRED' })).pagination.total, 1);
  assert.equal((await store.sales({ ...query, status: 'PENDING' })).summary.reservedQuantity, 3);
  assert.equal((await store.sales({ ...query, deleted: 'exclude' })).summary.confirmedRevenueCents, 2000);
  assert.equal((await store.sales({ ...query, deleted: 'only' })).items[0].id, archived.id);
  assert.equal((await store.sales({ ...query, sectorId: sombra.id, payment: 'FREE' })).summary.freeQuantity, 1);
  assert.equal((await store.sales({ ...query, from: new Date(instant.getTime() + 1) })).pagination.total, 0);
  const admission = await db.ticketAdmission.create({ data: { ticketId: paid.id, actorId: gate.id, quantity: 1, requestKey: randomUUID(), createdAt: instant } });
  await db.ticketAdmission.create({ data: { ticketId: archived.id, actorId: admin.id, quantity: 1, requestKey: randomUUID(), createdAt: instant } });
  await db.user.update({ where: { id: gate.id }, data: { active: false } });
  const history = await store.admissions({ matchId: match.id, limit: 1, offset: 0, from: since, to: until });
  assert.deepEqual(history.summary, { operations: 2, admittedQuantity: 2 }); assert.equal(history.items.length, 1); assert.equal(history.pagination.hasMore, true);
  const entry = (await store.admissions({ matchId: match.id, actorId: gate.id, sectorId: sol.id, protocol: admission.id, search: 'alice', limit: 25, offset: 0 })).items[0];
  assert.equal(entry.protocol, admission.id); assert.equal(entry.actor.id, gate.id); assert.equal(entry.ticket.id, paid.id);
  assert.equal((await store.admission(admission.id)).protocol, admission.id);
  await assert.rejects(store.admission(randomUUID()), { code: 'ADMISSION_NOT_FOUND' });
  const raw = JSON.stringify(entry); for (const secret of ['requestKey', 'scanId', 'qrVersion', 'passwordHash', 'entryToken']) assert.ok(!raw.includes(secret));
  assert.ok((await store.operators()).some((operator) => operator.id === gate.id && !operator.active));
  const entryStore = createTicketEntryStore(db);
  await entryStore.deny(gate.id, match.id, 'WRONG_SECTOR', 'hash-not-public', sol.id, 'INSPECT');
  await entryStore.deny(admin.id, match.id, 'TICKET_QR_USED', 'hash-not-public');
  const denied = await store.denials({ matchId: match.id, sectorId: sol.id, actorId: gate.id, limit: 1, offset: 0 });
  assert.equal(denied.pagination.total, 1); assert.equal(denied.items[0].reason, 'WRONG_SECTOR'); assert.equal(denied.items[0].sector.name, 'Sol'); assert.equal(denied.items[0].stage, 'INSPECT');
  assert.ok(!JSON.stringify(denied).includes('hash-not-public'));
  assert.equal((await store.denials({ matchId: match.id, protocol: denied.items[0].protocol, limit: 25, offset: 0 })).items.length, 1);
  const legacy = await store.denials({ matchId: match.id, actorId: admin.id, limit: 25, offset: 0 }); assert.equal(legacy.items[0].sector, null);
  const app = createApp({ routes, authenticate: async () => ({ user: admin }), logger: { info() {}, error() {} } });
  const response = await inject(app, `/v1/admin/sales?matchId=${match.id}&limit=1`, { headers: { Authorization: 'Bearer test.header.signature' } });
  assert.equal(response.status, 200); assert.equal((await response.json()).data.summary.orders, 5);
  const receipt = await inject(app, `/v1/admin/admissions/protocol?protocol=${admission.id}`, { headers: { Authorization: 'Bearer test.header.signature' } }); assert.equal(receipt.status, 200);
  for (const path of [`/v1/admin/admissions?matchId=${match.id}`, `/v1/admin/gate-denials?matchId=${match.id}`, '/v1/admin/gate-operators']) assert.equal((await inject(app, path, { headers: { Authorization: 'Bearer test.header.signature' } })).status, 200);
  const rejected = await inject(app, '/v1/gate/inspect', { method: 'POST', headers: { Authorization: 'Bearer test.header.signature', 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: match.id, sectorId: sol.id, code: '2222222222' }) });
  assert.equal(rejected.status, 404);
  const actualDenials = await store.denials({ matchId: match.id, actorId: admin.id, sectorId: sol.id, limit: 25, offset: 0 });
  assert.equal(actualDenials.items[0].stage, 'INSPECT'); assert.equal(actualDenials.items[0].sector.id, sol.id);
});
