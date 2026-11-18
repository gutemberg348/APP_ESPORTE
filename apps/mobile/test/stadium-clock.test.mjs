import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/hooks/stadium-clock.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { stadiumClock, stadiumPhase } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));

test('late joiners converge on the same transition despite independent device clocks', () => {
  const first = stadiumClock(12000, 50, 150);
  const later = stadiumClock(17000, 1000, 1040);
  assert.deepEqual(stadiumPhase(first, 6099), { white: false, nextIn: 1 });
  assert.deepEqual(stadiumPhase(first, 6100), { white: true, nextIn: 6000 });
  assert.deepEqual(stadiumPhase(later, 2020), stadiumPhase(first, 6100));
  assert.equal(stadiumClock(NaN, 0, 10), null);
  assert.equal(stadiumClock(12000, 0, 2500), null);
});
