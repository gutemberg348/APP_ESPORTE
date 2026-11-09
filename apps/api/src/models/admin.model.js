import { randomUUID } from 'node:crypto';
import { db } from '../config/database.js';
import { serializable } from '../lib/business-rules.js';
import { AppError } from '../lib/errors.js';
import { inventoryWhere, occupiedQuantity, assertMatchSchedule } from '../lib/ticket-rules.js';
import { ticketInclude, toAdminTicket } from '../lib/ticket-serializers.js';
import { toMember } from '../lib/serializers.js';
import { withAvailability, writeAudit } from './ticket.model.js';

export const adminModel = {
  async overview() {
    const [users, matches, issued, pending] = await Promise.all([
      db.user.count(), db.match.count(), db.ticket.aggregate({ where: { deletedAt: null, status: { in: ['ISSUED', 'USED'] } }, _sum: { quantity: true } }),
      db.ticket.count({ where: { status: 'PENDING', expiresAt: { gt: new Date() } } }),
    ]);
    return { users, matches, issuedTickets: issued._sum.quantity || 0, pendingReservations: pending };
  },
  async matches({ limit, offset }) {
    return withAvailability(db, await db.match.findMany({ orderBy: { startsAt: 'desc' }, include: { sectors: { orderBy: { priceCents: 'asc' } } }, take: limit, skip: offset }));
  },
  createMatch(actorId, data) {
    assertMatchSchedule(data);
    if (data.startsAt <= new Date() || data.published) throw new AppError(422, 'INVALID_NEW_MATCH', 'Crie um jogo futuro como rascunho antes de cadastrar os setores.');
    return serializable(db, async (tx) => {
      const match = await tx.match.create({ data: { ...data, slug: randomUUID() }, include: { sectors: true } });
      await writeAudit(tx, actorId, 'MATCH_CREATED', match.id, { homeTeam: match.homeTeam, awayTeam: match.awayTeam, published: match.published });
      return match;
    });
  },
  updateMatch(actorId, { id, ...data }) {
    return serializable(db, async (tx) => {
      const current = await tx.match.findUnique({ where: { id } });
      if (!current) throw new AppError(404, 'MATCH_NOT_FOUND', 'Jogo não encontrado.');
      assertMatchSchedule({ ...current, ...data });
      if (data.published === true && current.startsAt <= new Date() && !data.startsAt) throw new AppError(422, 'PAST_MATCH', 'A publicação exige um jogo futuro.');
      if (data.startsAt && data.startsAt <= new Date()) throw new AppError(422, 'PAST_MATCH', 'Informe uma data futura para o jogo.');
      if (data.startsAt && data.startsAt.getTime() !== current.startsAt.getTime() && await tx.ticket.count({ where: { matchId: id, status: { in: ['ISSUED', 'USED'] } } })) throw new AppError(409, 'MATCH_HAS_TICKETS', 'O jogo tem ingressos emitidos. A alteração de data exige tratar os compradores primeiro.');
      if (data.published === true && !await tx.sector.count({ where: { matchId: id, salesEnabled: true, capacity: { gt: 0 } } })) throw new AppError(422, 'MATCH_HAS_NO_SECTORS', 'Cadastre ao menos um setor disponível antes de publicar.');
      const match = await tx.match.update({ where: { id }, data, include: { sectors: true } });
      await writeAudit(tx, actorId, 'MATCH_UPDATED', id, { fields: Object.keys(data) });
      return match;
    });
  },
  createSector(actorId, data) {
    return serializable(db, async (tx) => {
      if (!await tx.match.findUnique({ where: { id: data.matchId } })) throw new AppError(404, 'MATCH_NOT_FOUND', 'Jogo não encontrado.');
      const sector = await tx.sector.create({ data });
      await writeAudit(tx, actorId, 'SECTOR_CREATED', sector.id, { matchId: data.matchId, capacity: data.capacity, priceCents: data.priceCents });
      return sector;
    });
  },
  updateSector(actorId, { id, ...data }) {
    return serializable(db, async (tx) => {
      const sector = await tx.sector.findUnique({ where: { id } });
      if (!sector) throw new AppError(404, 'SECTOR_NOT_FOUND', 'Setor não encontrado.');
      if (data.capacity !== undefined) {
        const reserved = await tx.ticket.aggregate({ where: { sectorId: id, ...inventoryWhere() }, _sum: { quantity: true, voidedQuantity: true } });
        if (data.capacity < occupiedQuantity(reserved._sum)) throw new AppError(409, 'CAPACITY_BELOW_OCCUPIED', 'A capacidade não pode ser menor que os ingressos e reservas válidos.');
      }
      const updated = await tx.sector.update({ where: { id }, data });
      await writeAudit(tx, actorId, 'SECTOR_UPDATED', id, { fields: Object.keys(data) });
      return updated;
    });
  },
  async tickets({ limit, offset, matchId, status, deleted = 'exclude' }) {
    const now = new Date();
    const where = { ...(deleted === 'all' ? {} : { deletedAt: deleted === 'only' ? { not: null } : null }), ...(matchId ? { matchId } : {}), ...(status === 'EXPIRED' ? { status: 'PENDING', expiresAt: { lte: now } } : status === 'PENDING' ? { status, expiresAt: { gt: now } } : status ? { status } : {}) };
    return (await db.ticket.findMany({ where, include: { ...ticketInclude, user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: limit, skip: offset })).map((ticket) => toAdminTicket(ticket));
  },
  async users({ limit, offset, search }) {
    const where = search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {};
    const users = await db.user.findMany({ where, include: { membership: { include: { plan: true } } }, orderBy: { createdAt: 'desc' }, take: limit, skip: offset });
    return users.map(toMember);
  },
  plans: () => db.plan.findMany({ orderBy: { priceCents: 'asc' }, take: 100 }),
  plan(actorId, { id, ...data }) {
    return serializable(db, async (tx) => {
      const plan = id ? await tx.plan.update({ where: { id }, data }) : await tx.plan.create({ data });
      await writeAudit(tx, actorId, id ? 'PLAN_UPDATED' : 'PLAN_CREATED', plan.id, data);
      return plan;
    });
  },
  membership(actorId, { userId, planId, status, validUntil }) {
    return serializable(db, async (tx) => {
      if (!await tx.user.findUnique({ where: { id: userId } }) || !await tx.plan.findUnique({ where: { id: planId } })) throw new AppError(404, 'MEMBER_OR_PLAN_NOT_FOUND', 'Conta ou plano não encontrado.');
      if (status === 'ACTIVE' && validUntil <= new Date()) throw new AppError(422, 'INVALID_MEMBERSHIP_DATE', 'Uma associação ativa exige validade futura.');
      const membership = await tx.membership.upsert({ where: { userId }, update: { planId, status, validUntil }, create: { userId, planId, status, validUntil, memberId: `NC-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}` } });
      await writeAudit(tx, actorId, 'MEMBERSHIP_UPDATED', membership.id, { userId, planId, status, validUntil: validUntil.toISOString() });
      return toMember(await tx.user.findUnique({ where: { id: userId }, include: { membership: { include: { plan: true } } } }));
    });
  },
  account(actorId, { userId, active }) {
    return serializable(db, async (tx) => {
      if (actorId === userId && !active) throw new AppError(409, 'SELF_DISABLE_BLOCKED', 'Você não pode desativar a própria conta.');
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Conta não encontrada.');
      if (user.role === 'ADMIN' && !active && await tx.user.count({ where: { role: 'ADMIN', active: true } }) <= 1) throw new AppError(409, 'LAST_ADMIN_PROTECTED', 'O último administrador ativo não pode ser desativado.');
      await tx.user.update({ where: { id: userId }, data: { active } });
      if (!active) {
        await tx.session.deleteMany({ where: { userId } });
        await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
      }
      await writeAudit(tx, actorId, 'ACCOUNT_STATUS_CHANGED', userId, { active });
      return { userId, active };
    });
  },
  audit: ({ limit, offset }) => db.auditLog.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { actor: { select: { name: true } } }, take: limit, skip: offset }),
};
