import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, scryptSync } from 'node:crypto';
import { SignJWT, decodeJwt } from 'jose';
import { createAccessTokens } from '../src/lib/jwt.js';
import { bearerToken } from '../src/http/authorization.js';
import { verifyPassword, hashPassword } from '../src/lib/crypto.js';
import { refreshSchema, changePasswordSchema } from '../src/validators/index.js';
const secret = randomBytes(64).toString('hex');
const initial = new Date('2026-10-30T12:00:00Z');
const userId = randomUUID(), sessionId = randomUUID();
const settings = { secret, issuer: 'nacional-test', audience: 'app-test', ttlSeconds: 900 };

test('JWT access token is short lived, identifies the session and contains no role or private profile', async () => {
  const jwt = createAccessTokens({ ...settings, now: () => initial });
  const issued = await jwt.sign(userId, sessionId, new Date(initial.getTime() + 86400000));
  assert.equal(issued.expiresIn, 900);
  assert.deepEqual(await jwt.verify(issued.accessToken), { userId, sessionId });
  const claims = decodeJwt(issued.accessToken);
  assert.equal(claims.sid, sessionId);
  assert.equal(claims.iss, settings.issuer);
  assert.equal(claims.aud, settings.audience);
  assert.ok(!('role' in claims || 'email' in claims || 'passwordHash' in claims));
  assert.notEqual((await jwt.sign(userId, sessionId, new Date(initial.getTime() + 86400000))).accessToken, issued.accessToken);
});
test('JWT rejects expiration exactly at exp, tampering, other issuer, audience, algorithm and token type', async () => {
  const jwt = createAccessTokens({ ...settings, now: () => initial });
  const token = (await jwt.sign(userId, sessionId, new Date(initial.getTime() + 86400000))).accessToken;
  const expired = createAccessTokens({ ...settings, now: () => new Date(initial.getTime() + 900000) });
  await assert.rejects(expired.verify(token), { code: 'ACCESS_TOKEN_EXPIRED' });
  const segments = token.split('.');
  const badPayload = Buffer.from(JSON.stringify({ ...decodeJwt(token), sub: randomUUID() })).toString('base64url');
  await assert.rejects(jwt.verify(`${segments[0]}.${badPayload}.${segments[2]}`), { code: 'ACCESS_TOKEN_INVALID' });
  await assert.rejects(createAccessTokens({ ...settings, issuer: 'other', now: () => initial }).verify(token), { code: 'ACCESS_TOKEN_INVALID' });
  await assert.rejects(createAccessTokens({ ...settings, audience: 'other', now: () => initial }).verify(token), { code: 'ACCESS_TOKEN_INVALID' });
  const claims = decodeJwt(token);
  for (const header of [{ alg: 'HS512', typ: 'at+jwt' }, { alg: 'HS256', typ: 'JWT' }]) {
    const forgedType = await new SignJWT(claims).setProtectedHeader(header).sign(new TextEncoder().encode(secret));
    await assert.rejects(jwt.verify(forgedType), { code: 'ACCESS_TOKEN_INVALID' });
  }
  const noSignature = `${Buffer.from('{"alg":"none","typ":"at+jwt"}').toString('base64url')}.${segments[1]}.`;
  await assert.rejects(jwt.verify(noSignature), { code: 'ACCESS_TOKEN_INVALID' });
});
test('JWT validity never exceeds the absolute session lifetime; non-access secrets cannot authenticate', async () => {
  const jwt = createAccessTokens({ ...settings, now: () => initial });
  const token = await jwt.sign(userId, sessionId, new Date(initial.getTime() + 10000));
  assert.equal(token.expiresIn, 10);
  await assert.rejects(jwt.sign(userId, sessionId, initial), { code: 'SESSION_EXPIRED' });
  await assert.rejects(jwt.verify(randomBytes(32).toString('base64url')), { code: 'ACCESS_TOKEN_INVALID' });
  assert.throws(() => createAccessTokens({ ...settings, secret: 'short' }));
});
test('Bearer parser accepts signed JWT shape and rejects query-like, duplicate and oversized headers', () => {
  assert.equal(bearerToken('Bearer header.payload.signature'), 'header.payload.signature');
  assert.equal(bearerToken('bearer header.payload.signature'), 'header.payload.signature');
  for (const value of [undefined, 'Basic header.payload.signature', 'Bearer opaque', 'Bearer a.b.c, Bearer d.e.f', 'Bearer a.b.c ', `Bearer ${'a'.repeat(5000)}.b.c`]) assert.equal(bearerToken(value), undefined);
});
test('password verifier accepts existing hashes and validates new scrypt-v2 encodings strictly', async () => {
  const salt = randomBytes(16).toString('hex');
  const legacy = `scrypt:${salt}:${scryptSync('ExistingPassword123', salt, 64).toString('hex')}`;
  assert.equal(await verifyPassword('ExistingPassword123', legacy), true);
  const modern = await hashPassword('ModernPassword123');
  assert.ok(modern.startsWith('scrypt-v2:'));
  assert.equal(await verifyPassword('ModernPassword123', modern), true);
  assert.equal(await verifyPassword('ModernPassword123', `${modern}:extra`), false);
  assert.equal(await verifyPassword('ModernPassword123', 'scrypt-v2:bad:hash'), false);
});
test('refresh and password bodies reject extra administrative fields and malformed secrets', () => {
  assert.equal(refreshSchema.safeParse({ refreshToken: randomBytes(32).toString('base64url') }).success, true);
  assert.equal(refreshSchema.safeParse({ refreshToken: 'header.payload.signature' }).success, false);
  assert.equal(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'NewPassword123', role: 'ADMIN' }).success, false);
});
