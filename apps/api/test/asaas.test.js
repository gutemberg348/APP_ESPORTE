import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createAsaasClient, cents, validTaxId, protectDocument, authenticateAsaasWebhook } from '../src/payments/asaas-client.js';
import { parseEnv } from '../src/config/env.js';
import { publicIntent, billingSchema } from '../src/models/asaas.store.js';
import { assertTicketPaid } from '../src/lib/ticket-rules.js';
import { createApp } from '../src/http/app.js';
import { routes } from '../src/routes/index.js';
import { inject } from './helpers/inject.js';
import { AppError } from '../src/lib/errors.js';
import { configureAsaasWebhook, asaasEvents } from '../src/payments/asaas-webhook-setup.js';

test('Asaas cents, CPF/CNPJ check digits and encrypted documents reject corrupt inputs', () => {
  for (const [value, result] of [[1.01, 101], [0, 0], [12.3, 1230], [1000000, 100000000]]) assert.equal(cents(value), result);
  for (const value of [NaN, 1.001, -1, null, '10.01']) assert.throws(() => cents(value));
  assert.ok(validTaxId('529.982.247-25')); assert.ok(validTaxId('11.222.333/0001-81'));
  for (const value of ['11111111111', '52998224724', '11222333000180', '1234']) assert.equal(validTaxId(value), false);
  assert.ok(billingSchema.safeParse({ document: '52998224725' }).success);
  assert.equal(billingSchema.safeParse({ document: '52998224725', role: 'ADMIN' }).success, false);
  const cipher = protectDocument('x'.repeat(64)), encoded = cipher.encrypt('52998224725');
  assert.notEqual(encoded, cipher.encrypt('52998224725')); assert.equal(cipher.decrypt(encoded), '52998224725'); assert.ok(!encoded.includes('52998224725'));
  assert.throws(() => protectDocument('y'.repeat(64)).decrypt(encoded));
});
test('Asaas webhook token authentication and public DTO never expose credentials or stale Pix', () => {
  const secret = 'test-webhook-secret-'.padEnd(64, 'x');
  authenticateAsaasWebhook(secret, secret);
  for (const header of [undefined, [secret], secret + 'x', 'x']) assert.throws(() => authenticateAsaasWebhook(header, secret), { code: 'INVALID_WEBHOOK_TOKEN' });
  const intent = { id: 'intent', state: 'PENDING', pixPayload: 'pix', expiresAt: new Date(Date.now() + 10000), snapshot: { private: true }, providerReference: 'pay_secret', lockToken: 'secret' };
  assert.equal(publicIntent(intent).pixPayload, 'pix');
  assert.equal(publicIntent({ ...intent, refundRequestedAt: new Date() }).pixPayload, null);
  assert.equal(publicIntent({ ...intent, expiresAt: new Date(0) }).pixPayload, null);
  assert.ok(!JSON.stringify(publicIntent(intent)).includes('pay_secret'));
});
test('Asaas client isolates sandbox/production, authenticates on the server and never retries POST blindly', async () => {
  let calls = 0;
  const api = createAsaasClient({ apiKey: 'private-api-key', environment: 'sandbox', fetch: async (url, options) => {
    calls++; assert.ok(url.startsWith('https://api-sandbox.asaas.com/v3/')); assert.equal(options.headers.access_token, 'private-api-key'); assert.equal(options.redirect, 'error');
    throw new Error('private-api-key should never be exposed');
  } });
  await assert.rejects(api.createPayment({ value: 10 }), (err) => err.code === 'ASAAS_UNCERTAIN' && !err.message.includes('private-api-key')); assert.equal(calls, 1);
  assert.throws(() => api.payment('../../secrets'), { code: 'INVALID_PROVIDER_ID' });
  const live = createAsaasClient({ apiKey: 'key', environment: 'production', fetch: async (url) => { assert.ok(url.startsWith('https://api.asaas.com/v3/')); return new Response(JSON.stringify({ id: 'pay_1' }), { status: 200 }); } });
  assert.equal((await live.payment('pay_1')).id, 'pay_1');
});
test('runtime rejects the retired provider and no longer loads Asaas environment settings', () => {
  const input = { DATABASE_URL: 'postgresql://x', CARD_TOKEN_SECRET: randomBytes(32).toString('hex'), JWT_SECRET: randomBytes(64).toString('hex'), TICKET_QR_SECRET: randomBytes(64).toString('hex'), PAYMENT_MODE: 'disabled', NODE_ENV: 'production', ASAAS_API_KEY: 'retired', ASAAS_DATA_SECRET: 'retired', ASAAS_MERCHANT_WALLETS: 'invalid' };
  const parsed = parseEnv(input);
  assert.equal(parsed.PAYMENT_MODE, 'disabled');
  assert.ok(!Object.keys(parsed).some((key) => key.startsWith('ASAAS_')));
  assert.throws(() => parseEnv({ ...input, PAYMENT_MODE: 'asaas' }));
});

test('ticket admission accepts verified Asaas receipt and rejects refunded or forged receipts', () => {
  const ticket = { user: { active: true }, priceCents: 5000, payment: { method: 'ASAAS', amountCents: 5000, reference: 'ASAAS:pay_123' } };
  assertTicketPaid(ticket);
  for (const patch of [{ refundedCents: 1 }, { reference: 'forged' }, { amountCents: 4999 }]) assert.throws(() => assertTicketPaid({ ...ticket, payment: { ...ticket.payment, ...patch } }));
});
test('Pix routes enforce account/admin access before database queries', async () => {
  let role = 'USER';
  const app = createApp({ routes, authenticate: async (token) => { if (!token) throw new AppError(401, 'LOGIN_REQUIRED', 'Login necessário.'); return { user: { id: 'user', role, active: true } }; }, logger: { info() {}, error() {} } });
  for (const [path, method] of [['/v1/payments/billing-profile', 'PUT'], ['/v1/tickets/pix', 'POST'], ['/v1/payments/intent', 'GET'], ['/v1/admin/payments', 'GET'], ['/v1/admin/payments/refund', 'POST']]) assert.equal((await inject(app, path, { method })).status, 401);
  for (role of ['USER', 'GATE']) for (const path of ['/v1/admin/payments', '/v1/admin/payments/refund']) assert.equal((await inject(app, path, { method: path.endsWith('refund') ? 'POST' : 'GET', headers: { Authorization: 'Bearer test.header.signature' } })).status, 403);
});
test('webhook provisioning creates the app endpoint and preserves paused queues on update', async () => {
  const id = '4b1d3688-eb41-45e0-aa05-8e9a30446b60';
  const settings = { PAYMENT_MODE: 'asaas', ASAAS_ENVIRONMENT: 'sandbox', ASAAS_WEBHOOK_URL: 'https://api.example.com/v1/payments/webhook', ASAAS_WEBHOOK_EMAIL: 'alerts@example.com', ASAAS_WEBHOOK_TOKEN: 'a'.repeat(64) };
  const calls = [];
  const api = { request: async (path, options) => { calls.push({ path, options }); return options ? { id } : { data: [] }; } };
  assert.equal((await configureAsaasWebhook(api, settings)).created, true);
  assert.equal(calls[1].options.body.authToken, settings.ASAAS_WEBHOOK_TOKEN); assert.equal(calls[1].options.body.sendType, 'SEQUENTIALLY'); assert.ok(asaasEvents.includes('PAYMENT_RECEIVED'));
  const update = { request: async (path, options) => { if (!options) return { data: [{ id, name: 'SocioEsporte-sandbox', interrupted: true }] }; assert.equal(path, `/webhooks/${id}`); assert.equal(options.method, 'PUT'); assert.equal(options.body.interrupted, undefined); return { id }; } };
  assert.equal((await configureAsaasWebhook(update, settings)).interrupted, true);
  await assert.rejects(configureAsaasWebhook(api, { ...settings, ASAAS_WEBHOOK_URL: 'http://localhost/v1/payments/webhook' }));
});
