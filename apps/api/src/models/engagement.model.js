import { db } from '../config/database.js';
import { AppError } from '../lib/errors.js';
import { serializable } from '../lib/business-rules.js';

export const engagementModel = {
  points: (userId, take = 50, skip = 0) => db.pointEntry.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take, skip }),
  checkedIn: (userId, day) => db.pointEntry.findUnique({ where: { userId_sourceKey: { userId, sourceKey: `checkin:${day}` } } }),
  rewards: () => db.reward.findMany({ where: { active: true }, orderBy: { cost: 'asc' }, take: 100 }),
  redemptions: (userId) => db.redemption.findMany({ where: { userId }, include: { reward: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ranking: () => db.user.findMany({ where: { preferences: { path: ['ranking'], equals: true } }, select: { id: true, name: true, points: true }, orderBy: [{ points: 'desc' }, { id: 'asc' }], take: 20 }),
  async checkIn(userId, day) {
    return serializable(db, async (tx) => {
      const prior = await tx.pointEntry.findUnique({ where: { userId_sourceKey: { userId, sourceKey: `checkin:${day}` } } });
      if (prior) throw new AppError(409, 'ALREADY_CHECKED_IN', 'Você já fez o check-in de hoje.');
      const entry = await tx.pointEntry.create({ data: { userId, sourceKey: `checkin:${day}`, amount: 30, reason: 'Check-in diário' } });
      const user = await tx.user.update({ where: { id: userId }, data: { points: { increment: 30 } }, select: { points: true } });
      return { entry, points: user.points };
    });
  },
  async redeem(userId, rewardId) {
    return serializable(db, async (tx) => {
      const reward = await tx.reward.findUnique({ where: { id: rewardId } });
      if (!reward?.active) throw new AppError(404, 'REWARD_NOT_FOUND', 'Experiência indisponível.');
      if (await tx.redemption.findUnique({ where: { userId_rewardId: { userId, rewardId } } })) throw new AppError(409, 'ALREADY_REDEEMED', 'Você já resgatou esta experiência.');
      if (reward.stock < 1) throw new AppError(409, 'REWARD_SOLD_OUT', 'As vagas desta experiência se esgotaram.');
      const debit = await tx.user.updateMany({ where: { id: userId, points: { gte: reward.cost } }, data: { points: { decrement: reward.cost } } });
      if (!debit.count) throw new AppError(409, 'INSUFFICIENT_POINTS', 'Você ainda não tem pontos suficientes.');
      const stock = await tx.reward.updateMany({ where: { id: rewardId, stock: { gt: 0 }, active: true }, data: { stock: { decrement: 1 } } });
      if (!stock.count) throw new AppError(409, 'REWARD_SOLD_OUT', 'As vagas desta experiência se esgotaram.');
      const redemption = await tx.redemption.create({ data: { userId, rewardId, cost: reward.cost }, include: { reward: true } });
      await tx.pointEntry.create({ data: { userId, sourceKey: `reward:${rewardId}`, amount: -reward.cost, reason: `Resgate · ${reward.title}` } });
      return redemption;
    });
  },
};
