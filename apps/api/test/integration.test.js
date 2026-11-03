import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

test('fluxo completo API + PostgreSQL: cadastro, associação, ingresso, palpite e logout', { skip: process.env.RUN_DB_TESTS !== 'true' }, async (t) => {
  const { db } = await import('../src/config/database.js');
  const { env } = await import('../src/config/env.js');
  if (env.NODE_ENV === 'production') throw new Error('Teste de integração exige banco de desenvolvimento.');
  const { routes } = await import('../src/routes/index.js');
  const { authService } = await import('../src/services/auth.service.js');
  const { createHttpServer } = await import('../src/http/server.js');
  const server = createHttpServer({ routes, authenticate: authService.authenticate, logger: { info() {}, error() {} }, readiness: () => db.$queryRaw`SELECT 1` });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}/v1`;
  const nonce = randomUUID();
  const email = `integration-${nonce}@test.nacional.local`;
  let userId, matchId, planId, rewardId;
  t.after(async () => {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    // Remove only records owned by this test's unique user and match.
    if (userId) {
      await db.$transaction([
        db.auditLog.deleteMany({ where: { actorId: userId } }),
        db.ticket.deleteMany({ where: { userId } }), db.prediction.deleteMany({ where: { userId } }),
        db.referral.deleteMany({ where: { userId } }), db.redemption.deleteMany({ where: { userId } }), db.user.deleteMany({ where: { id: userId, email } }),
      ]);
    }
    if (rewardId) await db.reward.delete({ where: { id: rewardId } });
    if (matchId) await db.match.delete({ where: { id: matchId } });
    if (planId) await db.plan.delete({ where: { id: planId } });
    await db.$disconnect();
  });
  async function call(path, { method = 'GET', body, token } = {}) {
    const response = await fetch(`${origin}${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  }
  const registration = await call('/auth/register', { method: 'POST', body: { name: 'Torcedor Teste', email, password: 'NacionalTeste123!' } });
  assert.equal(registration.status, 201);
  const { accessToken: token, refreshToken, member } = registration.body.data;
  userId = member.id;
  assert.equal(member.membership, null);
  assert.ok(!JSON.stringify(registration.body).includes('passwordHash'));
  assert.equal((await call('/me/card-token', { token })).status, 403);
  assert.equal((await call('/auth/login', { method: 'POST', body: { email, password: 'senha errada' } })).status, 401);
  assert.equal((await call('/auth/login', { method: 'POST', body: { email, password: 'NacionalTeste123!' } })).status, 200);
  const stored = await db.session.findFirst({ where: { userId } });
  assert.notEqual(stored.tokenHash, token);
  assert.notEqual(stored.tokenHash, refreshToken);
  assert.equal(token.split('.').length, 3);
  const plan = await db.plan.create({ data: { name: `Plano teste ${nonce}`, priceCents: 4990, discountPercent: 20 } }); planId = plan.id;
  await db.membership.create({ data: { userId, planId, memberId: `test-${nonce}`, status: 'ACTIVE', validUntil: new Date(Date.now() + 86400000) } });
  assert.equal((await call('/me/card-token', { token })).status, 200);
  const match = await db.match.create({ data: { slug: `test-${nonce}`, published: true, homeTeam: 'NACIONAL', awayTeam: 'TESTE', startsAt: new Date(Date.now() + 86400000), stadium: 'Estádio Teste', competition: 'Teste', sectors: { create: { name: 'Cativas', priceCents: 8000 } } }, include: { sectors: true } }); matchId = match.id;
  const ticketBody = { matchId, sectorId: match.sectors[0].id, quantity: 2 };
  const ticket = await call('/tickets', { method: 'POST', token, body: ticketBody });
  assert.equal(ticket.status, 201);
  assert.equal(ticket.body.data.status, 'PENDING');
  assert.equal(ticket.body.data.priceCents, 12800);
  assert.equal(ticket.body.data.quantity, 2);
  assert.ok(new Date(ticket.body.data.expiresAt) > new Date());
  assert.equal((await call('/tickets', { method: 'POST', token, body: ticketBody })).status, 409);
  await db.ticket.update({ where: { id: ticket.body.data.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await call('/tickets', { token })).body.data[0].status, 'EXPIRED');
  await db.sector.update({ where: { id: ticketBody.sectorId }, data: { capacity: 1 } });
  assert.equal((await call('/tickets', { method: 'POST', token, body: ticketBody })).status, 409);
  await db.sector.update({ where: { id: ticketBody.sectorId }, data: { capacity: 2 } });
  assert.equal((await call('/tickets', { method: 'POST', token, body: ticketBody })).status, 201);
  assert.equal((await call('/predictions', { method: 'POST', token, body: { matchId, homeScore: 2, awayScore: 1 } })).status, 201);
  assert.equal((await call('/predictions', { method: 'POST', token, body: { matchId, homeScore: 3, awayScore: 1 } })).status, 409);
  assert.equal((await call('/me', { method: 'PATCH', token, body: { name: 'Novo nome', points: 9999 } })).status, 422);
  assert.equal((await call('/me', { method: 'PATCH', token, body: { name: 'Novo nome' } })).body.data.name, 'Novo nome');
  assert.equal((await call('/me', { token })).body.data.points, 0);
  const preferences = { family: true, personalize: false, notifications: false, ranking: true };
  assert.deepEqual((await call('/me/preferences', { method: 'PATCH', token, body: preferences })).body.data.preferences, preferences);
  assert.equal((await call('/me/school-interest', { method: 'PUT', token, body: { interested: true } })).body.data.schoolInterested, true);
  const checkIns = await Promise.all([call('/check-ins', { method: 'POST', token }), call('/check-ins', { method: 'POST', token })]);
  assert.deepEqual(checkIns.map((result) => result.status).sort(), [201, 409]);
  assert.equal((await call('/me', { token })).body.data.points, 30);
  const reward = await db.reward.create({ data: { slug: `test-${nonce}`, title: 'Experiência teste', description: 'Somente teste', cost: 20, stock: 1 } }); rewardId = reward.id;
  const resgates = await Promise.all([call('/redemptions', { method: 'POST', token, body: { rewardId } }), call('/redemptions', { method: 'POST', token, body: { rewardId } })]);
  assert.deepEqual(resgates.map((result) => result.status).sort(), [201, 409]);
  assert.equal((await call('/me', { token })).body.data.points, 10);
  assert.equal((await db.reward.findUnique({ where: { id: rewardId } })).stock, 0);
  assert.equal((await call('/me/points?limit=1', { token })).body.data.length, 1);
  assert.equal((await call('/me/points?limit=101', { token })).status, 422);
  assert.equal((await call('/engagement', { token })).body.data.checkedIn, true);
  assert.equal((await call('/referrals', { method: 'POST', token, body: { kind: 'BUSINESS', name: 'Loja Teste', contact: '11999999999' } })).status, 201);
  assert.equal((await call('/dashboard', { token })).status, 200);
  await db.membership.update({ where: { userId }, data: { validUntil: new Date(Date.now() - 1000) } });
  assert.equal((await call('/me', { token })).body.data.membership.status, 'EXPIRED');
  assert.equal((await call('/me/card-token', { token })).status, 403);
  assert.equal((await call('/auth/logout', { method: 'POST', token })).status, 204);
  assert.equal((await call('/me', { token })).status, 401);
});
