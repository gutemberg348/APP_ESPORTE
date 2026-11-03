import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/utils/ticket-state.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { availablePlaces, matchSaleState, ticketStatus, activeTicket, reservationCountdown } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
const now = Date.parse('2026-10-30T18:00:00Z');
const match = () => ({ id: 'game', published: true, salesEnabled: true, startsAt: new Date(now + 3600000).toISOString(), sectors: [{ id: 'sol', priceCents: 4000, available: 2, salesEnabled: true }] });

test('catalog never invents inventory from capacity and starting prices exclude paused or sold-out sectors', () => {
  assert.equal(availablePlaces({ capacity: 500 }), null);
  assert.equal(availablePlaces({ available: -1 }), null);
  const game = match();
  game.sectors.push({ id: 'cheap', priceCents: 0, available: 0 }, { id: 'paused', priceCents: 1000, available: 100, salesEnabled: false });
  const state = matchSaleState(game, now);
  assert.equal(state.canBuy, true); assert.equal(state.available, 2); assert.equal(state.fromPriceCents, 4000);
  delete game.sectors[0].available;
  assert.equal(matchSaleState(game, now).code, 'UNKNOWN');
  game.sectors[0].available = 0;
  assert.equal(matchSaleState(game, now).code, 'SOLD_OUT');
});

test('catalog distinguishes opening, paused, expired sale and kickoff boundaries', () => {
  const game = match();
  game.salesOpenAt = new Date(now + 1000).toISOString();
  assert.equal(matchSaleState(game, now).code, 'SCHEDULED');
  assert.equal(matchSaleState(game, now + 1000).canBuy, true);
  game.salesCloseAt = new Date(now + 2000).toISOString();
  assert.equal(matchSaleState(game, now + 2000).code, 'CLOSED');
  game.salesEnabled = false;
  assert.equal(matchSaleState(game, now).code, 'PAUSED');
  assert.equal(matchSaleState({ ...match(), published: false }, now).canBuy, false);
  assert.equal(matchSaleState(match(), now + 3600000).canBuy, false);
});

test('expired and cancelled reservations do not block a new choice, but issued and used orders still do', () => {
  const pending = { id: 'order', status: 'PENDING', match: { id: 'game' }, expiresAt: new Date(now + 61000).toISOString() };
  assert.equal(reservationCountdown(pending, now), '1:01');
  assert.equal(ticketStatus(pending, now + 61000), 'EXPIRED');
  assert.equal(reservationCountdown(pending, now + 100000), '0:00');
  assert.equal(activeTicket([pending], 'game', now + 61000), undefined);
  assert.equal(activeTicket([{ ...pending, status: 'CANCELED' }], 'game', now), undefined);
  for (const status of ['PENDING', 'ISSUED', 'USED']) assert.equal(activeTicket([{ ...pending, status }], 'game', now)?.id, 'order');
});
