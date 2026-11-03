import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { createAuthService } from '../src/services/auth-core.js';
import { createAccessTokens } from '../src/lib/jwt.js';
import { hashToken } from '../src/lib/crypto.js';

// In-memory persistence is used to exercise the production service without
// PostgreSQL or an HTTP listener. SQL concurrency has separate integration tests.
async function fixture() {
  const people = new Map(), sessions = new Map(), tokens = new Map();
  let time = new Date('2026-10-30T12:00:00Z');
  const save = (user, session) => { const value = { ...session, userId: user.id, user, revokedAt: null, createdAt: time }; sessions.set(value.id, value); tokens.set(session.tokenHash, { sessionId: value.id, used: false }); return { user, session: value }; };
  const users = { byEmail: async (email) => [...people.values()].find((user) => user.email === email) };
  const store = {
    async register(data, session) {
      if (await users.byEmail(data.email)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      const user = { ...data, id: randomUUID(), role: 'USER', active: true, points: 0, city: '', contact: '', avatar: null, preferences: {}, schoolInterested: false, membership: null };
      people.set(user.id, user); return save(user, session);
    },
    async start(id, expectedHash, session) { const user = people.get(id); return user?.active && user.passwordHash === expectedHash ? save(user, session) : null; },
    session: async (id) => sessions.get(id),
    async rotate(hash, replacement, now) {
      const entry = tokens.get(hash), session = entry && sessions.get(entry.sessionId);
      if (!session || session.revokedAt || session.expiresAt <= now || !session.user.active) return { status: 'invalid' };
      if (entry.used || session.tokenHash !== hash) { session.revokedAt = now; return { status: 'reused' }; }
      entry.used = true; session.tokenHash = replacement;
      tokens.set(replacement, { sessionId: session.id, used: false }); return { status: 'rotated', user: session.user, session };
    },
    async revoke(id, now) { sessions.get(id).revokedAt = now; },
    async revokeAll(id, now) { for (const session of sessions.values()) if (session.userId === id) session.revokedAt = now; },
    async sessions(id, now) { return [...sessions.values()].filter((session) => session.userId === id && !session.revokedAt && session.expiresAt > now).map(({ id, createdAt, lastUsedAt, expiresAt }) => ({ id, createdAt, lastUsedAt, expiresAt })); },
    async changePassword(id, expected, next, now) {
      const user = people.get(id);
      if (!user.active || user.passwordHash !== expected) return false;
      user.passwordHash = next; await store.revokeAll(id, now); return true;
    },
  };
  const jwt = createAccessTokens({ secret: randomBytes(64).toString('hex'), issuer: 'test', audience: 'test-app', now: () => time });
  const service = await createAuthService({ users, sessions: store, accessTokens: jwt, now: () => time });
  const input = { name: 'Torcedor', email: 'fan@example.com', password: 'SenhaSegura123' };
  return { service, input, people, sessions, tokens, store, advance: (ms) => { time = new Date(time.getTime() + ms); } };
}
test('registration creates authenticated USER without exposing password or persisted refresh secrets', async () => {
  const { service, input, people, sessions } = await fixture();
  const result = await service.register(input);
  assert.equal(result.member.role, 'USER');
  assert.equal(result.accessToken.split('.').length, 3);
  assert.ok(!JSON.stringify(result).includes('passwordHash'));
  const stored = [...sessions.values()][0];
  assert.equal(stored.tokenHash, hashToken(result.refreshToken));
  assert.notEqual(stored.tokenHash, result.refreshToken);
  assert.notEqual([...people.values()][0].passwordHash, input.password);
  await assert.rejects(service.register(input), { code: 'EMAIL_IN_USE' });
  assert.equal((await service.authenticate(result.accessToken)).user.id, result.member.id);
});

test('gate login rejects fan credentials without creating a session and accepts a provisioned employee', async () => {
  const { service, input, people, sessions } = await fixture();
  await service.register(input);
  const before = sessions.size;
  await assert.rejects(service.login({ ...input, portal: 'GATE' }), { code: 'INVALID_CREDENTIALS' });
  assert.equal(sessions.size, before);
  const employee = [...people.values()][0]; employee.role = 'GATE';
  const login = await service.login({ ...input, portal: 'GATE' });
  assert.equal(login.member.role, 'GATE');
  assert.equal((await service.authenticate(login.accessToken)).user.id, employee.id);
  employee.active = false;
  await assert.rejects(service.authenticate(login.accessToken), { code: 'SESSION_REVOKED' });
});
test('unknown user, incorrect password and deactivated account share the same login error', async () => {
  const { service, input, people } = await fixture();
  await service.register(input);
  await assert.rejects(service.login({ ...input, email: 'unknown@example.com' }), { code: 'INVALID_CREDENTIALS' });
  await assert.rejects(service.login({ ...input, password: 'wrong' }), { code: 'INVALID_CREDENTIALS' });
  [...people.values()][0].active = false;
  await assert.rejects(service.login(input), { code: 'INVALID_CREDENTIALS' });
});
test('refresh rotates the secret; replay revokes the whole session including the latest access JWT', async () => {
  const { service, input } = await fixture();
  const original = await service.register(input);
  const rotated = await service.refresh(original.refreshToken);
  assert.notEqual(rotated.refreshToken, original.refreshToken);
  await service.authenticate(rotated.accessToken);
  await assert.rejects(service.refresh(original.refreshToken), { code: 'REFRESH_TOKEN_REUSED' });
  await assert.rejects(service.authenticate(rotated.accessToken), { code: 'SESSION_REVOKED' });
  await assert.rejects(service.refresh(rotated.refreshToken), { code: 'REFRESH_TOKEN_INVALID' });
});
test('logout invalidates an unexpired JWT and refresh; other sessions remain active until logout-all', async () => {
  const { service, input } = await fixture();
  const first = await service.register(input), second = await service.login(input);
  const firstAuth = await service.authenticate(first.accessToken);
  await service.logout(firstAuth.sessionId);
  await assert.rejects(service.authenticate(first.accessToken), { code: 'SESSION_REVOKED' });
  await assert.rejects(service.refresh(first.refreshToken), { code: 'REFRESH_TOKEN_INVALID' });
  const secondAuth = await service.authenticate(second.accessToken);
  const list = await service.listSessions(secondAuth.user, secondAuth.sessionId);
  assert.equal(list.length, 1); assert.equal(list[0].current, true);
  assert.ok(!JSON.stringify(list).includes('tokenHash'));
  await service.logoutAll(secondAuth.user);
  await assert.rejects(service.authenticate(second.accessToken), { code: 'SESSION_REVOKED' });
});
test('changing password requires the current password, disallows reuse and revokes every session', async () => {
  const { service, input } = await fixture();
  const first = await service.register(input), second = await service.login(input);
  const { user } = await service.authenticate(first.accessToken);
  await assert.rejects(service.changePassword(user, { currentPassword: 'wrong', newPassword: 'NovaSenha123456' }), { code: 'INVALID_CURRENT_PASSWORD' });
  await assert.rejects(service.changePassword(user, { currentPassword: input.password, newPassword: input.password }), { code: 'PASSWORD_UNCHANGED' });
  await service.changePassword(user, { currentPassword: input.password, newPassword: 'NovaSenha123456' });
  await assert.rejects(service.authenticate(second.accessToken), { code: 'SESSION_REVOKED' });
  await assert.rejects(service.login(input), { code: 'INVALID_CREDENTIALS' });
  assert.ok((await service.login({ ...input, password: 'NovaSenha123456' })).accessToken);
});
test('session lifetime is absolute even when refresh is used repeatedly', async () => {
  const { service, input, advance } = await fixture();
  const original = await service.register(input);
  advance(6 * 86400000);
  const renewed = await service.refresh(original.refreshToken);
  assert.equal(renewed.refreshTokenExpiresAt, original.refreshTokenExpiresAt);
  advance(86400000);
  await assert.rejects(service.refresh(renewed.refreshToken), { code: 'REFRESH_TOKEN_INVALID' });
});
