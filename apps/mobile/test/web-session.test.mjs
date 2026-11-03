import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function source(path) {
  const value = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(value, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
}
const { createWebSessionStorage } = await source('../src/services/web-session-storage.ts');
const { createSessionManager } = await source('../src/services/auth-session.ts');
const { createAuthenticatedRequest } = await source('../src/services/authenticated-request.ts');
const { ApiError } = await source('../src/services/api-transport-core.ts');
const start = Date.parse('2026-11-03T12:00:00Z');
function response(suffix) {
  return { accessToken: `header.${suffix}.signature`, refreshToken: suffix.padEnd(43, 'x'), tokenType: 'Bearer', accessTokenExpiresAt: new Date(start + 900000).toISOString(), refreshTokenExpiresAt: new Date(start + 7 * 86400000).toISOString(), expiresIn: 900, member: { id: 'admin', name: 'Administrador', role: 'ADMIN' } };
}
function browser() {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
function manager(storage, exchange) {
  return createSessionManager({ storage, exchange, unauthorized: () => new ApiError(401, 'Login', 'SESSION_REVOKED'), isRejected: (error) => error.status === 401 });
}

test('web reload restores the tab session without persisting password or profile', async () => {
  const tab = browser(), firstStorage = createWebSessionStorage('api-one', () => tab, () => start);
  const first = manager(firstStorage, async () => response('rotated'));
  await first.accept({ ...response('original'), password: 'never save' });
  const raw = tab.getItem('api-one');
  assert.ok(!raw.includes('member')); assert.ok(!raw.includes('password')); assert.ok(!raw.includes('Administrador'));
  const reloadedStorage = createWebSessionStorage('api-one', () => tab, () => start);
  const reloaded = manager(reloadedStorage, async () => { throw new Error('Fresh access must not refresh on reload'); });
  assert.ok(await reloaded.restore());
  const request = createAuthenticatedRequest(async (path, options) => { assert.equal(path, '/me'); assert.equal(options.token, response('original').accessToken); return response('original').member; }, reloaded, ApiError, () => start);
  assert.equal((await request('/me', { token: reloaded.current().accessToken })).role, 'ADMIN');
  assert.equal(reloaded.current().refreshToken, response('original').refreshToken);
  await reloaded.clear();
  assert.equal(await createWebSessionStorage('api-one', () => tab, () => start).get(), null);
});

test('browser sessions are scoped to their API, and a closed tab does not carry its credentials', async () => {
  const tab = browser();
  await createWebSessionStorage('api-one', () => tab, () => start).set(response('a'));
  assert.equal(await createWebSessionStorage('api-two', () => tab, () => start).get(), null);
  assert.equal(await createWebSessionStorage('api-one', () => browser(), () => start).get(), null);
});

test('corrupt and expired browser sessions are cleared; an expired JWT retains its valid refresh', async () => {
  const tab = browser();
  for (const value of ['{', 'null', JSON.stringify({ ...response('a'), accessToken: 'invalid' }), JSON.stringify({ ...response('a'), refreshTokenExpiresAt: new Date(start - 1).toISOString() })]) {
    tab.setItem('auth', value);
    assert.equal(await createWebSessionStorage('auth', () => tab, () => start).get(), null);
    assert.equal(tab.getItem('auth'), null);
  }
  await createWebSessionStorage('auth', () => tab, () => start).set(response('a'));
  assert.ok(await createWebSessionStorage('auth', () => tab, () => start + 1000000).get());
});

test('blocked browser storage still allows an in-memory login and explicit logout', async () => {
  const storage = createWebSessionStorage('auth', () => { throw new Error('SecurityError'); }, () => start);
  await storage.set(response('a')); assert.equal((await storage.get()).refreshToken, response('a').refreshToken);
  await storage.clear(); assert.equal(await storage.get(), null);
});

test('simultaneous expired JWT calls share one refresh and keep the rotated session after reload', async () => {
  const tab = browser(); let refreshes = 0, release;
  const storage = createWebSessionStorage('auth', () => tab, () => start);
  const session = manager(storage, async () => { refreshes++; await new Promise((resolve) => { release = resolve; }); return { ...response('new'), accessTokenExpiresAt: new Date(start + 1800000).toISOString() }; });
  await session.accept(response('old'));
  const request = createAuthenticatedRequest(async (_, options) => { assert.equal(options.token, response('new').accessToken); return true; }, session, ApiError, () => start + 900001);
  const calls = [1, 2, 3, 4, 5, 6].map(() => request('/admin/overview', { token: response('old').accessToken }));
  assert.equal(refreshes, 1); release(); await Promise.all(calls);
  assert.equal(session.current().refreshToken, response('new').refreshToken);
  assert.equal((await createWebSessionStorage('auth', () => tab, () => start).get()).refreshToken, response('new').refreshToken);
  assert.equal(await session.restore(), session.current());
});

test('API expiry is renewed once while outages and validation errors never clear a valid session', async () => {
  const tab = browser(); let calls = 0, refreshes = 0;
  const session = manager(createWebSessionStorage('auth', () => tab, () => start), async () => { refreshes++; return response('new'); });
  await session.accept(response('old'));
  const request = createAuthenticatedRequest(async () => { if (++calls === 1) throw new ApiError(401, 'Expired', 'ACCESS_TOKEN_EXPIRED'); return true; }, session, ApiError, () => start);
  assert.equal(await request('/me', { token: response('old').accessToken }), true); assert.equal(refreshes, 1); assert.equal(calls, 2);
  for (const [status, code] of [[0, 'API_UNREACHABLE'], [503, 'DATABASE_UNAVAILABLE'], [422, 'VALIDATION_ERROR'], [401, 'INVALID_CURRENT_PASSWORD']]) {
    const failing = createAuthenticatedRequest(async () => { throw new ApiError(status, 'Failure', code); }, session, ApiError, () => start);
    await assert.rejects(failing('/me', { token: session.current().accessToken }), { code });
    assert.ok(session.current()); assert.ok(tab.getItem('auth'));
  }
});

test('genuine revocation and rejected refresh erase both memory and browser storage', async () => {
  for (const revoked of [true, false]) {
    const tab = browser();
    const session = manager(createWebSessionStorage('auth', () => tab, () => start), async () => { throw new ApiError(401, 'Revoked', 'REFRESH_TOKEN_INVALID'); });
    await session.accept(response('old'));
    const request = createAuthenticatedRequest(async () => { throw new ApiError(401, 'Revoked', 'SESSION_REVOKED'); }, session, ApiError, () => start + (revoked ? 0 : 900001));
    await assert.rejects(request('/me', { token: response('old').accessToken }));
    assert.equal(session.current(), null); assert.equal(tab.getItem('auth'), null);
  }
});
