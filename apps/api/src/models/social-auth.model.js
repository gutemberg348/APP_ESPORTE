import { db } from '../config/database.js';
import { serializable } from '../lib/business-rules.js';
import { AppError } from '../lib/errors.js';
import { authUserInclude } from './auth.model.js';
export function createSocialAuthModel(client = db) {
  return {
    async create(data) {
      await client.socialAuthAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      return client.socialAuthAttempt.create({ data });
    },
    claim: (provider, stateHash, now) => serializable(client, async tx => {
      const attempt = await tx.socialAuthAttempt.findUnique({ where: { stateHash } });
      if (!attempt || attempt.provider !== provider || attempt.claimedAt || attempt.expiresAt <= now) return null;
      const won = await tx.socialAuthAttempt.updateMany({ where: { id: attempt.id, claimedAt: null }, data: { claimedAt: now } });
      return won.count ? attempt : null;
    }),
    complete: (id, data) => client.socialAuthAttempt.update({ where: { id }, data: { ...data, nonce: '', providerVerifier: '' } }),
    redeem: ({ ticketHash, challenge, passwordHash, session, now }) => serializable(client, async tx => {
      const attempt = await tx.socialAuthAttempt.findUnique({ where: { ticketHash } });
      if (!attempt || !attempt.profile || attempt.challenge !== challenge || attempt.expiresAt <= now) throw new AppError(401, 'SOCIAL_TICKET_INVALID', 'O login expirou. Tente novamente.');
      await tx.socialAuthAttempt.delete({ where: { id: attempt.id } });
      const profile = attempt.profile;
      const identity = await tx.socialIdentity.findUnique({ where: { provider_subject: { provider: attempt.provider, subject: profile.subject } } });
      let user = identity ? await tx.user.findUnique({ where: { id: identity.userId }, include: authUserInclude }) : null;
      if (!identity) {
        // Never auto-link an existing password/staff account merely by matching email.
        if (await tx.user.findUnique({ where: { email: profile.email } })) throw new AppError(409, 'SOCIAL_EMAIL_EXISTS', 'Este e-mail já possui uma conta. Entre com sua senha ou use Esqueci minha senha.');
        user = await tx.user.create({ data: { name: profile.name, email: profile.email, passwordHash, role: 'USER' }, include: authUserInclude });
        await tx.socialIdentity.create({ data: { provider: attempt.provider, subject: profile.subject, userId: user.id } });
      }
      if (!user?.active || user.role !== 'USER') throw new AppError(403, 'SOCIAL_ACCOUNT_DENIED', 'Utilize o acesso por e-mail da sua conta ou fale com o suporte.');
      const stored = await tx.session.create({ data: { ...session, userId: user.id, refreshTokens: { create: { tokenHash: session.tokenHash, expiresAt: session.expiresAt } } } });
      return { user, session: stored };
    }),
  };
}
export const socialAuthModel = createSocialAuthModel();
