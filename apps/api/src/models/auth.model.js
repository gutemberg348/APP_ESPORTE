import { db } from '../config/database.js';
import { serializable } from '../lib/business-rules.js';
export const authUserInclude = { membership: { include: { plan: true } } };

export function createAuthModel(client = db) {
  return {
    async register(data, session) {
      return serializable(client, async (tx) => {
        const user = await tx.user.create({ data, include: authUserInclude });
        const stored = await tx.session.create({ data: { ...session, userId: user.id, refreshTokens: { create: { tokenHash: session.tokenHash, expiresAt: session.expiresAt } } } });
        return { user, session: stored };
      });
    },
    async start(userId, expectedPasswordHash, session) {
      return serializable(client, async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId }, include: authUserInclude });
        if (!user?.active || user.passwordHash !== expectedPasswordHash) return null;
        const stored = await tx.session.create({ data: { ...session, userId, refreshTokens: { create: { tokenHash: session.tokenHash, expiresAt: session.expiresAt } } } });
        return { user, session: stored };
      });
    },
    session: (id) => client.session.findUnique({ where: { id }, include: { user: { include: authUserInclude } } }),
    rotate(tokenHash, replacementHash, now) {
      return serializable(client, async (tx) => {
        const entry = await tx.refreshToken.findUnique({ where: { tokenHash }, include: { session: { include: { user: { include: authUserInclude } } } } });
        if (!entry) return { status: 'invalid' };
        const session = entry.session;
        if (session.revokedAt || session.expiresAt <= now || entry.expiresAt <= now || !session.user.active) return { status: 'invalid' };
        if (entry.usedAt || session.tokenHash !== tokenHash) {
          // Commit revocation before the service throws the rejection.
          await tx.session.update({ where: { id: session.id }, data: { revokedAt: now } });
          return { status: 'reused' };
        }
        const consumed = await tx.refreshToken.updateMany({ where: { id: entry.id, usedAt: null }, data: { usedAt: now } });
        if (!consumed.count) {
          await tx.session.update({ where: { id: session.id }, data: { revokedAt: now } });
          return { status: 'reused' };
        }
        const updated = await tx.session.update({ where: { id: session.id }, data: { tokenHash: replacementHash, lastUsedAt: now } });
        await tx.refreshToken.create({ data: { tokenHash: replacementHash, sessionId: session.id, expiresAt: session.expiresAt } });
        return { status: 'rotated', user: session.user, session: updated };
      });
    },
    revoke: (id, now) => client.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } }),
    revokeAll: (userId, now) => client.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    sessions: (userId, now) => client.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: now } }, select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
    changePassword(userId, expectedHash, passwordHash, now) {
      return serializable(client, async (tx) => {
        const updated = await tx.user.updateMany({ where: { id: userId, active: true, passwordHash: expectedHash }, data: { passwordHash } });
        if (!updated.count) return false;
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
        return true;
      });
    },
  };
}
export const authModel = createAuthModel();
