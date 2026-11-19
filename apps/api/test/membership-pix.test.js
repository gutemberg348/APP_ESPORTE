import { AppError } from '../src/lib/errors.js';
import { simulateApproval } from './helpers/pix-approval.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { createMembershipStore } from '../src/models/membership.store.js';
import { createSicrediStore } from '../src/models/sicredi.store.js';
import { issueMembershipCard, verifyMembershipCard } from '../src/services/membership-card.js';
import { createPixQueries } from '../src/services/pix.service.js';
import { routes } from '../src/routes/index.js';
import { createApp } from '../src/http/app.js';
import { inject } from './helpers/inject.js';

test('membership routes require authentication and checkout reaches validation with a supported rate limit', async () => {
  const route = routes.find(row => row.path === '/v1/membership/checkout');
  const app = createApp({ routes: [route], logger: { info() {}, error() {} }, authenticate: async token => { if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Entre novamente.'); return { user: { id: randomUUID(), role: 'USER', active: true } }; } });
  assert.equal((await inject(app, route.path, { method: 'POST', headers: { 'content-type':'application/json' }, body: '{}' })).status, 401);
  assert.equal((await inject(app, route.path, { method: 'POST', headers: { 'content-type':'application/json', authorization:'Bearer test.token.value' }, body: '{}' })).status, 422);
  const verify = routes.find(row => row.path === '/v1/membership/verify');
  for (const role of ['GATE', 'ADMIN', 'CASHIER', 'USER']) {
    const checking = createApp({ routes: [verify], logger: { info() {}, error() {} }, authenticate: async () => ({user:{id:randomUUID(),role,active:true}}) });
    const response = await inject(checking,verify.path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test.token.value'},body:JSON.stringify({token:'invalid-but-long-card-token'})});
    assert.equal(response.status,403);
    assert.equal((await response.json()).error.code,role === 'USER' ? 'CARD_VERIFY_DENIED' : 'CARD_INVALID');
  }

});

test('membership Pix activates only confirmed payments, preserves snapshots and handles replay, late payments, manual changes and refunds', { timeout: 120000 }, async t => {
  const pg = await PGlite.create(), migrations = new URL('../prisma/migrations/', import.meta.url);
  for (const entry of (await readdir(migrations, { withFileTypes: true })).filter(row => row.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) await pg.exec(await readFile(new URL(`${entry.name}/migration.sql`, migrations), 'utf8'));
  const defaultPlan = (await pg.query('SELECT * FROM "Plan" WHERE "name" = $1', ['Sócio Esporte'])).rows[0];
  assert.equal(defaultPlan.priceCents,15); assert.equal(defaultPlan.durationDays,30); assert.equal(defaultPlan.active,true);
  const defaultSql = await readFile(new URL('../prisma/migrations/20261117190000_default_membership_plan/migration.sql', import.meta.url),'utf8');
  await pg.query('UPDATE "Plan" SET "priceCents" = 4500, "active" = false WHERE "id" = $1',[defaultPlan.id]);
  await pg.exec(defaultSql);
  const keptPlan = (await pg.query('SELECT * FROM "Plan" WHERE "id" = $1',[defaultPlan.id])).rows[0];
  assert.equal(keptPlan.priceCents,4500); assert.equal(keptPlan.active,false);
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 }); await socket.start();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  let instant = new Date(), index = 0;
  const settings = { PAYMENT_MODE: 'sicredi', SICREDI_PIX_ENV: 'sandbox', SICREDI_PIX_RECEIVING_KEY: 'test-key', SICREDI_PIX_TXID_PREFIX: 'ESP', SICREDI_PIX_WEBHOOK_TOKEN: 'z'.repeat(64) };
  const charges = new Map(), receipts = new Map(), copy = value => value ? structuredClone(value) : null;
  const api = {
    charge: async id => copy(charges.get(id)), pix: async id => copy(receipts.get(id)),
    create: async (txid, cents) => { const row = { txid, chave: 'test-key', valor: { original: (cents/100).toFixed(2), modalidadeAlteracao: 0 }, status: 'ATIVA', pixCopiaECola: '000201TEST', pix: [] }; charges.set(txid, row); return copy(row); },
    cancel: async id => { charges.get(id).status = 'REMOVIDA_PELO_USUARIO_RECEBEDOR'; },
    refundStatus: async (e2e,id) => copy(receipts.get(e2e).devolucoes.find(row => row.id === id)),
    refund: async (e2e,id,cents) => { const row = { id, valor: (cents/100).toFixed(2), status: 'DEVOLVIDO' }; receipts.get(e2e).devolucoes.push(row); return copy(row); },
  };
  const store = createMembershipStore(db, settings, () => instant), bank = createSicrediStore(db, { settings, api, now: () => instant });
  const admin = await db.user.create({ data: { name: 'Admin', email: 'admin@member.test', role: 'ADMIN', passwordHash: 'test' } });
  const plan = await db.plan.create({ data: { name: 'Sócio', priceCents: 1990, durationDays: 30, discountPercent: 10 } });
  const createUser = () => db.user.create({ data: { purchaseDocument: { create: { cpf: '52998224725' } }, name: 'Torcedor', email: `${++index}@member.test`, passwordHash: 'test' } });
  const body = () => ({ planId: plan.id, expectedPriceCents: 1990, requestKey: randomUUID() });
  async function paid(order, override = {}) {
    const intent = await db.gatewayIntent.findUnique({ where: { id: order.intentId } });
    const receipt = { endToEndId: `E${randomUUID().replaceAll('-','').slice(0,31)}`, txid: intent.providerReference, valor: (intent.amountCents/100).toFixed(2), horario: instant.toISOString(), devolucoes: [], ...override };
    const charge = charges.get(intent.providerReference); charge.status = 'CONCLUIDA'; charge.pix = [copy(receipt)]; receipts.set(receipt.endToEndId, receipt);
    await bank.process(intent.id); return receipt;
  }
  await t.test('test plans charge eleven and fifteen cents and activate thirty days after Pix confirmation', async () => {
    const canario = await db.plan.create({ data: { name: 'Sócio Canário', priceCents: 3990 } });
    const custom = await db.plan.create({ data: { name: 'Plano personalizado', priceCents: 6500, active: false } });
    await db.plan.update({ where: { id: defaultPlan.id }, data: { active: true } });
    await pg.exec(await readFile(new URL('20261119210000_membership_test_prices/migration.sql', migrations), 'utf8'));
    assert.equal((await db.plan.findUniqueOrThrow({ where: { id: custom.id } })).priceCents, 6500);
    for (const [planId, cents] of [[canario.id, 11], [defaultPlan.id, 15]]) {
      const buyer = await createUser();
      const order = await store.checkout(buyer.id, { planId, expectedPriceCents: cents, requestKey: randomUUID() });
      await bank.process(order.intentId);
      const intent = await db.gatewayIntent.findUniqueOrThrow({ where: { id: order.intentId } });
      assert.equal(intent.amountCents, cents);
      assert.equal(charges.get(intent.providerReference).valor.original, (cents / 100).toFixed(2));
      assert.equal(await db.membership.count({ where: { userId: buyer.id } }), 0);
      await paid(order);
      const active = await db.membership.findUniqueOrThrow({ where: { userId: buyer.id } });
      assert.equal(active.status, 'ACTIVE');
      assert.equal(active.validUntil - instant, 30 * 86400000);
    }
    await db.plan.update({ where: { id: canario.id }, data: { priceCents: 2500 } });
    await pg.exec(defaultSql);
    assert.equal((await db.plan.findUniqueOrThrow({ where: { id: canario.id } })).priceCents, 2500);
    await db.plan.updateMany({ where: { id: { in: [canario.id, defaultPlan.id] } }, data: { active: false } });
  });
  await db.businessSettings.upsert({ where: { id: 'main' }, create: { id: 'main', membershipPaymentMinutes: 7 }, update: { membershipPaymentMinutes: 7 } });
  const user = await createUser(), input = body();
  const orders = await Promise.all([store.checkout(user.id,input), store.checkout(user.id,input)]);
  assert.equal(orders[0].id, orders[1].id);
  assert.equal((await store.checkout(user.id,body())).id,orders[0].id);
  const order = orders[0]; assert.equal(order.expiresAt - instant, 7 * 60000); assert.equal(await db.membership.count({ where: { userId: user.id } }),0);
  await assert.rejects(store.checkout(admin.id,body()), { code: 'MEMBERSHIP_USER_ONLY' });
  await assert.rejects(createPixQueries(db,settings).ownIntent(admin.id,order.intentId), { code: 'PAYMENT_NOT_FOUND' });
  await bank.process(order.intentId);
  assert.equal((await bank.ownIntent(user.id,order.intentId)).state,'PENDING');
  assert.equal((await simulateApproval(db, settings, order.intentId, () => instant, bank)).simulatedState, 'RECEIVED');
  assert.equal(await db.membership.count({ where: { userId: user.id } }), 0);
  assert.equal((await db.membershipOrder.findUniqueOrThrow({ where: { id: order.id } })).status, 'PENDING');
  await db.plan.update({ where: { id: plan.id }, data: { priceCents: 5990, durationDays: 365 } });
  await paid(order, { horario: new Date(Math.floor(instant.getTime()/1000)*1000).toISOString() }); await bank.process(order.intentId);
  const membership = await db.membership.findUnique({ where: { userId: user.id } });
  assert.equal(membership.status,'ACTIVE'); assert.equal(membership.validUntil-instant,30*86400000);
  assert.equal((await db.membershipOrder.findUnique({ where:{id:order.id} })).priceCents,1990);
  await assert.rejects(store.checkout(user.id,body()),{code:'MEMBERSHIP_ALREADY_ACTIVE'});
  const cardUser = await db.user.findUnique({ where: { id:user.id }, include:{ membership:{include:{plan:true}}} });
  const card = issueMembershipCard(cardUser,'secret',instant.getTime());
  assert.equal((await verifyMembershipCard(db,'secret',admin,card.token,instant.getTime()+1000)).valid,true);
  await assert.rejects(verifyMembershipCard(db,'secret',user,card.token,instant.getTime()),{code:'CARD_VERIFY_DENIED'});
  await assert.rejects(verifyMembershipCard(db,'secret',admin,card.token,instant.getTime()+30000),{code:'CARD_INVALID'});
  await assert.rejects(verifyMembershipCard(db,'other',admin,card.token,instant.getTime()),{code:'CARD_INVALID'});
  await bank.requestRefund(admin.id,order.intentId,'Estorno de teste'); await bank.process(order.intentId);
  assert.equal((await db.membership.findUnique({where:{userId:user.id}})).status,'EXPIRED');
  await assert.rejects(verifyMembershipCard(db,'secret',admin,card.token,instant.getTime()),{code:'CARD_INVALID'});
  assert.equal((await db.membershipOrder.findUnique({where:{id:order.id}})).status,'REFUNDED');
  await db.plan.update({where:{id:plan.id},data:{priceCents:1990,durationDays:30}});
  const lateUser = await createUser(), late = await store.checkout(lateUser.id,body()); await bank.process(late.intentId);
  instant = new Date(Date.parse(late.expiresAt)+1000); await paid(late);
  assert.equal(await db.membership.count({where:{userId:lateUser.id}}),0);
  assert.equal((await bank.ownIntent(lateUser.id,late.intentId)).state,'REFUNDED');
  const changedUser = await createUser(), changed = await store.checkout(changedUser.id,body()); await bank.process(changed.intentId);
  const manual = await db.membership.create({data:{userId:changedUser.id,planId:plan.id,status:'ACTIVE',memberId:'MANUAL',validUntil:new Date(instant.getTime()+86400000)}});
  await paid(changed);
  assert.equal((await bank.ownIntent(changedUser.id,changed.intentId)).state,'REFUNDED');
  assert.equal((await db.membership.findUnique({where:{id:manual.id}})).status,'ACTIVE');
  const renewalUser = await createUser(), renewal = await store.checkout(renewalUser.id,body()); await bank.process(renewal.intentId); await paid(renewal);
  await db.membership.update({where:{userId:renewalUser.id},data:{lastOrderId:null,validUntil:new Date(instant.getTime()+60*86400000)}});
  await bank.requestRefund(admin.id,renewal.intentId,'Preservar concessao manual posterior'); await bank.process(renewal.intentId);
  assert.equal((await db.membership.findUnique({where:{userId:renewalUser.id}})).status,'ACTIVE');
  const mismatchUser = await createUser(), mismatch = await store.checkout(mismatchUser.id,body()); await bank.process(mismatch.intentId);
  await paid(mismatch,{valor:'0.01'}); assert.equal(await db.membership.count({where:{userId:mismatchUser.id}}),0);
  const hidden = await createUser(); await db.plan.update({where:{id:plan.id},data:{active:false}});
  await assert.rejects(store.checkout(hidden.id,body()),{code:'PLAN_UNAVAILABLE'});
  assert.equal((await store.plans()).length,0);
});
