import { randomUUID } from 'node:crypto';
import { serializable } from '../lib/business-rules.js';
import { readBusinessSettings } from '../lib/business-settings.js';
import { AppError } from '../lib/errors.js';
const audit = (tx, actorId, action, entityId, details) => tx.auditLog.create({ data: { actorId, action, entityId, details: JSON.parse(JSON.stringify(details)) } });
export function createSettingsStore(client) {
  return {
    settings: () => readBusinessSettings(client),
    saveSettings(actorId, { version, ...data }) {
      return serializable(client, async (tx) => {
        const before = await readBusinessSettings(tx);
        const changed = await tx.businessSettings.updateMany({ where: { id: 'main', version }, data: { ...data, version: { increment: 1 } } });
        if (!changed.count) throw new AppError(409, 'SETTINGS_CHANGED', 'As configurações mudaram. Atualize antes de salvar.');
        const after = await tx.businessSettings.findUnique({ where: { id: 'main' } });
        await audit(tx, actorId, 'BUSINESS_SETTINGS_UPDATED', 'main', { before, after });
        return after;
      });
    },
    rewards: () => client.reward.findMany({ orderBy: [{ active: 'desc' }, { title: 'asc' }], take: 500 }),
    saveReward(actorId, { id, version, ...data }) {
      return serializable(client, async (tx) => {
        const before = id ? await tx.reward.findUnique({ where: { id } }) : null;
        if (id && !before) throw new AppError(404, 'REWARD_NOT_FOUND', 'Recompensa não encontrada.');
        if (id) {
          const changed = await tx.reward.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
          if (!changed.count) throw new AppError(409, 'REWARD_CHANGED', 'A recompensa mudou ou foi resgatada. Atualize antes de salvar.');
        }
        const after = id ? await tx.reward.findUnique({ where: { id } }) : await tx.reward.create({ data: { ...data, slug: `reward-${randomUUID()}` } });
        await audit(tx, actorId, id ? 'REWARD_UPDATED' : 'REWARD_CREATED', after.id, { before, after });
        return after;
      });
    },
  };
}
