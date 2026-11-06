import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { createApp } from '../src/http/app.js';
import { createHttpServer } from '../src/http/server.js';
import { inject } from './helpers/inject.js';
import { AppError } from '../src/lib/errors.js';
const logger = { info() {}, error() {} };
async function app(t, extra = {}) {
  const application = createApp({
    logger, corsOrigins: ['http://allowed.local'],
    authenticate: async (token) => { if (token !== 'test.header.signature') throw new AppError(401, 'UNAUTHORIZED', 'Entre na sua conta.'); return { user: { id: 'test' } }; },
    routes: [
      { method: 'GET', path: '/private', private: true, handler: async ({ user }) => ({ data: user }) },
      { method: 'POST', path: '/echo', handler: async ({ body }) => ({ data: z.object({ name: z.string() }).strict().parse(body) }) },
      { method: 'GET', path: '/failure', handler: async () => { throw new Error('sensitive internals'); } },
    ], ...extra,
  });
  return (path, options) => inject(application, path, options);
}
test('health responde sem banco e readiness relata indisponibilidade', async (t) => {
  const url = await app(t, { readiness: async () => { throw new Error('offline'); } });
  assert.equal((await url('/health')).status, 200);
  assert.equal((await url('/ready')).status, 503);
});
test('rotas privadas exigem Bearer e não expõem detalhes de erros internos', async (t) => {
  const url = await app(t);
  assert.equal((await url('/private')).status, 401);
  const ok = await url('/private', { headers: { Authorization: 'Bearer test.header.signature' } });
  assert.deepEqual((await ok.json()).data, { id: 'test' });
  const failed = await url('/failure');
  assert.equal(failed.status, 500);
  assert.ok(!(await failed.text()).includes('sensitive internals'));
});
test('CORS permite apenas origens configuradas e preflight responde 204', async (t) => {
  const url = await app(t);
  assert.equal((await url('/health', { headers: { Origin: 'http://blocked.local' } })).status, 403);
  const res = await url('/echo', { method: 'OPTIONS', headers: { Origin: 'http://allowed.local' } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://allowed.local');
});
test('corpos inválidos, grandes e campos incorretos retornam erros específicos', async (t) => {
  const url = await app(t);
  const post = (body, contentType = 'application/json') => url('/echo', { method: 'POST', headers: { 'Content-Type': contentType }, body });
  assert.equal((await post('{')).status, 400);
  assert.equal((await post('{}', 'text/plain')).status, 415);
  assert.equal((await post('{}')).status, 422);
  assert.equal((await post(JSON.stringify({ name: 'a'.repeat(17000) }))).status, 413);
  const good = await post(JSON.stringify({ name: 'Nacional' }));
  assert.equal(good.status, 200);
  assert.deepEqual((await good.json()).data, { name: 'Nacional' });
  assert.equal(good.headers.get('cache-control'), 'no-store');
  assert.ok(good.headers.get('x-request-id'));
});
test('rotas desconhecidas e métodos inválidos são diferenciados', async (t) => {
  const url = await app(t);
  assert.equal((await url('/missing')).status, 404);
  assert.equal((await url('/echo')).status, 405);
});

test('Express application is independent of listening and preserves transport timeouts', () => {
  const application = createApp({ routes: [], logger });
  assert.equal(typeof application.use, 'function');
  assert.equal(application.enabled('x-powered-by'), false);
  assert.equal(application.get('trust proxy'), false);
  const server = createHttpServer({ routes: [], logger });
  assert.equal(server.listening, false);
  assert.equal(server.requestTimeout, 15000);
  assert.equal(server.headersTimeout, 10000);
  assert.throws(() => createApp({ logger, routes: [
    { method: 'GET', path: '/duplicate', handler: () => ({}) },
    { method: 'GET', path: '/duplicate', handler: () => ({}) },
  ] }), /duplicada/);
});

test('Express preserves exact paths, explicit methods and security headers', async (t) => {
  const client = await app(t);
  for (const path of ['/PRIVATE', '/private/', '/private/extra']) assert.equal((await client(path)).status, 404);
  const method = await client('/private', { method: 'HEAD' });
  assert.equal(method.status, 405); assert.equal(method.headers.get('allow'), 'GET');
  const health = await client('/health');
  assert.equal(health.headers.get('x-powered-by'), null);
  assert.equal(health.headers.get('etag'), null);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(health.headers.get('vary'), 'Origin');
  const absent = await client('/private');
  assert.equal(absent.headers.get('www-authenticate'), 'Bearer realm="nacional-api"');
  assert.equal((await absent.json()).error.requestId, absent.headers.get('x-request-id'));
});

test('body parsing preserves raw bytes, rejects empty/compressed bodies and keeps Zod field details', async (t) => {
  const client = await app(t, { routes: [{ method: 'POST', path: '/raw', handler: async ({ req, body }) => ({ data: { raw: req.rawBody.toString('utf8'), body } }) }, { method: 'POST', path: '/validate', handler: async ({ body }) => ({ data: z.object({ name: z.string() }).parse(body) }) }] });
  const body = '{ "name": "Nação 💚" }';
  const response = await client('/raw', { method: 'POST', body, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  assert.deepEqual((await response.json()).data, { raw: body, body: { name: 'Nação 💚' } });
  assert.equal((await client('/raw', { method: 'POST', body: '', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await client('/raw', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } })).status, 415);
  const invalid = await client('/validate', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
  const error = (await invalid.json()).error;
  assert.equal(invalid.status, 422); assert.equal(error.details[0].path, 'name');
});

test('authentication and live admin/gate permissions run before JSON parsing or the controller', async (t) => {
  let calls = 0;
  const routes = [
    { method: 'POST', path: '/admin', private: true, admin: true, handler: async () => { calls++; return { data: true }; } },
    { method: 'POST', path: '/gate', private: true, gate: true, handler: async () => { calls++; return { data: true }; } },
    { method: 'GET', path: '/fan', private: true, handler: async () => ({ data: true }) },
    { method: 'GET', path: '/self', private: true, staffSelf: true, handler: async () => ({ data: true }) },
  ];
  let user = { id: 'person', role: 'USER', active: true };
  const client = await app(t, { routes, authenticate: async (token) => { if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Login'); return { user }; } });
  const auth = { Authorization: 'Bearer test.header.signature', 'Content-Type': 'application/json' };
  assert.equal((await client('/admin', { method: 'POST', body: '{' })).status, 401);
  assert.equal((await client('/admin', { method: 'POST', body: '{', headers: auth })).status, 403);
  assert.equal((await client('/gate', { method: 'POST', body: '{}', headers: auth })).status, 403);
  assert.equal(calls, 0);
  user = { ...user, role: 'GATE' };
  assert.equal((await client('/fan', { headers: auth })).status, 403);
  assert.equal((await client('/self', { headers: auth })).status, 200);
  assert.equal((await client('/gate', { method: 'POST', body: '{}', headers: auth })).status, 200);
  assert.equal((await client('/admin', { method: 'POST', body: '{}', headers: auth })).status, 403);
  user = { ...user, role: 'ADMIN' };
  assert.equal((await client('/admin', { method: 'POST', body: '{}', headers: auth })).status, 200);
  user.active = false;
  assert.equal((await client('/admin', { method: 'POST', body: '{}', headers: auth })).status, 403);
  assert.equal(calls, 2);
});

test('logout-style routes skip body parsing and keep empty 204 responses', async (t) => {
  const client = await app(t, { routes: [{ method: 'POST', path: '/logout', body: false, handler: async ({ body }) => { assert.equal(body, undefined); return { status: 204 }; } }] });
  const response = await client('/logout', { method: 'POST' });
  assert.equal(response.status, 204); assert.equal(await response.text(), '');
});

test('login throttling ignores forged forwarded IP headers and returns Retry-After', async (t) => {
  const client = await app(t, { routes: [{ method: 'POST', path: '/login', authLimit: true, handler: async () => { throw new AppError(401, 'INVALID_CREDENTIALS', 'Login'); } }] });
  for (let attempt = 0; attempt < 10; attempt++) assert.equal((await client('/login', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.0.0.${attempt}` } })).status, 401);
  const rejected = await client('/login', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.10' } });
  assert.equal(rejected.status, 429); assert.equal(rejected.headers.get('retry-after'), '900');
  assert.equal((await rejected.json()).error.code, 'AUTH_RATE_LIMIT');
});

test('general, refresh and gate limits remain separate and protect their original scopes', async (t) => {
  const client = await app(t);
  for (let count = 0; count < 120; count++) assert.equal((await client('/health')).status, 200);
  assert.equal((await client('/health')).status, 429);
  const refresh = await app(t, { routes: [{ method: 'POST', path: '/refresh', refreshLimit: true, body: false, handler: async () => ({ data: true }) }] });
  for (let count = 0; count < 60; count++) assert.equal((await refresh('/refresh', { method: 'POST' })).status, 200);
  assert.equal((await (await refresh('/refresh', { method: 'POST' })).json()).error.code, 'REFRESH_RATE_LIMIT');
  const gate = await app(t, { authenticate: async () => ({ user: { id: 'gate-person', role: 'GATE', active: true } }), routes: [{ method: 'GET', path: '/gate', private: true, gate: true, handler: async () => ({ data: true }) }] });
  for (let count = 0; count < 90; count++) assert.equal((await gate('/gate')).status, 200);
  assert.equal((await (await gate('/gate')).json()).error.code, 'GATE_RATE_LIMIT');
});

test('ticket throttling follows the authenticated account across IPs and shares checkout operations', async (t) => {
  let calls = 0;
  const client = await app(t, {
    authenticate: async (token) => ({ user: { id: token, role: 'USER', active: true } }),
    routes: [
      ...['reserve', 'cancel', 'pix'].map((name) => ({ method: 'POST', path: `/${name}`, private: true, body: false, ticketLimit: 'checkout', handler: async () => { calls++; return { data: true }; } })),
      { method: 'GET', path: '/qr', private: true, ticketLimit: 'qr', handler: async () => ({ data: true }) },
      { method: 'POST', path: '/quote', private: true, body: false, ticketLimit: 'quote', handler: async () => ({ data: true }) },
    ],
  });
  const headers = { Authorization: 'Bearer first.header.signature' };
  for (let index = 0; index < 10; index++) assert.equal((await client(`/${['reserve', 'cancel', 'pix'][index % 3]}`, { method: 'POST', headers, ip: `10.0.0.${index}` })).status, 200);
  const rejected = await client('/reserve', { method: 'POST', headers, ip: '10.1.1.1' });
  assert.equal(rejected.status, 429); assert.equal(rejected.headers.get('retry-after'), '60'); assert.equal((await rejected.json()).error.code, 'TICKET_RATE_LIMIT'); assert.equal(calls, 10);
  assert.equal((await client('/reserve', { method: 'POST', headers: { Authorization: 'Bearer another.header.signature' } })).status, 200);
  for (let index = 0; index < 20; index++) assert.equal((await client('/qr', { headers })).status, 200);
  assert.equal((await client('/qr', { headers })).status, 429);
  for (let index = 0; index < 30; index++) assert.equal((await client('/quote', { method: 'POST', headers })).status, 200);
  assert.equal((await client('/quote', { method: 'POST', headers })).status, 429);
});

test('Prisma conflicts keep their public error codes without leaking database messages', async (t) => {
  for (const [code, status, expected] of [['P2002', 409, 'CONFLICT'], ['P2034', 409, 'CONCURRENT_UPDATE'], ['P2025', 404, 'RECORD_NOT_FOUND'], ['P2021', 503, 'DATABASE_SCHEMA_OUTDATED'], ['P2022', 503, 'DATABASE_SCHEMA_OUTDATED'], ['P1001', 503, 'DATABASE_UNAVAILABLE'], ['ECONNREFUSED', 503, 'DATABASE_UNAVAILABLE']]) {
    const client = await app(t, { routes: [{ method: 'GET', path: '/database-error', handler: async () => { throw Object.assign(new Error('secret SQL details'), { code }); } }] });
    const response = await client('/database-error'), payload = await response.json();
    assert.equal(response.status, status); assert.equal(payload.error.code, expected); assert.ok(!JSON.stringify(payload).includes('secret SQL'));
  }
});
