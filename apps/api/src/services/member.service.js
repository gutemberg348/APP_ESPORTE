import { userModel } from '../models/user.model.js';
import { clubModel } from '../models/club.model.js';
import { toMember, isActiveMember } from '../lib/serializers.js';
import { createCardToken } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { env } from '../config/env.js';
import { engagementService } from './engagement.service.js';
export const memberService = {
  profile: (user) => toMember(user),
  async update(user, data) { return toMember(await userModel.update(user.id, data)); },
  async preferences(user, preferences) { return toMember(await userModel.update(user.id, { preferences })); },
  async school(user, interested) { return toMember(await userModel.update(user.id, { schoolInterested: interested })); },
  card(user) {
    if (!isActiveMember(user)) throw new AppError(403, 'MEMBERSHIP_INACTIVE', 'A carteirinha exige uma associação ativa.');
    return createCardToken(user.id, env.CARD_TOKEN_SECRET);
  },
  async dashboard(user) {
    const [matches, partners, tickets, engagement, predictions] = await Promise.all([clubModel.matches(), clubModel.partners(), clubModel.tickets(user.id), engagementService.summary(user), clubModel.predictions(user.id)]);
    return { member: toMember(user), nextMatch: matches[0] || null, matches, partners, tickets, engagement, predictions };
  },
};
