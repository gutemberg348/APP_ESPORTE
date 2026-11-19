import { inventoryWhere, occupiedQuantity } from '../lib/ticket-rules.js';

export const clubCatalog = slug => ({ OR: [{ partidaV1Id: null }, { partidaV1: { estadio: { tenant: { slug } } } }] });

// The app keeps its original ticket IDs (including used admissions and live Pix).
// Both checkouts read the other channel's usage in their serializable transaction.
export async function appOccupancy(tx, allocationIds) {
  const sectors = await tx.sector.findMany({ where: { alocacaoV1Id: { in: allocationIds } }, select: { id: true, alocacaoV1Id: true } });
  if (!sectors.length) return new Map();
  const allocations = new Map(sectors.map(s => [s.id, s.alocacaoV1Id]));
  const totals = await tx.ticket.groupBy({ by: ['sectorId'], where: { sectorId: { in: sectors.map(s => s.id) }, ...inventoryWhere() },
    _sum: { quantity: true, voidedQuantity: true } });
  return new Map(totals.map(r => [allocations.get(r.sectorId), occupiedQuantity(r._sum)]));
}

export function standardLot(lots) {
  return lots.filter(l => l.ativo && l.tipoCategoria === 'INTEIRA')
    .sort((a, b) => a.criadoEm - b.criadoEm || a.id.localeCompare(b.id))[0];
}
