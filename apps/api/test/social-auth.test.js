import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { createSocialAuth, socialHash, validateSocialClaims, socialStartSchema } from '../src/services/social-auth-core.js';
import { createSocialAuthModel } from '../src/models/social-auth.model.js';
import { createAuthService } from '../src/services/auth-core.js';
import { createApp } from '../src/http/app.js';
import { inject } from './helpers/inject.js';

const settings = { publicApiUrl: 'https://api.example.test', google: { clientId: 'google-client', clientSecret: 'private-google-secret' }, apple: { clientId: 'apple-service', clientSecret: 'private-apple-secret' } };
const verifier = 'v'.repeat(64), challenge = socialHash(verifier);
const silent = { info() {}, error() {} };

test('social auth requires configured providers and verified email/nonce, rejects custom redirects', async () => {
  const disabled = createSocialAuth({ store: { create() { assert.fail('Disabled provider cannot touch DB'); } }, settings: {} });
  assert.deepEqual(disabled.providers(), { google: false, apple: false });
  await assert.rejects(disabled.start({ provider: 'google', challenge }), { code: 'SOCIAL_NOT_CONFIGURED' });
  assert.equal(socialStartSchema.safeParse({ provider: 'google', challenge, redirect: 'https://attacker.test' }).success, false);
  const claims = { sub: 'subject', email: 'TEST@example.test', email_verified: true, nonce: 'expected' };
  assert.equal(validateSocialClaims(claims, 'expected').email, 'test@example.test');
  for (const invalid of [{ ...claims, nonce: 'other' }, { ...claims, email_verified: false }, { ...claims, email: undefined }, { ...claims, sub: '' }]) assert.throws(() => validateSocialClaims(invalid, 'expected'), { code: 'SOCIAL_IDENTITY_INVALID' });
});

test('Google and Apple code flow validates signed ID tokens, state, issuer, audience and nonce before issuing a short ticket', async () => {
  const keys = await generateKeyPair('RS256');
  for (const provider of ['google', 'apple']) {
    for (const scenario of ['valid', 'wrong-nonce', 'wrong-audience', 'wrong-issuer', 'expired', 'bad-signature', 'canceled', 'bank-error']) {
      let attempt, completed, networkCalls = 0;
      const store = {
        create: async data => (attempt = { id: randomUUID(), ...data }),
        claim: async (name, hash) => { if (attempt.claimed || name !== attempt.provider || hash !== attempt.stateHash) return null; attempt.claimed = true; return attempt; },
        complete: async (id, data) => { assert.equal(id, attempt.id); completed = data; },
      };
      const service = createSocialAuth({ store, settings,
        fetcher: async (url, options) => {
          networkCalls++;
          assert.equal(options.redirect, 'error');
          assert.ok(options.signal);
          assert.equal(options.body.get('client_secret'), settings[provider].clientSecret);
          assert.equal(options.body.get('redirect_uri'), `https://api.example.test/v1/auth/social/${provider}/callback`);
          assert.equal(options.body.get('code_verifier'), provider === 'google' ? attempt.providerVerifier : null);
          if (scenario === 'bank-error') throw new Error('Provider raw secret must not escape');
          let token = await new SignJWT({ sub: 'provider-subject', email: 'fan@example.test', email_verified: 'true', nonce: scenario === 'wrong-nonce' ? 'different' : attempt.nonce })
            .setProtectedHeader({ alg: 'RS256' }).setIssuedAt().setExpirationTime(scenario === 'expired' ? Math.floor(Date.now() / 1000) - 100 : '5m')
            .setIssuer(scenario === 'wrong-issuer' ? 'https://evil.test' : provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com')
            .setAudience(scenario === 'wrong-audience' ? 'another-app' : settings[provider].clientId).sign(keys.privateKey);
          if (scenario === 'bad-signature') { const parts = token.split('.'); parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1); token = parts.join('.'); }
          return Response.json({ id_token: token, access_token: 'must-not-persist' });
        }, verify: (token, name, options) => jwtVerify(token, keys.publicKey, options),
      });
      const start = await service.start({ provider, challenge });
      const auth = new URL(start.authorizationUrl), state = auth.searchParams.get('state');
      assert.equal(socialHash(state), attempt.stateHash);
      assert.equal(auth.searchParams.get('client_secret'), null);
      assert.equal(auth.searchParams.get('nonce'), attempt.nonce);
      if (provider === 'google') assert.equal(auth.searchParams.get('code_challenge'), socialHash(attempt.providerVerifier));
      else assert.equal(auth.searchParams.get('response_mode'), 'form_post');
      await assert.rejects(service.callback(provider, { state: 'x'.repeat(43), code: 'unused' }), { code: 'SOCIAL_STATE_EXPIRED' });
      const returned = new URL(await service.callback(provider, { state, code: 'one-use-code', ...(scenario === 'canceled' ? { error: 'access_denied' } : {}) }));
      assert.equal(returned.origin, 'null'); assert.equal(returned.protocol, 'nacional:');
      assert.equal(returned.searchParams.get('attempt'), start.attempt);
      if (scenario === 'valid') {
        assert.equal(socialHash(returned.searchParams.get('ticket')), completed.ticketHash);
        assert.equal(completed.profile.email, 'fan@example.test');
        assert.ok(completed.expiresAt - new Date() <= 60000);
        assert.doesNotMatch(JSON.stringify(completed), /must-not-persist|private-google|private-apple|id_token/);
      } else {
        assert.equal(completed, undefined);
        assert.equal(returned.searchParams.get('error'), scenario === 'canceled' ? 'canceled' : 'failed');
      }
      assert.equal(networkCalls, scenario === 'canceled' ? 0 : 1);
      await assert.rejects(service.callback(provider, { state, code: 'replay' }), { code: 'SOCIAL_STATE_EXPIRED' });
    }
  }
});

test('Apple form POST exception is restricted to its exact callback and does not weaken other CORS/body contracts', async () => {
  let received;
  const routes = [
    { method: 'POST', path: '/v1/auth/social/:provider/callback', formBody: true, binary: true, handler: async ({ body }) => { received = body; return { status: 303, headers: { Location: 'nacional://auth/social?error=canceled' }, body: '' }; } },
    { method: 'POST', path: '/v1/auth/login', handler: async () => ({ data: {} }) },
  ];
  const app = createApp({ routes, logger: silent });
  const headers = { origin: 'https://appleid.apple.com', 'content-type': 'application/x-www-form-urlencoded' };
  const result = await inject(app, '/v1/auth/social/apple/callback', { method: 'POST', headers, body: 'state=test&code=once' });
  assert.equal(result.status, 303); assert.equal(received.code, 'once'); assert.equal(result.headers.get('access-control-allow-origin'), null);
  for (const path of ['/v1/auth/login', '/v1/auth/social/google/callback']) assert.equal((await inject(app, path, { method: 'POST', headers, body: 'state=test' })).status, 403);
  assert.equal((await inject(app, '/v1/auth/social/apple/callback', { method: 'POST', headers: { ...headers, origin: 'https://evil.test' }, body: 'state=test' })).status, 403);
  assert.equal((await inject(app, '/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'x=y' })).status, 415);
});

test('social migration and atomic redemption preserve existing accounts and allow only active supporters with single-use proofs', { timeout: 120000 }, async t => {
  const pg = await PGlite.create();
  const migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const folder of (await readdir(migrations, { withFileTypes: true })).filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) await pg.exec(await readFile(new URL(`${folder.name}/migration.sql`, migrations), 'utf8'));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 }); await socket.start();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  const store = createSocialAuthModel(db), instant = new Date();
  const service = await createAuthService({ users: {}, sessions: {}, socialSessions: store, accessTokens: { sign: async () => ({ accessToken: 'signed-local-fixture' }) } });
  async function ticket(profile, provider = 'google', changes = {}) {
    const row = await store.create({ provider, stateHash: randomUUID(), nonce: 'nonce', providerVerifier: 'server-proof', challenge, expiresAt: new Date(Date.now() + 600000) });
    assert.equal((await store.claim(provider, row.stateHash, instant)).id, row.id);
    assert.equal(await store.claim(provider, row.stateHash, instant), null);
    const ticketHash = randomUUID();
    await store.complete(row.id, { profile, ticketHash, expiresAt: new Date(Date.now() + 60000), ...changes });
    return { ticketHash, challenge };
  }
  const profile = { subject: 'subject-1', email: 'new@example.test', name: 'New Fan' };
  const proof = await ticket(profile);
  await assert.rejects(service.socialLogin({ ...proof, challenge: 'wrong' }), { code: 'SOCIAL_TICKET_INVALID' });
  const outcomes = await Promise.allSettled([service.socialLogin(proof), service.socialLogin(proof)]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  const first = outcomes.find(x => x.status === 'fulfilled').value;
  assert.equal(first.member.role, 'USER'); assert.equal(first.member.email, profile.email);
  assert.equal(await db.user.count(), 1); assert.equal(await db.session.count(), 1); assert.equal(await db.refreshToken.count(), 1);
  const stored = await db.user.findUnique({ where: { email: profile.email } });
  assert.ok(stored.passwordHash.length > 60);
  assert.equal((await service.socialLogin(await ticket({ ...profile, email: 'provider-changed@example.test' }))).member.id, first.member.id);
  assert.equal(await db.user.count(), 1, 'subject, not current provider email, identifies existing account');
  const existing = await db.user.create({ data: { name: 'Admin', email: 'existing@example.test', passwordHash: 'keep', role: 'ADMIN' } });
  await assert.rejects(service.socialLogin(await ticket({ subject: 'attacker', email: existing.email, name: 'Other' })), { code: 'SOCIAL_EMAIL_EXISTS' });
  assert.equal((await db.user.findUnique({ where: { id: existing.id } })).passwordHash, 'keep');
  assert.equal(await db.socialIdentity.count(), 1);
  await assert.rejects(service.socialLogin(await ticket(profile, 'apple')), { code: 'SOCIAL_EMAIL_EXISTS' });
  await assert.rejects(service.socialLogin(await ticket(profile, 'google', { expiresAt: new Date(Date.now() - 1000) })), { code: 'SOCIAL_TICKET_INVALID' });
  for (const changes of [{ active: false }, { active: true, role: 'ADMIN' }, { role: 'GATE' }, { role: 'CASHIER' }]) {
    await db.user.update({ where: { id: stored.id }, data: changes });
    await assert.rejects(service.socialLogin(await ticket(profile)), { code: 'SOCIAL_ACCOUNT_DENIED' });
  }
});
