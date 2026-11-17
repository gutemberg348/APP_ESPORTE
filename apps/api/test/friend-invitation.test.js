import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { createAuthModel } from '../src/models/auth.model.js';
import { createSocialAuthModel } from '../src/models/social-auth.model.js';
import { registerSchema } from '../src/validators/index.js';
import { toMember } from '../src/lib/serializers.js';

test('invitation attribution is transactional, new-account only, supporter only and never credits rewards', async t => {
  const pg = await PGlite.create(), migrations = new URL('../prisma/migrations/', import.meta.url);
  const folders = (await readdir(migrations, { withFileTypes: true })).filter(row => row.isDirectory()).sort((a,b) => a.name.localeCompare(b.name));
  for (const folder of folders) await pg.exec(await readFile(new URL(`${folder.name}/migration.sql`, migrations), 'utf8'));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 }); await socket.start();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  const user = email => ({ name: 'Torcedor teste', email, passwordHash: 'fixture' });
  const session = () => ({ id: randomUUID(), tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 3600000), lastUsedAt: new Date() });
  const owner = await db.user.create({ data: user('owner@test.local') });
  const other = await db.user.create({ data: user('other@test.local') });
  const staff = await db.user.create({ data: { ...user('staff@test.local'), role: 'GATE' } });
  const model = createAuthModel(db);
  const first = await model.register(user('invited@test.local'), session(), owner.referralCode);
  assert.equal(first.user.referredById, owner.id);
  assert.notEqual(first.user.referralCode, owner.referralCode);
  assert.equal('referralCode' in toMember(first.user), false);
  await model.start(first.user.id, first.user.passwordHash, session());
  assert.equal((await db.user.findUnique({ where: { id: first.user.id } })).referredById, owner.id);
  await assert.rejects(model.register(user('invited@test.local'), session(), other.referralCode));
  assert.equal(await db.user.count({ where: { referredById: other.id } }), 0);
  const duplicateSession = session(); await model.register(user('session@test.local'), duplicateSession);
  await assert.rejects(model.register(user('rollback@test.local'), duplicateSession, owner.referralCode));
  assert.equal(await db.user.count({ where: { email: 'rollback@test.local' } }), 0);
  for (const [index, code] of [undefined, randomUUID(), staff.referralCode].entries()) {
    assert.equal((await model.register(user(`unattributed${index}@test.local`), session(), code)).user.referredById, null);
  }
  await db.user.update({ where: { id: other.id }, data: { active: false } });
  assert.equal((await model.register(user('inactive@test.local'), session(), other.referralCode)).user.referredById, null);
  const social = createSocialAuthModel(db);
  async function redeem(code) {
    const ticketHash = randomUUID();
    await social.create({ provider: 'google', stateHash: randomUUID(), nonce: 'nonce', providerVerifier: 'proof', challenge: 'challenge', ticketHash, profile: { subject: 'google-new', name: 'Social', email: 'social@test.local' }, expiresAt: new Date(Date.now()+60000) });
    return social.redeem({ ticketHash, challenge: 'challenge', passwordHash: 'fixture', session: session(), now: new Date(), referralCode: code });
  }
  const newSocial = await redeem(owner.referralCode);
  assert.equal(newSocial.user.referredById, owner.id);
  const existingSocial = await redeem(staff.referralCode);
  assert.equal(existingSocial.user.id, newSocial.user.id);
  assert.equal(existingSocial.user.referredById, owner.id);
  assert.equal(await db.user.count({ where: { referredById: owner.id } }), 2);
  assert.equal(await db.pointEntry.count(), 0);
  assert.equal((await db.user.findUnique({ where: { id: owner.id } })).points, 0);
  assert.equal(registerSchema.safeParse({ name: 'Teste', email: 'test@example.com', password: 'long-password', referralCode: 'bad' }).success, false);
});
