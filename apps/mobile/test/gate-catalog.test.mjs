import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/gate-catalog.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { gateCatalog } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('linked gate catalogs keep exact authorized sector IDs, including assignments for one channel only', () => {
  const sector = id => ({ id, setor: { nome: 'Geral' } });
  const counter = { id: 'game', alocacoesSetor: [sector('shared'), sector('counter-only')] };
  const app = { source: 'app', id: 'app-game', partidaV1Id: 'game', alocacoesSetor: [
    { ...sector('app-shared'), alocacaoV1Id: 'shared' }, { ...sector('app-only'), alocacaoV1Id: 'other' },
  ] };
  const [game, legacy] = gateCatalog([counter, app, { ...app, id: 'legacy', partidaV1Id: null }]);
  assert.equal(game.id, 'game');
  assert.equal(legacy.id, 'legacy');
  assert.deepEqual(game.alocacoesSetor.map(a => [a.id, a.appScope?.alocacaoId, !!a.appOnly]), [
    ['shared', 'app-shared', false], ['counter-only', undefined, false], ['app-only', 'app-only', true],
  ]);
  assert.deepEqual(gateCatalog([app]), [app]);
});

const stationCode = await readFile(new URL('../src/utils/gate-station.ts', import.meta.url), 'utf8');
const { outputText: stationJs } = ts.transpileModule(stationCode, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { parseStation, resolveStation } = await import('data:text/javascript;base64,' + Buffer.from(stationJs).toString('base64'));

test('the selected station is reused only while the current shift still includes it', () => {
  const saved = parseStation('{"partidaId":"game","alocacaoId":"sector","catracaId":"CATRACA-2"}');
  const section = id => ({ id, setor: { nome: 'Geral', portaoEntrada: 'PORTAO-3' } });
  const game = (...sections) => ({ id: 'game', alocacoesSetor: sections.map(section) });
  assert.equal(resolveStation([game('sector', 'other')], saved), saved);
  assert.equal(resolveStation([game('other', 'third')], saved), null);
  assert.equal(resolveStation([], saved), null);
  assert.deepEqual(resolveStation([game('other')], saved), { partidaId: 'game', alocacaoId: 'other', catracaId: 'PORTAO-3' });
  assert.equal(parseStation('{"partidaId":"game","alocacaoId":"sector","catracaId":""}'), null);
  assert.equal(parseStation('{'), null);
});
