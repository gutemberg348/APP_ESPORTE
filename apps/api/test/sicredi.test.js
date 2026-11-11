import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSicrediClient, pixCents, pixDecimal } from '../src/payments/sicredi/client.js';
import { createSicrediTransport, loadSicrediCertificate } from '../src/payments/sicredi/transport.js';
import { parseEnv } from '../src/config/env.js';
import { createApp } from '../src/http/app.js';
import { inject } from './helpers/inject.js';
const base = { SICREDI_PIX_API_URL: 'https://bank.test/api/v2', SICREDI_PIX_AUTH_URL: 'https://bank.test/oauth/token', SICREDI_PIX_CLIENT_ID: 'test-client', SICREDI_PIX_CLIENT_SECRET: 'test-secret', SICREDI_PIX_RECEIVING_KEY: 'test-receiving-key', SICREDI_PIX_TIMEOUT_MS: 500 };

test('Sicredi OAuth coalesces concurrent calls, caches by scope and uses expires_in without unsafe POST retries', async () => {
  let instant = 0, count = 0, operations = [];
  const transport = { send: async (call) => {
    if (call.url.endsWith('/oauth/token')) { count++; assert.equal(call.headers.Authorization, `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`); assert.equal(new URLSearchParams(call.body).get('grant_type'), 'client_credentials'); return { data: { token_type: 'Bearer', access_token: `test-token-${count}`, expires_in: 10 } }; }
    operations.push(call); return { data: { status: 'ATIVA' } };
  } };
  const api = createSicrediClient(base, { transport, now: () => instant }), txid = 'ESP' + 'a'.repeat(32);
  await Promise.all(Array.from({ length: 15 }, () => api.charge(txid))); assert.equal(count, 1);
  await api.create(txid, 1001, 300, 'Pedido'); assert.equal(count, 2, 'write uses a distinct least-privilege scope');
  const create = operations.at(-1); assert.equal(create.method, 'PUT'); assert.equal(create.body.valor.original, '10.01'); assert.equal(create.body.valor.modalidadeAlteracao, 0); assert.equal(create.body.chave, base.SICREDI_PIX_RECEIVING_KEY);
  instant = 11000; await api.charge(txid); assert.equal(count, 3);
  assert.throws(() => api.charge('../secret')); assert.throws(() => pixCents(10.01)); assert.throws(() => pixCents('10,01')); assert.equal(pixCents('10.01'), 1001); assert.equal(pixDecimal(1001), '10.01');
  let failures = 0;
  const bad = createSicrediClient(base, { transport: { send: async () => { failures++; throw Object.assign(new Error('timeout'), { code: 'SICREDI_TIMEOUT' }); } } });
  await assert.rejects(bad.create(txid, 1000, 300, 'Pedido')); assert.equal(failures, 1);
});

test('Sicredi requires credentials and explicit sandbox URLs; production uses the documented host', () => {
  const source = { ...process.env, PAYMENT_MODE: 'sicredi', SICREDI_PIX_ENV: 'sandbox', SICREDI_PIX_CLIENT_ID: 'client', SICREDI_PIX_CLIENT_SECRET: 'secret', SICREDI_PIX_RECEIVING_KEY: 'key', SICREDI_PIX_CERT_PATH: 'client.cer', SICREDI_PIX_KEY_PATH: 'client.key', SICREDI_PIX_WEBHOOK_TOKEN: 'x'.repeat(64), SICREDI_PIX_API_URL: '', SICREDI_PIX_AUTH_URL: '' };
  assert.throws(() => parseEnv(source), /homologação/);
  const live = parseEnv({ ...source, SICREDI_PIX_ENV: 'production' }); assert.equal(live.SICREDI_PIX_API_URL, 'https://api-pix.sicredi.com.br/api/v2');
  assert.throws(() => parseEnv({ ...source, SICREDI_PIX_API_URL: 'http://bank.test', SICREDI_PIX_AUTH_URL: 'https://bank.test/token' }), /HTTPS/);
  assert.throws(() => parseEnv({ ...source, SICREDI_PIX_ENV: 'production', SICREDI_PIX_WEBHOOK_TOKEN: source.JWT_SECRET }), /exclusivo/);
});

test('webhook path secrets are redacted from request logs', async () => {
  const logs = [], secret = 's'.repeat(64);
  const app = createApp({ routes: [{ method: 'POST', path: '/v1/payments/webhooks/sicredi/:webhookToken/pix', handler: async () => ({ data: { received: true } }) }], logger: { info: (row) => logs.push(row), error() {} } });
  assert.equal((await inject(app, `/v1/payments/webhooks/sicredi/${secret}/pix`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"pix":[]}' })).status, 200);
  assert.ok(logs.length); assert.ok(!logs.join().includes(secret)); assert.ok(logs.join().includes('[redacted]'));
});

test('native HTTPS presents the client certificate, validates keys and sanitizes bank errors', { timeout: 30000 }, async (t) => {
  const openssl = existsSync('C:/Program Files/Git/usr/bin/openssl.exe') ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl';
  try { execFileSync(openssl, ['version'], { stdio: 'ignore' }); } catch { t.skip('OpenSSL is required only for the disposable local mTLS fixture.'); return; }
  const directory = await mkdtemp(join(tmpdir(), 'sicredi-mtls-'));
  t.after(async () => { const target = resolve(directory); assert.ok(!relative(resolve(tmpdir()), target).startsWith('..') && basename(target).startsWith('sicredi-mtls-')); await rm(target, { recursive: true, force: true }); });
  const keyPath = join(directory, 'client.key'), certPath = join(directory, 'client.cer');
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const key = await readFile(keyPath), cert = await readFile(certPath);
  const settings = { ...base, SICREDI_PIX_CERT_PATH: certPath, SICREDI_PIX_KEY_PATH: keyPath };
  const loaded = await loadSicrediCertificate(settings); assert.ok(loaded.validTo);
  await assert.rejects(loadSicrediCertificate({ ...settings, SICREDI_PIX_KEY_PATH: certPath }), { code: 'SICREDI_CERTIFICATE_INVALID' });
  let authenticated = false;
  const server = https.createServer({ key, cert, ca: cert, requestCert: true, rejectUnauthorized: true }, (req, res) => { authenticated = req.socket.authorized; if (req.url === '/timeout') return; res.writeHead(req.url === '/bad' ? 500 : 200, { 'Content-Type': 'application/json' }); res.end(req.url === '/bad' ? '{"secret":"never-return-this-value"}' : '{"ok":true}'); });
  await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
  const transport = createSicrediTransport(settings, { request: (url, options, callback) => { assert.equal(options.agent.options.rejectUnauthorized, true); return https.request(url, { ...options, ca: cert }, callback); } });
  t.after(async () => { transport.close(); server.closeAllConnections(); await new Promise((accept) => server.close(accept)); });
  const url = `https://127.0.0.1:${server.address().port}`;
  assert.equal((await transport.send({ url })).data.ok, true); assert.equal(authenticated, true);
  await assert.rejects(transport.send({ url: `${url}/bad` }), (err) => err.code === 'SICREDI_UNAVAILABLE' && !err.message.includes('never-return-this-value'));
  await assert.rejects(transport.send({ url: `${url}/timeout` }), { code: 'SICREDI_TIMEOUT' });
});
