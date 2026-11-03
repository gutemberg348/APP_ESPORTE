import { db } from '../config/database.js';
import { serializable } from '../lib/business-rules.js';
import { AppError } from '../lib/errors.js';
const include = { gateAssignments: { include: { sector: { include: { match: true } } }, orderBy: { createdAt: 'asc' } } };
function safe(user) {
  return { id: user.id, name: user.name, email: user.email, active: user.active, role: user.role, assignments: user.gateAssignments.map((item) => ({ sectorId: item.sectorId, sectorName: item.sector.name, matchId: item.sector.matchId, matchLabel: `${item.sector.match.homeTeam} × ${item.sector.match.awayTeam}`, active: item.active })) };
}
async function employee(tx, id) {
  const user = await tx.user.findFirst({ where: { id, role: 'GATE' } });
  if (!user) throw new AppError(404, 'EMPLOYEE_NOT_FOUND', 'Funcionário de portaria não encontrado.');
  return user;
}
const audit = (tx, actorId, action, entityId, details) => tx.auditLog.create({ data: { actorId, action, entityId, details } });
export const staffModel = {
  async list({ limit = 50, offset = 0, search } = {}) {
    const where = { role: 'GATE', ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {}) };
    return (await db.user.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: limit, skip: offset })).map(safe);
  },
  create(actorId, data) {
    return serializable(db, async (tx) => {
      const user = await tx.user.create({ data: { ...data, role: 'GATE', active: true }, include });
      await audit(tx, actorId, 'EMPLOYEE_CREATED', user.id, { email: user.email });
      return safe(user);
    });
  },
  update(actorId, { userId, ...data }) {
    return serializable(db, async (tx) => {
      await employee(tx, userId);
      const user = await tx.user.update({ where: { id: userId }, data, include });
      if (data.active === false) await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, actorId, 'EMPLOYEE_UPDATED', userId, { fields: Object.keys(data), ...(data.active !== undefined ? { active: data.active } : {}) });
      return safe(user);
    });
  },
  password(actorId, userId, passwordHash) {
    return serializable(db, async (tx) => {
      await employee(tx, userId);
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(tx, actorId, 'EMPLOYEE_PASSWORD_RESET', userId, {});
    });
  },
  assignments(actorId, { userId, sectorIds }) {
    return serializable(db, async (tx) => {
      await employee(tx, userId);
      if (await tx.sector.count({ where: { id: { in: sectorIds } } }) !== sectorIds.length) throw new AppError(422, 'INVALID_ASSIGNMENT_SECTOR', 'Um dos setores informados não existe.');
      await tx.gateAssignment.updateMany({ where: { userId }, data: { active: false } });
      for (const sectorId of sectorIds) await tx.gateAssignment.upsert({ where: { userId_sectorId: { userId, sectorId } }, update: { active: true }, create: { userId, sectorId, active: true } });
      await audit(tx, actorId, 'EMPLOYEE_ASSIGNMENTS_CHANGED', userId, { sectorIds });
      return safe(await tx.user.findUnique({ where: { id: userId }, include }));
    });
  },
  gateMatches(user) {
    return db.match.findMany({
      where: user.role === 'ADMIN' ? {} : { sectors: { some: { gateAssignments: { some: { userId: user.id, active: true } } } } },
      include: { sectors: { where: user.role === 'ADMIN' ? {} : { gateAssignments: { some: { userId: user.id, active: true } } }, orderBy: { name: 'asc' } } },
      orderBy: { startsAt: 'desc' }, take: 100,
    });
  },
};
