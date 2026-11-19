import { salesWhere } from './admin-reports.store.js';
import { counterTicketWhere, ingressoInclude } from './ingresso-v1-operacao.model.js';
import { ticketInclude, toAdminTicket } from '../lib/ticket-serializers.js';

// Date, ID and channel give both catalogs one stable order, including timestamp ties.
function after(field, channel, cursor) {
  if (!cursor) return {};
  const [date, id, previousChannel] = cursor.split('|');
  const instant = new Date(date);
  return { OR: [
    { [field]: { lt: instant } },
    { [field]: instant, id: { lt: id } },
    ...(channel > previousChannel ? [{ [field]: instant, id }] : []),
  ] };
}

export function listAdminTickets(db, tenantSlug, { search, matchId, channel, cursor, limit }) {
  return db.$transaction(async tx => {
    const take = limit + 1;
    const linked = matchId && !channel ? await tx.match.findFirst({
      where: { partidaV1Id: matchId, partidaV1: { estadio: { tenant: { slug: tenantSlug } } } }, select: { id: true },
    }) : null;
    const app = channel === 'counter' ? [] : await tx.ticket.findMany({
      where: { AND: [salesWhere({ matchId: linked?.id || matchId, search }), after('createdAt', 'app', cursor)] },
      include: { ...ticketInclude, user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take,
    });
    const counter = channel === 'app' ? [] : await tx.ingressoV1.findMany({
      where: { AND: [counterTicketWhere({ partidaId: matchId, search }, { tenant: { slug: tenantSlug, active: true } }), after('criadoEm', 'counter', cursor)] },
      include: ingressoInclude, orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }], take,
    });
    const rows = [
      ...app.map(ticket => ({ channel: 'app', at: ticket.createdAt, ticket: toAdminTicket(ticket) })),
      ...counter.map(ticket => ({ channel: 'counter', at: ticket.criadoEm, ticket })),
    ].sort((a, b) => b.at - a.at || b.ticket.id.localeCompare(a.ticket.id) || a.channel.localeCompare(b.channel));
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { items, next: rows.length > limit ? [last.at.toISOString(), last.ticket.id, last.channel].join('|') : null };
  }, { isolationLevel: 'RepeatableRead' });
}
