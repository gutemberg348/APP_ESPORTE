import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { salesReportSchema, admissionHistorySchema, denialHistorySchema } from '../src/validators/admin.js';
import { salesWhere } from '../src/models/admin-reports.store.js';
import { createApp } from '../src/http/app.js';
import { inject } from './helpers/inject.js';
import { routes } from '../src/routes/index.js';
import { AppError } from '../src/lib/errors.js';

test('report filters validate dates, pagination, UUIDs and reject unknown fields', () => {
  assert.deepEqual(salesReportSchema.parse({}), { limit: 25, offset: 0, deleted: 'all' });
  const parsed = admissionHistorySchema.parse({ from: '2026-11-04T10:00:00-03:00', to: '2026-11-04T14:00:00Z', limit: '1', offset: '11000', protocol: randomUUID() });
  assert.equal(parsed.from.toISOString(), '2026-11-04T13:00:00.000Z'); assert.equal(parsed.offset, 11000);
  for (const schema of [salesReportSchema, admissionHistorySchema, denialHistorySchema]) {
    for (const input of [{ limit: 101 }, { offset: -1 }, { offset: '1.5' }, { matchId: 'x' }, { sectorId: 'x' }, { from: '2026-02-30T00:00:00Z' }, { from: '2026-11-04T18:00:00Z', to: '2026-11-04T17:00:00Z' }, { password: 'secret' }]) assert.equal(schema.safeParse(input).success, false);
  }
  assert.equal(admissionHistorySchema.safeParse({ protocol: 'not-a-protocol' }).success, false);
  assert.equal(denialHistorySchema.safeParse({ search: 'buyer' }).success, false);
});

test('sales search combines location, expiry, deletion and receipt filters without exposing QR', () => {
  const now = new Date('2026-11-04T18:00:00Z'), matchId = randomUUID(), sectorId = randomUUID();
  const where = salesWhere({ matchId, sectorId, status: 'EXPIRED', payment: 'PAID', deleted: 'exclude', search: 'Alice' }, now);
  assert.equal(where.matchId, matchId); assert.equal(where.sectorId, sectorId); assert.equal(where.deletedAt, null);
  assert.equal(where.status, 'PENDING'); assert.equal(where.expiresAt.lte, now); assert.equal(where.payment.is.method, 'MANUAL');
  assert.equal(where.OR[0].user.name.contains, 'Alice'); assert.equal(where.OR[1].user.email.mode, 'insensitive');
  assert.ok(!Object.hasOwn(salesWhere({ search: randomUUID() }).OR[0], 'entryToken'));
  assert.equal(salesWhere({ payment: 'UNPAID' }).payment.is, null);
});

test('real reporting routes require ADMIN before executing any database query', async () => {
  let role = 'USER';
  const paths = ['/v1/admin/sales', '/v1/admin/admissions', `/v1/admin/admissions/protocol?protocol=${randomUUID()}`, '/v1/admin/gate-denials', '/v1/admin/gate-operators'];
  const app = createApp({ routes, authenticate: async (token) => { if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Login necessário.'); return { user: { id: randomUUID(), role, active: true } }; }, logger: { info() {}, error() {} } });
  for (const path of paths) {
    assert.equal((await inject(app, path)).status, 401);
    for (role of ['USER', 'GATE']) assert.equal((await inject(app, path, { headers: { Authorization: 'Bearer test.header.signature' } })).status, 403);
  }
  role = 'ADMIN';
  for (const path of paths.slice(0, 4)) assert.equal((await inject(app, `${path}${path.includes('?') ? '&' : '?'}unexpected=true`, { headers: { Authorization: 'Bearer test.header.signature' } })).status, 422);
});
