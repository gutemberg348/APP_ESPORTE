import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
export const invitationController = {
  link: async ({ user }) => {
    if (user.role !== 'USER') throw new AppError(403, 'INVITATION_SUPPORTER_ONLY', 'Entre com sua conta de torcedor para indicar amigos.');
    const url = new URL(env.INVITATION_PUBLIC_URL);
    url.searchParams.set('ref', user.referralCode);
    return { data: { url: url.toString(), registrations: await db.user.count({ where: { referredById: user.id } }) } };
  },
};
