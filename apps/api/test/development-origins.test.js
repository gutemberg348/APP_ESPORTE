import test from 'node:test';
import assert from 'node:assert/strict';
import { createDevelopmentOriginPolicy } from '../src/http/development-origins.js';
import { createApp } from '../src/http/app.js';
import { inject } from './helpers/inject.js';
import { AppError } from '../src/lib/errors.js';
test('development web origins follow the current machine interfaces and keep exact configured ports', async () => {
  let address = '192.168.0.101';
  const allowDevelopmentOrigin = createDevelopmentOriginPolicy({ enabled: true, origins: ['http://localhost:8081', 'http://localhost:8082'], interfaces: () => ({ wifi: [{ family: 'IPv4', address, internal: false }] }) });
  const app = createApp({ routes: [], corsOrigins: ['http://localhost:8081'], allowDevelopmentOrigin, logger: { info() {}, error() {} } });
  let response = await inject(app, '/health', { headers: { origin: 'http://192.168.0.101:8081' } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), 'http://192.168.0.101:8081');
  address = '192.168.0.102';
  assert.equal((await inject(app, '/health', { headers: { origin: 'http://192.168.0.101:8081' } })).status, 403);
  assert.equal((await inject(app, '/health', { headers: { origin: 'http://192.168.0.102:8082' } })).status, 200);
  for (const origin of ['http://192.168.0.200:8081', 'http://192.168.0.102:9999', 'http://evil.example:8081', 'http://localhost.evil.example:8081', 'null', 'http://user:pass@192.168.0.102:8081', 'http://192.168.0.102:8081/path', 'https://192.168.0.102:8081']) assert.equal(allowDevelopmentOrigin(origin), false, origin);
});
test('production never enables automatic LAN origins, and private routes still require authentication', async () => {
  const policy = createDevelopmentOriginPolicy({ enabled: false, origins: ['http://localhost:8081'], interfaces: () => { throw Error('must not enumerate'); } });
  assert.equal(policy('http://192.168.0.101:8081'), false);
  const app = createApp({ routes: [{ method: 'GET', path: '/private', private: true, handler: () => { throw Error('must not execute'); } }], authenticate: () => { throw new AppError(401, 'ACCESS_TOKEN_INVALID', 'Entre novamente.'); }, corsOrigins: ['http://localhost:8081'], logger: { info() {}, error() {} } });
  assert.equal((await inject(app, '/health', { headers: { origin: 'http://192.168.0.101:8081' } })).status, 403);
  assert.equal((await inject(app, '/private', { headers: { origin: 'http://localhost:8081' } })).status, 401);
});
