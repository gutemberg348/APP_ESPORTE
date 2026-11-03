import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

test('real accounts: admin publication, inventory, payment, entry, membership and suspension', { skip: process.env.RUN_DB_TESTS !== 'true' }, async (t) => {
  const { db } = await import('../src/config/database.js');
  const { env } = await import('../src/config/env.js');
  if (env.NODE_ENV === 'production') throw new Error('Use apenas banco de desenvolvimento.');
  const { hashPassword } = await import('../src/lib/crypto.js');
  const { authService } = await import('../src/services/auth.service.js');
  const { createHttpServer } = await import('../src/http/server.js');
  const { routes } = await import('../src/routes/index.js');
  const nonce = randomUUID(), users = [], matches = [], plans = [];
  const server = createHttpServer({ routes, authenticate: authService.authenticate, logger: { info() {}, error() {} } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}/v1`;
  t.after(async () => {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    await db.$transaction([
      db.auditLog.deleteMany({ where: { actorId: { in: users } } }),
      db.ticketAdmission.deleteMany({ where: { ticket: { matchId: { in: matches } } } }),
      db.ticketPayment.deleteMany({ where: { ticket: { matchId: { in: matches } } } }),
      db.ticket.deleteMany({ where: { matchId: { in: matches } } }),
      db.prediction.deleteMany({ where: { matchId: { in: matches } } }),
      db.match.deleteMany({ where: { id: { in: matches } } }),
      db.user.deleteMany({ where: { id: { in: users } } }),
      db.plan.deleteMany({ where: { id: { in: plans } } }),
    ]);
    await db.$disconnect();
  });
  async function call(path, { method = 'GET', body, token } = {}) {
    const response = await fetch(`${origin}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: response.status === 204 ? null : (await response.json()).data };
  }
  const password = 'AdminTesteSeguro123!';
  const admin = await db.user.create({ data: { name: 'Admin teste', email: `admin-${nonce}@admin.test.local`, passwordHash: await hashPassword(password), role: 'ADMIN' } }); users.push(admin.id);
  const adminToken = (await call('/auth/login', { method: 'POST', body: { email: admin.email, password } })).data.accessToken;
  const register = async (label) => {
    const email = `${label}-${nonce}@admin.test.local`;
    const response = await call('/auth/register', { method: 'POST', body: { name: label, email, password } });
    assert.equal(response.status, 201); users.push(response.data.member.id); return { ...response.data, token: response.data.accessToken };
  };
  const alice = await register('Alice'), bob = await register('Bob');
  assert.equal(alice.member.role, 'USER');
  assert.equal((await call('/auth/register', { method: 'POST', body: { name: 'Intruso', email: `forbidden-${nonce}@admin.test.local`, password, role: 'ADMIN' } })).status, 422);
  assert.equal((await call('/admin/overview', { token: alice.token })).status, 403);
  assert.equal((await call('/admin/overview')).status, 401);
  const draft = await call('/admin/matches', { method: 'POST', token: adminToken, body: { homeTeam: 'Nacional Teste', awayTeam: 'Visitante Teste', stadium: 'Estádio Teste', competition: 'Teste', startsAt: new Date(Date.now() + 86400000).toISOString() } });
  assert.equal(draft.status, 201); const match = draft.data; matches.push(match.id);
  assert.equal((await call('/matches')).data.some((item) => item.id === match.id), false);
  assert.equal((await call('/admin/matches', { method: 'PATCH', token: adminToken, body: { id: match.id, published: true } })).status, 422);
  const sectorResponse = await call('/admin/sectors', { method: 'POST', token: adminToken, body: { matchId: match.id, name: 'Sol', priceCents: 5000, capacity: 2 } });
  assert.equal(sectorResponse.status, 201); const sector = sectorResponse.data;
  assert.equal((await call('/tickets', { method: 'POST', token: alice.token, body: { matchId: match.id, sectorId: sector.id, quantity: 1 } })).status, 409);
  assert.equal((await call('/admin/matches', { method: 'PATCH', token: adminToken, body: { id: match.id, published: true } })).status, 200);
  const initial = (await call('/matches')).data.find((item) => item.id === match.id);
  assert.equal(initial.sectors[0].available, 2);
  const quoteResponse = await call('/tickets/quote', { method: 'POST', token: alice.token, body: { matchId: match.id, sectorId: sector.id, quantity: 2 } });
  assert.equal(quoteResponse.status, 200); assert.equal(quoteResponse.data.totalCents, 10000); assert.equal(quoteResponse.data.available, 2);
  assert.equal(await db.ticket.count({ where: { matchId: match.id } }), 0);
  assert.equal((await call('/tickets', { method: 'POST', token: alice.token, body: { matchId: match.id, sectorId: sector.id, quantity: 2, expectedTotalCents: 9000 } })).status, 409);
  const request = { matchId: match.id, sectorId: sector.id, quantity: 2, expectedTotalCents: quoteResponse.data.totalCents };
  const orders = await Promise.all([call('/tickets', { method: 'POST', token: alice.token, body: request }), call('/tickets', { method: 'POST', token: bob.token, body: request })]);
  assert.deepEqual(orders.map((item) => item.status).sort(), [201, 409]);
  const winner = orders[0].status === 201 ? alice : bob, loser = winner === alice ? bob : alice;
  const ticket = orders.find((item) => item.status === 201).data;
  assert.equal(ticket.entryQr, null);
  assert.ok(!Object.hasOwn(ticket, 'entryToken'));
  assert.equal((await call('/tickets/cancel', { method: 'POST', token: loser.token, body: { ticketId: ticket.id } })).status, 404);
  assert.equal((await call('/admin/sectors', { method: 'PATCH', token: adminToken, body: { id: sector.id, capacity: 1 } })).status, 409);
  const paymentBody = { ticketId: ticket.id, receivedCents: 10000, reference: `RECEIPT-${nonce}`, paymentVerified: true };
  assert.equal((await call('/admin/tickets/confirm-payment', { method: 'POST', token: winner.token, body: paymentBody })).status, 403);
  assert.equal((await call('/admin/tickets/confirm-payment', { method: 'POST', token: adminToken, body: { ...paymentBody, receivedCents: 5000 } })).status, 422);
  const confirmations = await Promise.all([call('/admin/tickets/confirm-payment', { method: 'POST', token: adminToken, body: paymentBody }), call('/admin/tickets/confirm-payment', { method: 'POST', token: adminToken, body: paymentBody })]);
  assert.deepEqual(confirmations.map((item) => item.status), [200, 200]);
  assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 1);
  const own = (await call('/tickets', { token: winner.token })).data.find((item) => item.id === ticket.id);
  assert.equal(own.status, 'ISSUED');
  assert.equal(own.entryQr, null);
  assert.equal((await call('/tickets/cancel', { method: 'POST', token: winner.token, body: { ticketId: ticket.id } })).status, 409);
  const adminList = (await call('/admin/tickets', { token: adminToken })).data.find((item) => item.id === ticket.id);
  assert.equal(adminList.entryQr, null);
  assert.equal((await call('/tickets/entry-qr?ticketId=' + ticket.id, { token: loser.token })).status, 404);
  await db.match.update({ where: { id: match.id }, data: { entryEnabled: true, gateOpenAt: new Date(Date.now() - 60000), gateCloseAt: new Date(Date.now() + 3600000) } });
  const entryToken = (await call('/tickets/entry-qr?ticketId=' + ticket.id, { token: winner.token })).data.token;
  const inspect = await call('/admin/tickets/inspect', { method: 'POST', token: adminToken, body: { token: entryToken, matchId: match.id, sectorId: sector.id } });
  assert.equal(inspect.data.remainingQuantity, 2);
  assert.ok(!Object.hasOwn(inspect.data, 'entryToken'));
  assert.equal(inspect.data.entryQr, null);
  const admissionBody = { token: entryToken, matchId: match.id, sectorId: sector.id, quantity: 1, requestKey: randomUUID() };
  const firstEntry = await call('/admin/tickets/admit', { method: 'POST', token: adminToken, body: admissionBody });
  assert.equal(firstEntry.status, 201); assert.equal(firstEntry.data.ticket.remainingQuantity, 1);
  const retry = await call('/admin/tickets/admit', { method: 'POST', token: adminToken, body: admissionBody });
  assert.equal(retry.data.duplicate, true); assert.equal(retry.data.ticket.remainingQuantity, 1);
  const refreshedEntry = (await call('/tickets/entry-qr?ticketId=' + ticket.id, { token: winner.token })).data.token;
  admissionBody.token = refreshedEntry;
  const lastEntries = await Promise.all([call('/admin/tickets/admit', { method: 'POST', token: adminToken, body: { ...admissionBody, requestKey: randomUUID() } }), call('/admin/tickets/admit', { method: 'POST', token: adminToken, body: { ...admissionBody, requestKey: randomUUID() } })]);
  assert.deepEqual(lastEntries.map((item) => item.status).sort(), [201, 409]);
  assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).usedQuantity, 2);
  assert.equal((await call('/admin/matches', { method: 'PATCH', token: adminToken, body: { id: match.id, startsAt: new Date(Date.now() + 172800000).toISOString() } })).status, 409);
  const freeSector = await call('/admin/sectors', { method: 'POST', token: adminToken, body: { matchId: match.id, name: 'Cortesia', priceCents: 0, capacity: 10 } });
  const free = await call('/tickets', { method: 'POST', token: loser.token, body: { matchId: match.id, sectorId: freeSector.data.id } });
  assert.equal(free.status, 201); assert.equal(free.data.status, 'ISSUED'); assert.equal(free.data.payment.method, 'FREE');
  const plan = await call('/admin/plans', { method: 'POST', token: adminToken, body: { name: `Plano ${nonce}`, priceCents: 3990, discountPercent: 20 } });
  assert.equal(plan.status, 201); plans.push(plan.data.id);
  assert.equal((await call('/admin/memberships', { method: 'PUT', token: adminToken, body: { userId: winner.member.id, planId: plan.data.id, status: 'ACTIVE', validUntil: new Date(Date.now() + 86400000).toISOString() } })).status, 200);
  assert.equal((await call('/me/card-token', { token: winner.token })).status, 200);
  assert.equal((await call('/admin/users/status', { method: 'PATCH', token: adminToken, body: { userId: admin.id, active: false } })).status, 409);
  assert.equal((await call('/admin/users/status', { method: 'PATCH', token: adminToken, body: { userId: winner.member.id, active: false } })).status, 200);
  assert.equal((await call('/me', { token: winner.token })).status, 401);
  const logs = (await call('/admin/audit', { token: adminToken })).data.filter((item) => item.actorId === admin.id);
  assert.ok(logs.some((item) => item.action === 'TICKET_PAYMENT_CONFIRMED'));
  assert.ok(logs.some((item) => item.action === 'TICKET_ADMISSION'));
});
