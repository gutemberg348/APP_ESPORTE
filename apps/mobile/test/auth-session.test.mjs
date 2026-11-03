import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
// Compile the actual mobile state machine in memory. It has no native runtime
// dependency, so these tests need no Expo, browser, server or filesystem edits.
const source = await readFile(new URL('../src/services/auth-session.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { createSessionManager } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const response = (suffix) => ({ accessToken: `access-${suffix}`, refreshToken: `refresh-${suffix}`, accessTokenExpiresAt: '2026-10-30T12:15:00Z', refreshTokenExpiresAt: '2026-11-06T12:00:00Z', expiresIn: 900, tokenType: 'Bearer', member: { name: 'private profile' } });
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture(exchange) {
  const memory = { saved: null };
  const manager = createSessionManager({
    storage: { get: async () => memory.saved, set: async (value) => { memory.saved = value; }, clear: async () => { memory.saved = null; } }, exchange,
    unauthorized: () => Object.assign(new Error('unauthorized'), { status: 401 }), isRejected: (error) => error.status === 401,
  });
  return { manager, memory };
}
test('simultaneous API calls share one refresh and persist the rotated pair without the profile', async () => {
  const gate = deferred(); let calls = 0;
  const { manager, memory } = fixture(async (token) => { calls++; assert.equal(token, 'refresh-1'); return gate.promise; });
  await manager.accept(response('1'));
  const results = [manager.refresh(), manager.refresh(), manager.refresh()];
  assert.equal(calls, 1);
  gate.resolve(response('2'));
  await Promise.all(results);
  assert.equal(memory.saved.refreshToken, 'refresh-2');
  assert.equal(manager.current().accessToken, 'access-2');
  assert.equal(manager.owns('access-1'), true);
  assert.ok(!Object.hasOwn(memory.saved, 'member'));
});
test('logout during refresh prevents late response from restoring tokens in memory or storage', async () => {
  const gate = deferred();
  const { manager, memory } = fixture(async () => gate.promise);
  await manager.accept(response('1'));
  const refresh = manager.refresh();
  await manager.clear(); gate.resolve(response('2'));
  await assert.rejects(refresh, { status: 401 });
  assert.equal(manager.current(), null); assert.equal(memory.saved, null);
  assert.equal(manager.owns('access-1'), false);
});
test('late refresh from an old account cannot overwrite a new login', async () => {
  const gate = deferred();
  const { manager, memory } = fixture(async () => gate.promise);
  await manager.accept(response('old'));
  const refresh = manager.refresh();
  await manager.accept(response('new')); gate.resolve(response('old-rotated'));
  await assert.rejects(refresh, { status: 401 });
  assert.equal(manager.current().accessToken, 'access-new');
  assert.equal(memory.saved.refreshToken, 'refresh-new');
  assert.equal(manager.owns('access-old'), false);
  assert.equal(manager.owns('access-new'), true);
});
test('network failure retains saved credentials; rejected refresh clears them', async () => {
  let denied = false;
  const { manager, memory } = fixture(async () => { throw Object.assign(new Error('failure'), denied ? { status: 401 } : {}); });
  await manager.accept(response('1'));
  await assert.rejects(manager.refresh());
  assert.equal(manager.current().accessToken, 'access-1');
  denied = true;
  await assert.rejects(manager.refresh());
  assert.equal(manager.current(), null); assert.equal(memory.saved, null);
});
