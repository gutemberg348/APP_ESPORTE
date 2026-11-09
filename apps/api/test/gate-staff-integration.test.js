import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

test('PostgreSQL/HTTP: admin provisions staff; scoped camera/code admission, resets and suspension', { skip: process.env.RUN_DB_TESTS !== 'true' }, async (t) => {
  const { db } = await import('../src/config/database.js');
  const { env } = await import('../src/config/env.js');
  if (env.NODE_ENV === 'production') throw new Error('Use apenas banco de desenvolvimento.');
  const { hashPassword } = await import('../src/lib/crypto.js');
  const { authService } = await import('../src/services/auth.service.js');
  const { createHttpServer } = await import('../src/http/server.js');
  const { routes } = await import('../src/routes/index.js');
  const nonce = randomUUID(), users = [], matches = [];
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
      db.match.deleteMany({ where: { id: { in: matches } } }),
      db.user.deleteMany({ where: { id: { in: users } } }),
    ]);
    await db.$disconnect();
  });
  async function call(path, { method = 'GET', body, token } = {}) {
    const res = await fetch(`${origin}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = res.status === 204 ? {} : await res.json();
    return { status: res.status, ...payload };
  }
  const password = 'PortariaTesteSeguro123!';
  const admin = await db.user.create({ data: { name: 'Admin', email: `admin-${nonce}@staff.test.local`, passwordHash: await hashPassword(password), role: 'ADMIN' } }); users.push(admin.id);
  const adminToken = (await call('/auth/login', { method: 'POST', body: { email: admin.email, password } })).data.accessToken;
  const fan = (await call('/auth/register', { method: 'POST', body: { name: 'Titular', email: `fan-${nonce}@staff.test.local`, password } })).data; users.push(fan.member.id);
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: fan.member.email, password, portal: 'GATE' } })).status, 401);
  const employeeData = { name: 'Porteiro', email: `employee-${nonce}@staff.test.local`, password };
  assert.equal((await call('/admin/employees', { method: 'POST', token: fan.accessToken, body: employeeData })).status, 403);
  const created = await call('/admin/employees', { method: 'POST', token: adminToken, body: employeeData });
  assert.equal(created.status, 201); assert.equal(created.data.role, 'GATE'); assert.ok(!JSON.stringify(created.data).includes('password')); users.push(created.data.id);
  let gateToken = (await call('/auth/login', { method: 'POST', body: { email: employeeData.email, password, portal: 'GATE' } })).data.accessToken;
  for (const path of ['/admin/employees', '/admin/tickets', '/cashback/wallet', '/tickets']) assert.equal((await call(path, { token: gateToken })).status, 403);
  assert.equal((await call('/gate/matches', { token: fan.accessToken })).status, 403);
  const match = await db.match.create({ data: { slug: `staff-${nonce}`, homeTeam: 'Nacional', awayTeam: 'Visitante', startsAt: new Date(Date.now() + 3600000), stadium: 'Teste', competition: 'Teste', entryEnabled: true, gateOpenAt: new Date(Date.now() - 60000), gateCloseAt: new Date(Date.now() + 7200000), sectors: { create: [{ name: 'Sol', capacity: 10, priceCents: 0 }, { name: 'Sombra', capacity: 10, priceCents: 0 }] } }, include: { sectors: true } }); matches.push(match.id);
  const sector = match.sectors.find((row) => row.name === 'Sol'), other = match.sectors.find((row) => row.name === 'Sombra');
  const ticket = await db.ticket.create({ data: { userId: fan.member.id, matchId: match.id, sectorId: sector.id, status: 'ISSUED', quantity: 3, priceCents: 0, payment: { create: { method: 'FREE', amountCents: 0, reference: `FREE-${nonce}` } } } });
  assert.equal((await call('/gate/matches', { token: gateToken })).data.some((row) => row.id === match.id), false);
  const assign = (sectorIds) => call('/admin/employees/assignments', { method: 'PUT', token: adminToken, body: { userId: created.data.id, sectorIds } });
  assert.equal((await assign([sector.id])).status, 200);
  const scoped = (await call('/gate/matches', { token: gateToken })).data.find((row) => row.id === match.id);
  assert.deepEqual(scoped.sectors.map((row) => row.id), [sector.id]);
  const fresh = () => call(`/tickets/entry-qr?ticketId=${ticket.id}`, { token: fan.accessToken });
  let qr = (await fresh()).data;
  const context = { matchId: match.id, sectorId: sector.id };
  const inspect = (credential, scope = context) => call('/gate/inspect', { method: 'POST', token: gateToken, body: { ...credential, ...scope } });
  const admit = (credential, requestKey = randomUUID()) => call('/gate/admit', { method: 'POST', token: gateToken, body: { ...credential, ...context, quantity: 1, requestKey } });
  assert.equal((await inspect({ code: qr.code }, { ...context, sectorId: other.id })).status, 403);
  assert.equal((await inspect({ code: qr.code.toLowerCase() })).data.decision, 'REVIEW');
  const operation = randomUUID(), admitted = await admit({ code: qr.code }, operation);
  assert.equal(admitted.status, 201); assert.equal(admitted.data.decision, 'ALLOW');
  assert.equal((await admit({ token: qr.token }, operation)).data.decision, 'ALREADY_RECORDED');
  assert.equal((await inspect({ token: qr.token })).status, 409);
  qr = (await fresh()).data;
  assert.equal((await inspect({ token: qr.token })).data.decision, 'REVIEW');
  await assign([]);
  assert.equal((await admit({ token: qr.token })).status, 403);
  assert.equal((await db.ticket.findUnique({ where: { id: ticket.id } })).usedQuantity, 1);
  // Own receipt remains available after a reassignment, without another admission.
  const receiptQuery = new URLSearchParams({ ...context, ticketId: ticket.id, requestKey: operation });
  assert.equal((await call(`/gate/admission-receipt?${receiptQuery}`, { token: gateToken })).data.decision, 'ALREADY_RECORDED');
  await assign([sector.id]);
  qr = (await fresh()).data;
  assert.equal((await admit({ token: qr.token })).data.decision, 'ALLOW');
  assert.equal((await inspect({ code: qr.code })).status, 409);
  assert.equal((await call('/admin/employees/password', { method: 'PUT', token: adminToken, body: { userId: created.data.id, password: password + 'Nova' } })).status, 204);
  assert.equal((await call('/gate/matches', { token: gateToken })).status, 401);
  assert.equal((await call('/auth/login', { method: 'POST', body: { email: employeeData.email, password, portal: 'GATE' } })).status, 401);
  gateToken = (await call('/auth/login', { method: 'POST', body: { email: employeeData.email, password: password + 'Nova', portal: 'GATE' } })).data.accessToken;
  const staffVersion = (await call(`/admin/employees?search=${encodeURIComponent(employeeData.email)}`, { token: adminToken })).data.find((row) => row.id === created.data.id).updatedAt;
  assert.equal((await call('/admin/employees', { method: 'PATCH', token: adminToken, body: { userId: created.data.id, updatedAt: staffVersion, active: false } })).status, 200);
  assert.equal((await call('/gate/matches', { token: gateToken })).status, 401);
  assert.equal(await db.ticketAdmission.count({ where: { ticketId: ticket.id } }), 2);
  assert.ok(await db.auditLog.count({ where: { actorId: admin.id, action: 'EMPLOYEE_CREATED' } }));
});
