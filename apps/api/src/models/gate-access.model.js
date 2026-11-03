import { AppError } from '../lib/errors.js';
import { assertGateScope } from '../lib/gate-rules.js';
export async function authorizeGate(client, userId, { matchId, sectorId }) {
  const user = await client.user.findUnique({ where: { id: userId }, select: { id: true, role: true, active: true } });
  const sector = await client.sector.findFirst({ where: { id: sectorId, matchId }, select: { id: true } });
  if (!sector) throw new AppError(403, 'GATE_SCOPE_DENIED', 'Partida ou setor indisponível para esta portaria.');
  const assignment = user?.role === 'ADMIN' ? null : await client.gateAssignment.findUnique({ where: { userId_sectorId: { userId, sectorId } } });
  assertGateScope(user, assignment);
}
