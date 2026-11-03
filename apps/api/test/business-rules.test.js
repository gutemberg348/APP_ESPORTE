import test from 'node:test';
import assert from 'node:assert/strict';
import { clubDay, ticketPrice, assertAvailability, serializable } from '../src/lib/business-rules.js';

test('check-in uses midnight in the club timezone', () => {
  assert.equal(clubDay(new Date('2026-10-14T02:59:59Z')), '2026-10-13');
  assert.equal(clubDay(new Date('2026-10-14T03:00:00Z')), '2026-10-14');
});
test('ticket totals round each unit before multiplying quantity', () => {
  assert.equal(ticketPrice(8000, 20, 3), 19200);
  assert.equal(ticketPrice(999, 15, 4), 3396);
  assert.equal(ticketPrice(8000, 100, 1), 0);
  for (const args of [[1, 0, 0], [1, 0, 5], [1, -1, 1], [1, 101, 1], [-1, 0, 1], [NaN, 0, 1], [1, 0, 1.5], [2147483647, 0, 4]]) {
    assert.throws(() => ticketPrice(...args), { code: 'INVALID_PRICE' });
  }
});
test('last available places can be reserved but capacity cannot be exceeded', () => {
  assert.doesNotThrow(() => assertAvailability(100, 96, 4));
  assert.throws(() => assertAvailability(100, 97, 4), { code: 'SECTOR_SOLD_OUT' });
  assert.throws(() => assertAvailability(0, 0, 1), { code: 'SECTOR_SOLD_OUT' });
});
test('serialization conflicts retry the entire transaction with a bounded limit', async () => {
  let attempts = 0;
  const client = { async $transaction(work, options) {
    assert.equal(options.isolationLevel, 'Serializable');
    attempts++;
    if (attempts < 3) throw Object.assign(new Error('conflict'), { code: 'P2034' });
    return work({ balance: 30 });
  } };
  assert.equal(await serializable(client, async (tx) => tx.balance), 30);
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(serializable({ async $transaction() { attempts++; throw Object.assign(new Error('conflict'), { code: 'P2034' }); } }, () => {}), { code: 'P2034' });
  assert.equal(attempts, 3);
});
test('business and uniqueness errors are never retried', async () => {
  let attempts = 0;
  await assert.rejects(serializable({ async $transaction() { attempts++; throw Object.assign(new Error('duplicate'), { code: 'P2002' }); } }, () => {}), { code: 'P2002' });
  assert.equal(attempts, 1);
});
