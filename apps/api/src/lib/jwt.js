import { randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from './errors.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createAccessTokens({ secret, issuer, audience, ttlSeconds = 900, now = () => new Date() }) {
  if (Buffer.byteLength(secret, 'utf8') < 64) throw new Error('O segredo JWT deve ter pelo menos 64 bytes.');
  const key = new TextEncoder().encode(secret);
  return {
    async sign(userId, sessionId, sessionExpiresAt) {
      const issuedAt = Math.floor(now().getTime() / 1000);
      const expiresAt = Math.min(issuedAt + ttlSeconds, Math.floor(sessionExpiresAt.getTime() / 1000));
      if (!uuid.test(userId) || !uuid.test(sessionId) || expiresAt <= issuedAt) throw new AppError(401, 'SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
      const token = await new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
        .setIssuer(issuer).setAudience(audience).setSubject(userId)
        .setJti(randomUUID()).setIssuedAt(issuedAt).setExpirationTime(expiresAt).sign(key);
      return { accessToken: token, accessTokenExpiresAt: new Date(expiresAt * 1000).toISOString(), expiresIn: expiresAt - issuedAt };
    },
    async verify(token) {
      if (typeof token !== 'string' || token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new AppError(401, 'ACCESS_TOKEN_INVALID', 'Token de acesso inválido. Entre novamente.');
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'], issuer, audience, typ: 'at+jwt', currentDate: now(), clockTolerance: 0,
          requiredClaims: ['sub', 'sid', 'jti', 'iat', 'exp'], maxTokenAge: ttlSeconds,
        });
        if (!uuid.test(payload.sub) || typeof payload.sid !== 'string' || !uuid.test(payload.sid) || typeof payload.jti !== 'string' || !uuid.test(payload.jti) || payload.exp <= payload.iat || payload.exp - payload.iat > ttlSeconds) throw new Error('Invalid access claims');
        return { userId: payload.sub, sessionId: payload.sid };
      } catch (error) {
        if (error.code === 'ERR_JWT_EXPIRED') throw new AppError(401, 'ACCESS_TOKEN_EXPIRED', 'O token de acesso expirou. Renove sua sessão.');
        throw new AppError(401, 'ACCESS_TOKEN_INVALID', 'Token de acesso inválido. Entre novamente.');
      }
    },
  };
}
