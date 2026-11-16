import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkedTestTxid, inspectTestCharge, newTestTxid, runSicrediTest, safeTestFailure, testAmount, testSettings } from '../scripts/sicredi-test-core.mjs';
import { createSicrediClient } from '../src/payments/sicredi/client.js';

const txid = `TST${'a'.repeat(32)}`, e2e = `E${'b'.repeat(31)}`;
const settings = { SICREDI_PIX_ENV: 'sandbox', SICREDI_PIX_API_URL: 'https://sandbox.bank.test/api/v2', SICREDI_PIX_AUTH_URL: 'https://sandbox.bank.test/oauth/token', SICREDI_PIX_CLIENT_ID: 'private-id', SICREDI_PIX_CLIENT_SECRET: 'private-secret', SICREDI_PIX_RECEIVING_KEY: 'private-receiving-key', SICREDI_PIX_CERT_PATH: '/private/cert.cer', SICREDI_PIX_KEY_PATH: '/private/key.key', SICREDI_PIX_WEBHOOK_TOKEN: 'private-webhook-token', SICREDI_PIX_WEBHOOK_URL: 'https://api.club.test/v1/payments/webhooks/sicredi' };
const charge = (overrides = {}) => ({ txid, chave: settings.SICREDI_PIX_RECEIVING_KEY, valor: { original: '1.00', modalidadeAlteracao: 0 }, status: 'ATIVA', pix: [], pixCopiaECola: 'PAYABLE-TEST-FIXTURE', ...overrides });
const receipt = (overrides = {}) => ({ txid, endToEndId: e2e, valor: '1.00', horario: '2026-11-13T12:00:00Z', ...overrides });
function harness(overrides = {}) {
  const calls = [], reports = [];
  const api = Object.fromEntries(['authenticate', 'webhook', 'charge', 'create', 'cancel', 'pix'].map(name => [name, async (...args) => { calls.push({ name, args }); return overrides[name]?.(...args) ?? null; }]));
  api.close = () => calls.push({ name: 'close' });
  const deps = { createClient: () => api, certificate: async () => ({ validTo: 'test-only' }), pause: async () => {}, report: row => reports.push(row) };
  return { api, deps, calls, reports };
}

test('isolated tools validate only banking configuration without activating the app or production by mistake', () => {
  const parsed = testSettings({ ...settings, PAYMENT_MODE: 'disabled', DATABASE_URL: 'private-db' });
  assert.equal(parsed.PAYMENT_MODE, undefined); assert.equal(parsed.DATABASE_URL, undefined);
  assert.equal(testSettings({ ...settings, SICREDI_PIX_ENV: 'production', SICREDI_PIX_API_URL: '', SICREDI_PIX_AUTH_URL: '' }).SICREDI_PIX_API_URL, 'https://api-pix.sicredi.com.br/api/v2');
  assert.throws(() => testSettings({ ...settings, SICREDI_PIX_API_URL: 'https://api-pix.sicredi.com.br/api/v2' }), /Sandbox/);
  assert.throws(() => testSettings({ ...settings, SICREDI_PIX_AUTH_URL: 'http://sandbox.bank.test/token' }), /HTTPS/);
  assert.equal(testSettings({ SICREDI_PIX_ENV: 'production', SICREDI_PIX_CERT_PATH: '/cert', SICREDI_PIX_KEY_PATH: '/key' }, { certificateOnly: true }).SICREDI_PIX_ENV, 'production');
  assert.throws(() => testSettings({ ...settings, SICREDI_PIX_CLIENT_SECRET: '' }), /SICREDI_PIX_CLIENT_SECRET/);
});

test('test namespace and explicit decimal values protect ordinary sales references', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newTestTxid())); assert.equal(ids.size, 200);
  for (const id of ids) assert.equal(checkedTestTxid(id).length, 35);
  for (const id of [`ESP${'a'.repeat(32)}`, '', undefined, txid + '/pix']) assert.throws(() => checkedTestTxid(id), /TXID/);
  assert.equal(testAmount('1,00'), 100); assert.equal(testAmount('0.01'), 1);
  for (const value of ['0.00', '-1.00', '1', '1.234', '1e2', 'NaN', '1,000.00']) assert.throws(() => testAmount(value));
});

test('default connection diagnostics only authenticate read scopes and inspect webhook without logging secrets', async () => {
  const h = harness({ webhook: () => ({ webhookUrl: `${settings.SICREDI_PIX_WEBHOOK_URL}/${settings.SICREDI_PIX_WEBHOOK_TOKEN}` }) });
  const result = await runSicrediTest('conexao', {}, settings, h.deps);
  assert.equal(result.matchesConfigured, true); assert.equal(result.changedWebhook, false);
  assert.deepEqual(h.calls.map(row => row.name), ['authenticate', 'authenticate', 'authenticate', 'webhook', 'close']);
  assert.deepEqual(h.calls.filter(row => row.name === 'authenticate').map(row => row.args[0]), ['cob.read', 'pix.read', 'webhook.read']);
  const output = JSON.stringify([result, h.reports]);
  for (const value of [settings.SICREDI_PIX_CLIENT_SECRET, settings.SICREDI_PIX_CLIENT_ID, settings.SICREDI_PIX_RECEIVING_KEY, settings.SICREDI_PIX_WEBHOOK_TOKEN]) assert.ok(!output.includes(value));
});

test('certificate failure stops before client creation; certificate-only mode never contacts the bank', async () => {
  const h = harness(); let clients = 0;
  await runSicrediTest('certificado', {}, settings, { ...h.deps, createClient: () => { clients++; return h.api; } });
  assert.equal(clients, 0); assert.equal(h.calls.length, 0);
  await assert.rejects(runSicrediTest('conexao', {}, settings, { ...h.deps, certificate: async () => { throw new Error('test-only certificate failure'); } }));
  assert.equal(h.calls.length, 0);
});

test('creation reuses a known test charge, rejects value mismatch and never recreates after timeout', async () => {
  const existing = harness({ charge: () => charge() });
  assert.equal((await runSicrediTest('criar', { txid, valor: '1,00' }, settings, existing.deps)).reused, true);
  assert.ok(!existing.calls.some(row => row.name === 'create'));
  await assert.rejects(runSicrediTest('criar', { txid, valor: '2.00' }, settings, existing.deps), { code: 'TEST_CHARGE_MISMATCH' });
  const timeout = harness({ create: () => { throw Object.assign(new Error('not for output'), { code: 'SICREDI_TIMEOUT' }); } });
  await assert.rejects(runSicrediTest('criar', { txid, valor: '1.00' }, settings, timeout.deps), { code: 'SICREDI_TIMEOUT' });
  assert.equal(timeout.calls.filter(row => row.name === 'create').length, 1);
  assert.equal(timeout.reports.find(row => row.step === 'creating').txid, txid);
  assert.equal(timeout.calls.at(-1).name, 'close');
  const invalid = harness();
  await assert.rejects(runSicrediTest('criar', { txid: `ESP${'a'.repeat(32)}`, valor: '1.00' }, settings, invalid.deps), { code: 'TEST_TXID_INVALID' });
  assert.equal(invalid.calls.length, 0);
});

test('new charge uses only the operator value, namespace and bounded expiration', async () => {
  const h = harness({ create: () => charge() });
  const result = await runSicrediTest('criar', { txid, valor: '1.00', expiracao: '600' }, settings, h.deps);
  assert.equal(result.pixCopiaECola, 'PAYABLE-TEST-FIXTURE'); assert.equal(result.reused, false);
  assert.deepEqual(h.calls.find(row => row.name === 'create').args.slice(0, 3), [txid, 100, 600]);
});

test('runner integrates with the real Sicredi client protocol using a simulated transport only', async () => {
  const requests = []; let bankCharge = null, closed = 0;
  const transport = {
    close() { closed++; },
    async send(request) {
      const url = new URL(request.url); requests.push({ method: request.method, path: url.pathname });
      if (url.pathname === '/oauth/token') return { status: 200, data: { token_type: 'Bearer', access_token: 'only-test-token-not-a-real-credential', expires_in: 300 } };
      if (url.pathname === `/api/v2/cob/${txid}` && request.method === 'GET') return { status: bankCharge ? 200 : 404, data: bankCharge };
      if (url.pathname === `/api/v2/cob/${txid}` && request.method === 'PUT') {
        assert.deepEqual(request.body.valor, { original: '1.00', modalidadeAlteracao: 0 });
        assert.equal(request.body.chave, settings.SICREDI_PIX_RECEIVING_KEY);
        bankCharge = charge(); return { status: 201, data: bankCharge };
      }
      if (url.pathname === `/api/v2/pix/${e2e}` && request.method === 'GET') return { status: 200, data: receipt() };
      throw new Error('Unexpected simulated banking operation');
    },
  };
  const deps = { createClient: input => createSicrediClient(input, { transport }), certificate: async () => ({ validTo: 'test-only' }) };
  assert.equal((await runSicrediTest('criar', { txid, valor: '1.00' }, settings, deps)).status, 'ATIVA');
  bankCharge = charge({ status: 'CONCLUIDA', pix: [{ txid, endToEndId: e2e, valor: '1.00' }] });
  assert.equal((await runSicrediTest('consultar', { txid, valor: '1.00' }, settings, deps)).paymentConfirmed, true);
  assert.equal(requests.filter(request => request.method === 'PUT').length, 1);
  assert.equal(closed, 2);
  assert.ok(!requests.some(request => request.path.includes('devolucao') || request.path.includes('webhook')));
});

test('confirmation queries the independent Pix receipt and reports partial refunds without issuing anything', async () => {
  const paid = charge({ status: 'CONCLUIDA', pix: [{ txid, endToEndId: e2e, valor: '1.00' }] });
  const h = harness({ charge: () => paid, pix: () => receipt({ devolucoes: [{ id: 'fixture-refund', valor: '0.25', status: 'DEVOLVIDO' }] }) });
  const result = await inspectTestCharge(h.api, settings, txid, 100);
  assert.equal(result.paymentConfirmed, true); assert.equal(result.refundedCents, 25);
  assert.deepEqual(h.calls.map(row => row.name), ['charge', 'pix']);
  const mismatch = harness({ charge: () => paid, pix: () => receipt({ valor: '2.00' }) });
  await assert.rejects(inspectTestCharge(mismatch.api, settings, txid, 100), { code: 'TEST_RECEIPT_MISMATCH' });
});

test('bounded polling stops when confirmed and reports exhaustion instead of simulating payment', async () => {
  let reads = 0, sleeps = 0;
  const paid = charge({ status: 'CONCLUIDA', pix: [{ txid, endToEndId: e2e, valor: '1.00' }] });
  const h = harness({ charge: () => ++reads === 1 ? charge() : paid, pix: () => receipt() });
  const result = await runSicrediTest('acompanhar', { txid, valor: '1.00', tentativas: '5', intervalo: '1' }, settings, { ...h.deps, pause: async () => { sleeps++; } });
  assert.equal(result.paymentConfirmed, true); assert.equal(reads, 2); assert.equal(sleeps, 1);
  const pending = harness({ charge: () => charge() });
  const exhausted = await runSicrediTest('acompanhar', { txid, tentativas: '2', intervalo: '1' }, settings, pending.deps);
  assert.equal(exhausted.paymentConfirmed, false); assert.equal(exhausted.attemptsExhausted, true);
});

test('cancellation only removes unpaid test charges and never sends a refund', async () => {
  const paid = harness({ charge: () => charge({ status: 'CONCLUIDA' }) });
  await assert.rejects(runSicrediTest('cancelar', { txid }, settings, paid.deps), { code: 'TEST_ALREADY_PAID' });
  assert.ok(!paid.calls.some(row => row.name === 'cancel'));
  let cancelled = false;
  const pending = harness({ charge: () => charge({ status: cancelled ? 'REMOVIDA_PELO_USUARIO_RECEBEDOR' : 'ATIVA' }), cancel: () => { cancelled = true; } });
  assert.equal((await runSicrediTest('cancelar', { txid }, settings, pending.deps)).cancelled, true);
  assert.equal(pending.calls.filter(row => row.name === 'cancel').length, 1);
});

test('error reports never include raw banking responses, credentials or error stacks', () => {
  const secret = 'bank-credential-must-not-leak';
  assert.ok(!JSON.stringify(safeTestFailure(Object.assign(new Error(secret), { code: 'SICREDI_ACCESS_DENIED' }))).includes(secret));
  assert.ok(!JSON.stringify(safeTestFailure(Object.assign(new Error(secret), { code: secret }))).includes(secret));
});

test('help/reference commands run without app credentials or database; normal npm test does not perform live calls', () => {
  const file = fileURLToPath(new URL('../scripts/sicredi-tests.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [file, '--help'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(help.status, 0, help.stderr); assert.match(help.stdout, /conexao/);
  const reference = spawnSync(process.execPath, [file, 'referencia'], { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(reference.status, 0, reference.stderr); assert.equal(checkedTestTxid(reference.stdout.trim()).length, 35);
});
