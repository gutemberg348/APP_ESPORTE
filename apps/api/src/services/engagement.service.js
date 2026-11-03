import { engagementModel } from '../models/engagement.model.js';
import { clubDay } from '../lib/business-rules.js';
export const engagementService = {
  async summary(user) {
    const day = clubDay();
    const [entry, ledger, rewards, redemptions, ranking] = await Promise.all([
      engagementModel.checkedIn(user.id, day), engagementModel.points(user.id),
      engagementModel.rewards(), engagementModel.redemptions(user.id), engagementModel.ranking(),
    ]);
    return {
      checkedIn: Boolean(entry), day, ledger, rewards, redemptions,
      ranking: ranking.map((row) => ({
        name: row.id === user.id ? `${row.name.split(' ')[0]} · você` : row.name.split(' ').map((part, index) => index === 0 ? part : `${part[0]}.`).slice(0, 2).join(' '),
        points: row.points, you: row.id === user.id,
      })),
    };
  },
  ledger: (user, { limit, offset }) => engagementModel.points(user.id, limit, offset),
  checkIn: (user) => engagementModel.checkIn(user.id, clubDay()),
  redeem: (user, rewardId) => engagementModel.redeem(user.id, rewardId),
};
