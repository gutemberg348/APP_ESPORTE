import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function moduleFrom(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
}
const { resolveApiUrl } = await moduleFrom('../src/config/api-url.ts');
const { createApiTransport, ApiError } = await moduleFrom('../src/services/api-transport-core.ts');
const { checkApiConnection } = await moduleFrom('../src/services/api-connection.ts');

test('physical phones replace development localhost with the Expo computer and preserve API port/path', () => {
  assert.equal(resolveApiUrl('http://localhost:3333/v1/', 'ios', '192.168.0.100:8081', true), 'http://192.168.0.100:3333/v1');
  assert.equal(resolveApiUrl('http://127.0.0.1:3333/v1', 'android', 'exp://192.168.0.100:8081', true), 'http://192.168.0.100:3333/v1');
  assert.equal(resolveApiUrl(undefined, 'ios', '192.168.0.100:8081', true), 'http://192.168.0.100:3333/v1');
});

test('web, release builds and explicit server addresses are never silently redirected', () => {
  assert.equal(resolveApiUrl('http://localhost:3333/v1', 'web', '192.168.0.100:8081', true), 'http://localhost:3333/v1');
  assert.equal(resolveApiUrl('http://localhost:3333/v1', 'ios', '192.168.0.100:8081', false), 'http://localhost:3333/v1');
  assert.equal(resolveApiUrl('https://api.example.com/v1', 'ios', '192.168.0.100:8081', true), 'https://api.example.com/v1');
  assert.throws(() => resolveApiUrl('ftp://example.com', 'ios'), /HTTP/);
  assert.throws(() => resolveApiUrl('http://secret:password@example.com', 'ios'), /credenciais/);
});
test('development web uses the browser host while native follows a changed Wi-Fi address', () => {
  assert.equal(resolveApiUrl('http://localhost:3333/v1', 'web', '192.168.0.100:8081', true, 'http://localhost:8081'), 'http://localhost:3333/v1');
  assert.equal(resolveApiUrl('http://localhost:3333/v1', 'web', null, true, 'http://192.168.0.101:8081'), 'http://192.168.0.101:3333/v1');
  assert.equal(resolveApiUrl('http://localhost:3333/v1', 'ios', '192.168.0.101:8081', true), 'http://192.168.0.101:3333/v1');
  assert.equal(resolveApiUrl('http://localhost:4444/custom/v1', 'web', null, true, 'http://192.168.0.102:8082'), 'http://192.168.0.102:4444/custom/v1');
  assert.equal(resolveApiUrl('https://api.example.com/v1', 'web', null, true, 'http://192.168.0.101:8081'), 'https://api.example.com/v1');
  assert.equal(resolveApiUrl('http://localhost:3333/v1', 'web', null, false, 'https://production.example'), 'http://localhost:3333/v1');
});

test('explicit local development mode replaces stale private addresses without changing separate APIs or release builds', () => {
  assert.equal(resolveApiUrl('http://192.168.0.100:3333/v1', 'web', null, true, 'http://localhost:8081', 'local'), 'http://localhost:3333/v1');
  assert.equal(resolveApiUrl('http://192.168.0.100:3333/v1', 'ios', '192.168.0.101:8081', true, null, 'local'), 'http://192.168.0.101:3333/v1');
  assert.equal(resolveApiUrl('http://10.0.0.2:4444/backend/v1', 'web', null, true, 'http://192.168.0.101:8081', 'local'), 'http://192.168.0.101:4444/backend/v1');
  assert.equal(resolveApiUrl('http://172.20.0.10:3333/v1', 'web', null, true, 'http://127.0.0.1:8081', 'local'), 'http://127.0.0.1:3333/v1');
  for (const address of ['https://api.example.com/v1', 'http://172.32.0.1:3333/v1', 'http://192.168.999.1:3333/v1']) {
    if (address.includes('999')) { assert.throws(() => resolveApiUrl(address, 'web', null, true, 'http://localhost:8081', 'local')); continue; }
    assert.equal(resolveApiUrl(address, 'web', null, true, 'http://localhost:8081', 'local'), address);
  }
  assert.equal(resolveApiUrl('http://192.168.0.100:3333/v1', 'web', null, true, 'http://localhost:8081', 'configured'), 'http://192.168.0.100:3333/v1');
  assert.equal(resolveApiUrl('http://192.168.0.100:3333/v1', 'web', null, false, 'https://production.example', 'local'), 'http://192.168.0.100:3333/v1');
  assert.equal(resolveApiUrl('http://localhost:3333/v1', 'web', null, true, 'https://unrelated.example', 'local'), 'http://localhost:3333/v1');
});

test('transport resolves the current URL per request and never retries login or sends its password elsewhere', async () => {
  let base = 'http://192.168.0.100:3333/v1';
  const sent = [];
  const send = createApiTransport(() => base, async (url, options) => {
    sent.push({ url, options });
    base = 'http://localhost:3333/v1';
    if (sent.length === 1) throw new TypeError('Network request failed');
    return Response.json({ data: { ok: true } });
  });
  await assert.rejects(send('/auth/login', { method: 'POST', body: { password: 'diagnostic-only' } }), (error) => error.code === 'API_UNREACHABLE' && error.message.includes('192.168.0.100:3333'));
  assert.equal(sent.length, 1, 'a failed login POST is not replayed');
  assert.deepEqual(await send('/matches'), { ok: true });
  assert.equal(sent[1].url, 'http://localhost:3333/v1/matches');
  assert.equal(sent[1].options.body, undefined);
});

test('connection diagnostics validate API identity and readiness without credentials or a login attempt', async () => {
  const calls = [];
  const result = await checkApiConnection('http://localhost:3333/backend/v1', async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: { status: url.endsWith('/health') ? 'ok' : 'ready', service: 'nacional-api' } });
  });
  assert.equal(result.ready, true);
  assert.deepEqual(calls.map((call) => call.url).sort(), ['http://localhost:3333/backend/health', 'http://localhost:3333/backend/ready']);
  for (const { options } of calls) {
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined);
    assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, undefined);
  }
  const downDatabase = await checkApiConnection('http://localhost:3333/v1', async (url) => url.endsWith('/health') ? Response.json({ data: { status: 'ok', service: 'nacional-api' } }) : Response.json({ error: { code: 'DATABASE_UNAVAILABLE' } }, { status: 503 }));
  assert.equal(downDatabase.ready, false); assert.match(downDatabase.message, /banco/);
  const wrongApp = await checkApiConnection('http://localhost:3333/v1', async () => Response.json({ data: { status: 'ok', service: 'another-app' } }));
  assert.equal(wrongApp.ready, false);
});

test('connection diagnostics stop on deadline instead of leaving the login stuck', async () => {
  const result = await checkApiConnection('http://localhost:3333/v1', async (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })), 5);
  assert.equal(result.ready, false); assert.match(result.message, /localhost:3333/);
});

test('registration transport sends JSON to the API and accepts the data envelope', async () => {
  let sent;
  const send = createApiTransport('http://192.168.0.100:3333/v1', async (url, options) => { sent = { url, options }; return Response.json({ data: { member: { role: 'USER' } } }, { status: 201 }); });
  const result = await send('/auth/register', { method: 'POST', body: { name: 'Teste', email: 'test@example.com', password: 'test-only-password' } });
  assert.equal(sent.url, 'http://192.168.0.100:3333/v1/auth/register');
  assert.equal(sent.options.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(sent.options.body).name, 'Teste');
  assert.equal(result.member.role, 'USER');
});

test('server validation, duplicate accounts and database failures preserve their status and protocol', async () => {
  for (const [status, code] of [[422, 'VALIDATION_ERROR'], [409, 'EMAIL_IN_USE'], [503, 'DATABASE_SCHEMA_OUTDATED']]) {
    const send = createApiTransport('http://server/v1', async () => Response.json({ error: { code, message: 'Confira os dados.', details: status === 422 ? [{ path: 'email', message: 'Informe um e-mail válido.' }] : undefined, requestId: 'protocol-1' } }, { status }));
    await assert.rejects(send('/auth/register'), (error) => {
      assert.ok(error instanceof ApiError); assert.equal(error.status, status); assert.equal(error.code, code); assert.equal(error.requestId, 'protocol-1');
      if (status === 422) assert.match(error.message, /e-mail válido/);
      assert.ok(!error.message.includes('conectar')); return true;
    });
  }
});

test('non-JSON and malformed API responses are not misreported as connection failures', async () => {
  const html = createApiTransport('http://server/v1', async () => new Response('<html>Unavailable</html>', { status: 502, headers: { 'x-request-id': 'protocol-2' } }));
  await assert.rejects(html('/auth/register'), { code: 'INVALID_API_RESPONSE', status: 502, requestId: 'protocol-2' });
  const missing = createApiTransport('http://server/v1', async () => Response.json({ service: 'other application' }));
  await assert.rejects(missing('/auth/register'), { code: 'INVALID_API_RESPONSE' });
});

test('unreachable API and timeout have separate actionable errors without exposing a request body', async () => {
  const offline = createApiTransport('http://192.168.0.100:3333/v1', async () => { throw new TypeError('Network request failed'); });
  await assert.rejects(offline('/auth/register', { body: { password: 'must-not-appear' } }), (error) => {
    assert.equal(error.code, 'API_UNREACHABLE'); assert.equal(error.status, 0); assert.match(error.message, /192\.168\.0\.100:3333/); assert.ok(!error.message.includes('must-not-appear')); return true;
  });
  const slow = createApiTransport('http://server/v1', async (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })), 5);
  await assert.rejects(slow('/auth/register'), { code: 'API_TIMEOUT', status: 0 });
});
