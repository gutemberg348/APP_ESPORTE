import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { hashPassword, verifyPassword, createCardToken, hashToken, newSessionToken } from '../src/lib/crypto.js';
import { createRateLimiter } from '../src/http/rate-limit.js';
import { predictionSchema, registerSchema, profileSchema } from '../src/validators/index.js';

test('senhas usam salt exclusivo e rejeitam credenciais incorretas', async () => {
  const first = await hashPassword('SenhaTeste123!');
  const second = await hashPassword('SenhaTeste123!');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('SenhaTeste123!', first), true);
  assert.equal(await verifyPassword('outraSenha', first), false);
  assert.equal(await verifyPassword('SenhaTeste123!', 'malformed'), false);
});
test('tokens da carteira são assinados e expiram no próximo intervalo de 30 segundos', () => {
  const secret = 'secret-for-test-card';
  const token = createCardToken('user-123', secret, 31000);
  const [payload, signature] = token.token.split('.');
  assert.equal(signature, createHmac('sha256', secret).update(payload).digest('base64url'));
  assert.deepEqual(JSON.parse(Buffer.from(payload, 'base64url')), { sub: 'user-123', purpose: 'membership', exp: 60000 });
  assert.equal(token.expiresAt, new Date(60000).toISOString());
  assert.notEqual(createCardToken('user-123', secret, 60000).token, token.token);
  assert.notEqual(createCardToken('another-user', secret, 31000).token, token.token);
});
test('sessões usam tokens aleatórios e hashes distintos do segredo', () => {
  const token = newSessionToken();
  assert.notEqual(token, newSessionToken());
  assert.equal(hashToken(token).length, 64);
  assert.notEqual(hashToken(token), token);
});
test('limite de requisições é isolado por cliente e renova após a janela', () => {
  const limit = createRateLimiter({ max: 2, windowMs: 1000 });
  assert.equal(limit('a', 0), true);
  assert.equal(limit('a', 1), true);
  assert.equal(limit('a', 2), false);
  assert.equal(limit('b', 2), true);
  assert.equal(limit('a', 1000), true);
});
test('validadores normalizam e-mail, bloqueiam campos administrativos e placares inválidos', () => {
  assert.equal(registerSchema.parse({ name: 'Rafael', email: ' RAFAEL@EXAMPLE.COM ', password: 'SenhaValida123' }).email, 'rafael@example.com');
  assert.equal(profileSchema.safeParse({ name: 'Rafael', points: 99999 }).success, false);
  assert.equal(predictionSchema.safeParse({ matchId: '6bcae09b-1af7-4566-8b13-b4cb432b5d0a', homeScore: -1, awayScore: 0 }).success, false);
  assert.equal(predictionSchema.safeParse({ matchId: '6bcae09b-1af7-4566-8b13-b4cb432b5d0a', homeScore: 1.5, awayScore: 0 }).success, false);
});
