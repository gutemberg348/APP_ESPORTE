import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, hashToken, newSessionToken } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { toMember } from '../lib/serializers.js';

export async function createAuthService({ users, sessions, accessTokens, ttlDays = 7, now = () => new Date() }) {
  const dummyHash = await hashPassword('timing-only-password-not-an-account');
  const invalidLogin = () => new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
  function newSession() {
    const refreshToken = newSessionToken();
    return { refreshToken, session: { id: randomUUID(), tokenHash: hashToken(refreshToken), expiresAt: new Date(now().getTime() + ttlDays * 86400000), lastUsedAt: now() } };
  }
  async function credentials(user, session, refreshToken) {
    const access = await accessTokens.sign(user.id, session.id, session.expiresAt);
    return { ...access, refreshToken, refreshTokenExpiresAt: session.expiresAt.toISOString(), tokenType: 'Bearer', member: toMember(user) };
  }
  return {
    async register({ name, email, password }) {
      if (await users.byEmail(email)) throw new AppError(409, 'EMAIL_IN_USE', 'Este e-mail já está cadastrado.');
      const fresh = newSession();
      let result;
      try { result = await sessions.register({ name, email, passwordHash: await hashPassword(password) }, fresh.session); }
      catch (error) { if (error.code === 'P2002') throw new AppError(409, 'EMAIL_IN_USE', 'Este e-mail já está cadastrado.'); throw error; }
      return credentials(result.user, result.session, fresh.refreshToken);
    },
    async login({ email, password, portal = 'APP' }) {
      const user = await users.byEmail(email);
      const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);
      if (!user || !valid || !user.active) throw invalidLogin();
      if (portal === 'GATE' && !['GATE', 'ADMIN'].includes(user.role)) throw invalidLogin();
      const fresh = newSession();
      const result = await sessions.start(user.id, user.passwordHash, fresh.session);
      if (!result) throw invalidLogin();
      return credentials(result.user, result.session, fresh.refreshToken);
    },
    async refresh(refreshToken) {
      if (typeof refreshToken !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Entre novamente para continuar.');
      const replacement = newSessionToken();
      const result = await sessions.rotate(hashToken(refreshToken), hashToken(replacement), now());
      if (result.status !== 'rotated') throw new AppError(401, result.status === 'reused' ? 'REFRESH_TOKEN_REUSED' : 'REFRESH_TOKEN_INVALID', 'Sua sessão não está mais disponível. Entre novamente.');
      return credentials(result.user, result.session, replacement);
    },
    async authenticate(token) {
      const claims = await accessTokens.verify(token);
      const session = await sessions.session(claims.sessionId);
      if (!session || session.userId !== claims.userId || session.revokedAt || session.expiresAt <= now() || !session.user.active) throw new AppError(401, 'SESSION_REVOKED', 'Sua sessão foi encerrada. Entre novamente.');
      return { user: session.user, sessionId: session.id };
    },
    logout: (sessionId) => sessions.revoke(sessionId, now()),
    logoutAll: (user) => sessions.revokeAll(user.id, now()),
    async listSessions(user, sessionId) { return (await sessions.sessions(user.id, now())).map((session) => ({ ...session, current: session.id === sessionId })); },
    async changePassword(user, { currentPassword, newPassword }) {
      if (!await verifyPassword(currentPassword, user.passwordHash)) throw new AppError(401, 'INVALID_CURRENT_PASSWORD', 'A senha atual está incorreta.');
      if (await verifyPassword(newPassword, user.passwordHash)) throw new AppError(422, 'PASSWORD_UNCHANGED', 'Escolha uma senha diferente da atual.');
      if (!await sessions.changePassword(user.id, user.passwordHash, await hashPassword(newPassword), now())) throw new AppError(409, 'PASSWORD_CHANGED', 'A conta foi alterada. Entre novamente.');
    },
  };
}
