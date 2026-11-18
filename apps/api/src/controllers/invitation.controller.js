import { z } from 'zod';
import { submitBusinessInvitation } from '../models/friend-invitation.js';
import { referralSchema } from '../validators/index.js';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
export const invitationController = {
  link: async ({ user, url: requestUrl }) => {
    if (user.role !== 'USER') throw new AppError(403, 'INVITATION_SUPPORTER_ONLY', 'Entre com sua conta de torcedor para enviar convites.');
    const url = new URL(env.INVITATION_PUBLIC_URL);
    const kind = z.enum(['business', 'friend']).parse(requestUrl.searchParams.get('kind') || 'friend');
    if (kind === 'business') url.pathname = '/app/parceiro';
    url.searchParams.set('ref', user.referralCode);
    return { data: { url: url.toString(), registrations: kind === 'business' ? await db.referral.count({ where: { userId: user.id, kind: 'BUSINESS' } }) : await db.user.count({ where: { referredById: user.id } }) } };
  },
  submitBusiness: async ({ body }) => {
    const input = referralSchema.pick({ name: true }).extend({
      code: z.uuid(),
      contact: z.union([z.string().trim().toLowerCase().email().max(254), z.string().trim().regex(/^[\d()+ -]+$/)
        .transform(value => value.replace(/\D/g, '')).pipe(z.string().regex(/^(?:55)?\d{10,11}$/, 'Informe um telefone com DDD.'))]),
    }).strict().parse(body);
    await submitBusinessInvitation(db, input);
    return { status: 204 };
  },
};
