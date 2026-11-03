import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const newSessionToken = () => randomBytes(32).toString('base64url');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, scryptOptions);
  return `scrypt-v2:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string' || typeof password !== 'string' || password.length > 128) return false;
  const [algorithm, salt, hash, extra] = encoded.split(':');
  if (!['scrypt', 'scrypt-v2'].includes(algorithm) || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(hash ?? '') || extra !== undefined) return false;
  const actual = await scrypt(password, salt, 64, algorithm === 'scrypt-v2' ? scryptOptions : {});
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function createCardToken(userId, secret, now = Date.now()) {
  const expiresAt = (Math.floor(now / 30000) + 1) * 30000;
  const payload = Buffer.from(JSON.stringify({ sub: userId, purpose: 'membership', exp: expiresAt })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString() };
}
