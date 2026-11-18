import { ticketCodeSchema } from '../validators/admin.js';
import { assertGateUser } from '../lib/gate-rules.js';

function matchView(match) {
  return { id: match.id, timeMandante: match.homeTeam, timeVisitante: match.awayTeam,
    dataPartida: match.startsAt, estadio: { nome: match.stadium, nomePopular: null } };
}
function ticketView(ticket) {
  return {
    id: ticket.id, nomeTitular: ticket.holder, status: ticket.status, remainingQuantity: ticket.remainingQuantity,
    partida: matchView(ticket.match), alocacao: { id: ticket.sector.id, setor: { id: ticket.sector.id, nome: ticket.sector.name, portaoEntrada: null } },
  };
}
function credential(input) {
  const raw = input.chaveQr.trim().replace(/^nacional:\/\/ticket\//, '');
  return ticketCodeSchema.parse({ matchId: input.partidaId, sectorId: input.alocacaoId,
    ...(raw.includes('.') ? { token: raw } : { code: raw }) });
}
function receiptView(result) {
  return { decision: result.decision, duplicate: result.duplicate, admission: result.admission, ticket: ticketView(result.ticket) };
}
export function createAppGate({ staff, entry, reports }) {
  return {
    async matches(user) {
      const matches = await staff.gateMatches(user);
      return matches.map(match => ({
        ...matchView(match), source: 'app', portariaAtiva: match.entryEnabled, portariaAbreEm: match.gateOpenAt,
        portariaFechaEm: match.gateCloseAt, status: match.published ? 'PUBLICADA' : 'RASCUNHO',
        alocacoesSetor: match.sectors.map(sector => ({ id: sector.id, setorId: sector.id, setor: { nome: sector.name, portaoEntrada: null } })),
      }));
    },
    async inspect(user, input) {
      const result = await entry.inspect(user, { ...credential(input), gate: input.catracaId });
      return { ...ticketView(result), decision: result.decision, qrExpiresAt: result.qrExpiresAt, serverTime: result.serverTime };
    },
    async admit(user, input) {
      const result = await entry.admit(user, { ...credential(input), quantity: 1, ticketId: input.ticketId, requestKey: input.requestKey, gate: input.catracaId });
      return receiptView(result);
    },
    async receipt(user, input) {
      return receiptView(await entry.receipt(user, { matchId: input.partidaId, sectorId: input.alocacaoId,
        ticketId: input.ticketId, requestKey: input.requestKey }));
    },
    async history(user, input) {
      assertGateUser(user);
      const query = { ...input, matchId: input.partidaId, sectorId: input.alocacaoId, actorId: user.role === 'ADMIN' ? input.actorId : user.id };
      const denied = input.kind === 'DENIED';
      const page = denied ? await reports.denials(query) : await reports.admissions(query);
      return { total: page.pagination.total, limit: query.limit, offset: query.offset, items: page.items.map(row => ({
        id: row.protocol, gate: row.gate, createdAt: row.createdAt, actor: row.actor && { id: row.actor.id, name: row.actor.name },
        ...(denied ? { reason: row.reason, stage: row.stage, partida: row.match && matchView(row.match) } :
          { ticket: ticketView({ ...row.ticket, holder: row.ticket.user.name }) }),
      })) };
    },
  };
}
