import { AppError } from '../lib/errors.js';
import { serializable } from '../lib/business-rules.js';

// Only a new account can be attributed. No rewards or financial credits are issued here.
export async function invitationOwner(tx, code) {
  if (!code) return undefined;
  const owner = await tx.user.findUnique({ where: { referralCode: code }, select: { id: true, role: true, active: true } });
  return owner?.active && owner.role === 'USER' ? owner.id : undefined;
}

export function submitBusinessInvitation(client, { code, name, contact }) {
  return serializable(client, async tx => {
    const owner = await invitationOwner(tx, code);
    if (!owner) throw new AppError(404, 'INVALID_BUSINESS_INVITATION', 'Este convite comercial está indisponível.');
    const data = { userId: owner, kind: 'BUSINESS', name, contact };
    if (!await tx.referral.findFirst({ where: data, select: { id: true } })) await tx.referral.create({ data });
  });
}
