import { inventoryWhere, occupiedQuantity } from '../lib/ticket-rules.js';
import { ticketInclude, toAdminTicket } from '../lib/ticket-serializers.js';
import { AppError } from '../lib/errors.js';

const contains = (value) => ({ contains: value, mode: 'insensitive' });
const period = ({ from, to }) => from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};
const page = (total, { limit, offset }) => ({ total, limit, offset, hasMore: offset + limit < total });
const sum = (aggregate, field) => aggregate._sum[field] || 0;
// A transaction owns one connection; submit each query after the previous completes.
async function inOrder(queries) {
  const results = [];
  for (const query of queries) results.push(await query());
  return results;
}
const ticketSearch = (search) => !search ? {} : { OR: [
  { user: { name: contains(search) } }, { user: { email: contains(search) } },
  ...(/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(search) ? [{ id: search }] : []),
] };
export function salesWhere(query, now = new Date()) {
  const { matchId, sectorId, status, deleted = 'all', payment, search } = query;
  return {
    ...period(query), ...ticketSearch(search),
    ...(matchId ? { matchId } : {}), ...(sectorId ? { sectorId } : {}),
    ...(deleted === 'all' ? {} : { deletedAt: deleted === 'only' ? { not: null } : null }),
    ...(payment === 'UNPAID' ? { payment: { is: null } } : payment ? { payment: { is: { method: payment === 'FREE' ? 'FREE' : { in: ['MANUAL', 'ASAAS'] } } } } : {}),
    ...(status === 'EXPIRED' ? { status: 'PENDING', expiresAt: { lte: now } } : status === 'PENDING' ? { status, expiresAt: { gt: now } } : status ? { status } : {}),
  };
}
const admissionSelect = {
  id: true, quantity: true, createdAt: true,
  actor: { select: { id: true, name: true, email: true } },
  ticket: { select: {
    id: true, deletedAt: true, status: true, quantity: true, usedQuantity: true,
    user: { select: { id: true, name: true, email: true } },
    match: { select: { id: true, homeTeam: true, awayTeam: true, startsAt: true, stadium: true } },
    sector: { select: { id: true, name: true } },
  } },
};
const toAdmission = (row) => ({ protocol: row.id, quantity: row.quantity, createdAt: row.createdAt, actor: row.actor, ticket: row.ticket });

// A single read snapshot keeps totals, page and availability consistent during sales/entry.
export function createAdminReportsStore(client, { now = () => new Date() } = {}) {
  const read = (work) => client.$transaction(work, { isolationLevel: 'RepeatableRead' });
  return {
    sales(query) {
      const instant = now(), where = salesWhere(query, instant);
      const location = { ...(query.matchId ? { matchId: query.matchId } : {}), ...(query.sectorId ? { id: query.sectorId } : {}) };
      const inventoryLocation = { ...(query.matchId ? { matchId: query.matchId } : {}), ...(query.sectorId ? { sectorId: query.sectorId } : {}) };
      return read(async (tx) => {
        const [total, items, sold, reserved, receipts, archivedReceipts, free, capacity, occupied, sectors, counts] = await inOrder([
          () => tx.ticket.count({ where }),
          () => tx.ticket.findMany({ where, include: { ...ticketInclude, user: { select: { id: true, name: true, email: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit, skip: query.offset }),
          () => tx.ticket.aggregate({ where: { AND: [where, { deletedAt: null, status: { in: ['ISSUED', 'USED'] }, payment: { isNot: null } }] }, _sum: { quantity: true } }),
          () => tx.ticket.aggregate({ where: { AND: [where, { deletedAt: null, status: 'PENDING', expiresAt: { gt: instant } }] }, _sum: { quantity: true } }),
          () => tx.ticketPayment.aggregate({ where: { ticket: where }, _sum: { amountCents: true, refundedCents: true } }),
          () => tx.ticketPayment.aggregate({ where: { ticket: { AND: [where, { deletedAt: { not: null } }] } }, _sum: { amountCents: true } }),
          () => tx.ticket.aggregate({ where: { AND: [where, { deletedAt: null, payment: { is: { method: 'FREE' } } }] }, _sum: { quantity: true } }),
          () => tx.sector.aggregate({ where: location, _sum: { capacity: true } }),
          () => tx.ticket.aggregate({ where: { ...inventoryLocation, ...inventoryWhere(instant) }, _sum: { quantity: true, voidedQuantity: true } }),
          () => query.matchId ? tx.sector.findMany({ where: location, orderBy: [{ name: 'asc' }, { id: 'asc' }] }) : [],
          () => query.matchId ? tx.ticket.groupBy({ by: ['sectorId', 'status', 'deletedAt'], where: { ...inventoryLocation, ...inventoryWhere(instant) }, _sum: { quantity: true, voidedQuantity: true, usedQuantity: true } }) : [],
        ]);
        const occupiedTotal = occupiedQuantity(occupied._sum), totalCapacity = sum(capacity, 'capacity');
        return {
          items: items.map((ticket) => toAdminTicket(ticket, instant)), pagination: page(total, query), serverTime: instant.toISOString(),
          summary: { orders: total, soldQuantity: sum(sold, 'quantity'), reservedQuantity: sum(reserved, 'quantity'), freeQuantity: sum(free, 'quantity'), confirmedRevenueCents: sum(receipts, 'amountCents'), refundedRevenueCents: sum(receipts, 'refundedCents'), archivedRevenueCents: sum(archivedReceipts, 'amountCents') },
          inventory: { capacity: totalCapacity, occupied: occupiedTotal, available: Math.max(0, totalCapacity - occupiedTotal), sectors: sectors.map((sector) => {
            const groups = counts.filter((row) => row.sectorId === sector.id);
            const occupied = groups.reduce((value, row) => value + occupiedQuantity(row._sum), 0);
            return { ...sector, occupied, available: Math.max(0, sector.capacity - occupied), soldQuantity: groups.filter((row) => !row.deletedAt && row.status !== 'PENDING').reduce((value, row) => value + sum(row, 'quantity'), 0), reservedQuantity: groups.filter((row) => row.status === 'PENDING').reduce((value, row) => value + sum(row, 'quantity'), 0), usedQuantity: groups.reduce((value, row) => value + sum(row, 'usedQuantity'), 0) };
          }) },
        };
      });
    },
    admissions(query) {
      const { matchId, sectorId, actorId, protocol, search } = query;
      const where = { ...period(query), ...(actorId ? { actorId } : {}), ...(protocol ? { id: protocol } : {}), ticket: { ...(matchId ? { matchId } : {}), ...(sectorId ? { sectorId } : {}), ...ticketSearch(search) } };
      return read(async (tx) => {
        const [total, totals, items] = await inOrder([
          () => tx.ticketAdmission.count({ where }), () => tx.ticketAdmission.aggregate({ where, _sum: { quantity: true } }),
          () => tx.ticketAdmission.findMany({ where, select: admissionSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit, skip: query.offset }),
        ]);
        return { items: items.map(toAdmission), pagination: page(total, query), summary: { operations: total, admittedQuantity: sum(totals, 'quantity') } };
      });
    },
    async admission(protocol) {
      const row = await client.ticketAdmission.findUnique({ where: { id: protocol }, select: admissionSelect });
      if (!row) throw new AppError(404, 'ADMISSION_NOT_FOUND', 'Protocolo de entrada não encontrado.');
      return toAdmission(row);
    },
    denials(query) {
      const { matchId, sectorId, actorId, protocol } = query;
      const where = { action: 'TICKET_VALIDATION_DENIED', ...period(query), ...(actorId ? { actorId } : {}), ...(matchId ? { entityId: matchId } : {}), ...(protocol ? { id: protocol } : {}), ...(sectorId ? { details: { path: ['sectorId'], equals: sectorId } } : {}) };
      return read(async (tx) => {
        const [total, rows] = await inOrder([
          () => tx.auditLog.count({ where }), () => tx.auditLog.findMany({ where, include: { actor: { select: { id: true, name: true, email: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit, skip: query.offset }),
        ]);
        const matchIds = [...new Set(rows.map((row) => row.entityId))], sectorIds = [...new Set(rows.map((row) => row.details.sectorId).filter(Boolean))];
        const [matches, sectors] = await inOrder([
          () => tx.match.findMany({ where: { id: { in: matchIds } }, select: { id: true, homeTeam: true, awayTeam: true, startsAt: true } }),
          () => tx.sector.findMany({ where: { id: { in: sectorIds } }, select: { id: true, name: true } }),
        ]);
        return { items: rows.map((row) => ({ protocol: row.id, createdAt: row.createdAt, actor: row.actor, reason: row.details.reason, stage: row.details.stage || null, match: matches.find((match) => match.id === row.entityId) || null, sector: sectors.find((sector) => sector.id === row.details.sectorId) || null })), pagination: page(total, query) };
      });
    },
    // Includes inactive staff and admins who actually operated the gate, preserving history.
    operators: () => client.user.findMany({ where: { OR: [{ role: 'GATE' }, { ticketAdmissions: { some: {} } }, { auditLogs: { some: { action: 'TICKET_VALIDATION_DENIED' } } }] }, select: { id: true, name: true, email: true, active: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
  };
}
