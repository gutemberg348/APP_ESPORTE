import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAdmin, assertSalesOpen, assertManualConfirmation, assertAdmission, assertMatchSchedule } from '../src/lib/ticket-rules.js';
import { toTicket, toAdminTicket } from '../src/lib/ticket-serializers.js';
import { registerSchema, profileSchema } from '../src/validators/index.js';
import { matchCreateSchema, matchUpdateSchema, manualPaymentSchema } from '../src/validators/admin.js';

test('only an active admin can administer the club; account inputs cannot promote a user', () => {
  assert.doesNotThrow(() => assertAdmin({ role: 'ADMIN', active: true }));
  for (const user of [undefined, { role: 'USER' }, { role: 'ADMIN', active: false }]) assert.throws(() => assertAdmin(user), { code: 'ADMIN_REQUIRED' });
  assert.equal(registerSchema.safeParse({ name: 'Usuário', email: 'user@example.com', password: 'SenhaSegura123', role: 'ADMIN' }).success, false);
  assert.equal(profileSchema.safeParse({ name: 'Usuário', role: 'ADMIN' }).success, false);
});
test('sales enforce publication, opening/closing boundaries, sector availability and kickoff', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const match = { published: true, salesEnabled: true, startsAt: new Date('2026-10-14T16:00:00Z'), salesOpenAt: now, salesCloseAt: new Date('2026-10-14T15:00:00Z') };
  const sector = { salesEnabled: true };
  assert.doesNotThrow(() => assertSalesOpen(match, sector, now));
  for (const update of [{ published: false }, { salesEnabled: false }, { salesOpenAt: new Date('2026-10-14T12:00:01Z') }, { salesCloseAt: now }]) assert.throws(() => assertSalesOpen({ ...match, ...update }, sector, now), { code: 'SALES_CLOSED' });
  assert.throws(() => assertSalesOpen(match, { salesEnabled: false }, now), { code: 'SALES_CLOSED' });
  assert.throws(() => assertSalesOpen({ ...match, salesCloseAt: null, startsAt: now }, sector, now), { code: 'MATCH_STARTED' });
});
test('payment confirmation rejects expiry, wrong total and non-pending purchases', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const ticket = { status: 'PENDING', priceCents: 12800, expiresAt: new Date('2026-10-14T12:15:00Z') };
  assert.doesNotThrow(() => assertManualConfirmation(ticket, 12800, now));
  assert.throws(() => assertManualConfirmation(ticket, 6400, now), { code: 'PAYMENT_AMOUNT_MISMATCH' });
  assert.throws(() => assertManualConfirmation({ ...ticket, expiresAt: now }, 12800, now), { code: 'RESERVATION_EXPIRED' });
  assert.throws(() => assertManualConfirmation({ ...ticket, status: 'ISSUED' }, 12800, now), { code: 'TICKET_NOT_PENDING' });
  const input = { ticketId: '6bcae09b-1af7-4566-8b13-b4cb432b5d0a', receivedCents: 12800, reference: 'RECIBO-001' };
  assert.equal(manualPaymentSchema.safeParse(input).success, false);
  assert.equal(manualPaymentSchema.safeParse({ ...input, paymentVerified: true }).success, true);
});
test('admission consumes only remaining quantities and rejects unissued or used tickets', () => {
  const ticket = { status: 'ISSUED', entryToken: 'opaque', quantity: 4, usedQuantity: 2 };
  assert.doesNotThrow(() => assertAdmission(ticket, 2));
  assert.throws(() => assertAdmission(ticket, 3), { code: 'TICKET_ALREADY_USED' });
  assert.throws(() => assertAdmission(ticket, 0), { code: 'TICKET_ALREADY_USED' });
  assert.throws(() => assertAdmission({ ...ticket, status: 'USED' }, 1), { code: 'INVALID_TICKET' });
  assert.doesNotThrow(() => assertAdmission({ ...ticket, entryToken: null }, 1));
});
test('draft creation is required and updates do not silently reset unrelated settings', () => {
  const input = { homeTeam: 'Nacional', awayTeam: 'Adversário', startsAt: '2026-10-24T19:00:00Z', stadium: 'José Cavalcanti', competition: 'Campeonato' };
  assert.equal(matchCreateSchema.parse(input).published, false);
  assert.equal(matchCreateSchema.safeParse({ ...input, published: true }).success, false);
  assert.deepEqual(matchUpdateSchema.parse({ id: '6bcae09b-1af7-4566-8b13-b4cb432b5d0a', published: true }), { id: '6bcae09b-1af7-4566-8b13-b4cb432b5d0a', published: true });
  const match = { startsAt: new Date(input.startsAt), salesOpenAt: new Date('2026-10-20T12:00:00Z'), salesCloseAt: new Date(input.startsAt) };
  assert.doesNotThrow(() => assertMatchSchedule(match));
  assert.throws(() => assertMatchSchedule({ ...match, salesOpenAt: match.startsAt }), { code: 'INVALID_SALES_WINDOW' });
  assert.throws(() => assertMatchSchedule({ ...match, salesCloseAt: new Date('2026-10-24T19:00:01Z') }), { code: 'INVALID_SALES_WINDOW' });
});
test('ticket lists never expose static QR secrets; entry QR requires its dedicated owner endpoint', () => {
  const ticket = { id: 'ticket', userId: 'private', status: 'PENDING', entryToken: 'secret', quantity: 2, usedQuantity: 0, expiresAt: new Date(Date.now() - 1000), payment: null };
  assert.equal(toTicket(ticket).status, 'EXPIRED');
  assert.equal(toTicket(ticket).entryQr, null);
  const issued = toTicket({ ...ticket, status: 'ISSUED' });
  assert.equal(issued.entryQr, null);
  assert.ok(!Object.hasOwn(issued, 'entryToken'));
  assert.ok(!Object.hasOwn(issued, 'userId'));
  const admin = toAdminTicket({ ...ticket, status: 'ISSUED', user: { id: 'customer', name: 'Titular', email: 'holder@example.com' } });
  assert.equal(admin.entryQr, null);
  assert.ok(!JSON.stringify(admin).includes('secret'));
});
