import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
}
const { calendarMonth, calendarValue, readCalendarValue, shiftCalendarMonth, displayCalendarValue } = await load('../src/utils/admin-calendar.ts');
const { parseClubDate, appliedReportFilters } = await load('../src/utils/admin.ts');
test('calendar generates complete Monday-first weeks across month and year boundaries', () => {
  const november = calendarMonth(2026, 10);
  assert.equal(november.length, 42);
  assert.deepEqual(november[0], { year: 2026, month: 9, day: 26 });
  assert.deepEqual(november[6], { year: 2026, month: 10, day: 1 });
  assert.equal(new Set(november.map((day) => calendarValue(day, '0', '0'))).size, 42);
  assert.deepEqual(shiftCalendarMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftCalendarMonth(2026, 0, -1), { year: 2025, month: 11 });
});
test('calendar validates leap years and hours without accepting rolled-over dates', () => {
  assert.deepEqual(readCalendarValue('2028-02-29 23:59'), { year: 2028, month: 1, day: 29, hour: '23', minute: '59' });
  for (const input of ['', '2026-02-29 16:00', '2026-04-31 16:00', '2026-12-01 24:00', '2026-12-01 12:60', '2026-13-01 16:00', '2026-00-01 16:00', '06/11/2026 16:00']) assert.equal(readCalendarValue(input), null);
});
test('custom date selection preserves every minute and the API wall-clock contract in Patos', () => {
  const selected = calendarValue({ year: 2026, month: 10, day: 6 }, '0', '7');
  assert.equal(selected, '2026-11-06 00:07');
  assert.equal(displayCalendarValue(selected), '06/11/2026 · 00:07');
  assert.equal(parseClubDate(selected), '2026-11-06T03:07:00.000Z');
  const filters = appliedReportFilters({ from: selected, to: selected });
  assert.equal(filters.from, '2026-11-06T03:07:00.000Z');
  assert.equal(filters.to, '2026-11-06T03:07:59.999Z');
});
