import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../lib/errors.js';
import { isActiveMember } from '../lib/serializers.js';
export const cardVersion = user => createHash('sha256').update(JSON.stringify([user.membership?.id, user.membership?.planId, user.membership?.status, user.membership?.validUntil, user.membership?.lastOrderId])).digest('base64url');
export function issueMembershipCard(user, secret, now = Date.now()) {
  if (!user.active || !isActiveMember(user, new Date(now))) throw new AppError(403, 'MEMBERSHIP_INACTIVE', 'Sua associação não está ativa. Confira seu plano.');
  const exp = Math.min(now + 30000, new Date(user.membership.validUntil).getTime());
  const payload = Buffer.from(JSON.stringify({ sub: user.id, purpose: 'membership-v2', iat: now, exp, version: cardVersion(user) })).toString('base64url');
  return { token: `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`, expiresAt: new Date(exp).toISOString(), issuedAt: new Date(now).toISOString(), serverTime: new Date(now).toISOString() };
}
export async function verifyMembershipCard(db, secret, actor, token, now = Date.now()) {
  if (!actor.active || !['ADMIN','GATE','CASHIER'].includes(actor.role)) throw new AppError(403, 'CARD_VERIFY_DENIED', 'A consulta exige uma conta autorizada do clube.');
  const invalid = () => new AppError(403, 'CARD_INVALID', 'Carteirinha inválida, vencida ou desativada. Peça ao sócio para atualizar o QR.');
  let claims;
  try {
    const [payload, sig, extra] = token.split('.');
    if (extra || !/^[A-Za-z0-9_-]{43}$/.test(sig || '')) throw invalid();
    const expected = createHmac('sha256', secret).update(payload).digest();
    const actual = Buffer.from(sig, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
    claims = JSON.parse(Buffer.from(payload, 'base64url'));
    if (claims.purpose !== 'membership-v2' || !/^[a-f0-9-]{36}$/i.test(claims.sub) || !Number.isFinite(claims.iat) || !Number.isFinite(claims.exp) || claims.iat > now || claims.exp <= now || claims.exp - claims.iat > 30000) throw invalid();
  } catch { throw invalid(); }
  const user = await db.user.findUnique({ where: { id: claims.sub }, include: { membership: { include: { plan: true } } } });
  if (!user?.active || !isActiveMember(user, new Date(now)) || cardVersion(user) !== claims.version) throw invalid();
  return { valid: true, name: user.name, memberId: user.membership.memberId, plan: user.membership.plan.name, validUntil: user.membership.validUntil, checkedAt: new Date(now).toISOString() };
}
