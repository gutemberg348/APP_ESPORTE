import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/utils/admin.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { appliedReportFilters } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);

test('report periods use Patos timezone, include the full final minute and reset pagination', () => {
  const draft = { search: ' Alice ', from: '2026-11-04 10:30', to: '2026-11-04 10:30', offset: '100' };
  assert.deepEqual(appliedReportFilters(draft), { search: 'Alice', from: '2026-11-04T13:30:00.000Z', to: '2026-11-04T13:30:59.999Z', offset: '0', limit: '25' });
  assert.equal(draft.offset, '100');
  assert.equal(appliedReportFilters({}).from, undefined);
});
test('invalid report dates and reversed periods cannot silently become unfiltered queries', () => {
  for (const draft of [{ from: '04/11/2026' }, { to: '2026-02-30 12:00' }, { from: '2026-11-04 18:00', to: '2026-11-04 17:59' }]) assert.throws(() => appliedReportFilters(draft));
});
