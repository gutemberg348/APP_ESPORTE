import type { GateV1Match } from '@nacional/shared/gate-v1';

// Combine only scopes actually returned for this operator. One channel's
// assignment must never implicitly grant the other channel's sector.
export function gateCatalog(rows: GateV1Match[]): GateV1Match[] {
  const games = rows.filter(row => !row.source).map(row => ({ ...row, alocacoesSetor: row.alocacoesSetor.map(a => ({ ...a })) }));
  const byId = new Map(games.map(row => [row.id, row]));
  for (const app of rows.filter(row => row.source === 'app')) {
    const game = app.partidaV1Id && byId.get(app.partidaV1Id);
    if (!game) { games.push(app); continue; }
    for (const sector of app.alocacoesSetor) {
      const allocation = game.alocacoesSetor.find(a => a.id === sector.alocacaoV1Id);
      const appScope = { partidaId: app.id, alocacaoId: sector.id };
      if (allocation) allocation.appScope = appScope;
      else game.alocacoesSetor.push({ ...sector, appScope, appOnly: true });
    }
  }
  return games;
}
