import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { createAppGate } from '../src/services/app-gate.js';
import { createTicketEntryService } from '../src/services/ticket-entry.service.js';
import { createStaffModel } from '../src/models/staff.model.js';
import { createAdminReportsStore } from '../src/models/admin-reports.store.js';
import { listAdminTickets } from '../src/models/admin-ticket-directory.js';
import { createGateV1Store } from '../src/models/gate-v1.store.js';
import { signTicketV1Token, verifyTicketV1TokenSignature } from '../src/lib/ingresso-v1-token.js';
import { gateV1AdmitSchema, gateV1InspectSchema, gateV1HistorySchema } from '../src/validators/gate-v1.js';
import { createApp } from '../src/http/app.js';
import { routes } from '../src/routes/index.js';
import { inject } from './helpers/inject.js';
import { createTicketCounter } from '../src/services/ticket-counter.js';
import { counterSaleSchema } from '../src/validators/ticket-counter.js';
import { counterTicketPdf } from '../src/lib/counter-ticket-pdf.js';
import { requireTerminalKey } from '../src/services/pagbank-counter.js';
import { env } from '../src/config/env.js';

const secret = 'test-gate-key-'.repeat(8);
test('only the counter and admin can submit counter sales, sellers cannot admit or administer', async () => {
  for (const role of ['USER','CASHIER','GATE','TICKET_SELLER','ADMIN']) {
    const app = createApp({ routes, logger: { info() {}, error() {} }, authenticate: async () => ({ user: { id: randomUUID(), role, active: true } }) });
    const post = { method: 'POST', headers: { Authorization: 'Bearer test.header.signature', 'Content-Type': 'application/json' }, body: '{}' };
    assert.equal((await inject(app, '/v1/bilheteria/vendas', post)).status, ['ADMIN','TICKET_SELLER'].includes(role) ? 422 : 403);
    if (role === 'TICKET_SELLER') {
      const smart = { key: randomUUID(), lotId: randomUUID(), quantity: 1, unitCents: 2000, cpf: '12345678909', method: 'PAGBANK' };
      const denied = await inject(app, '/v1/bilheteria/vendas', { ...post, body: JSON.stringify(smart) });
      assert.equal(denied.status, 403);
      for (const path of ['/v1/gate/v1/admit', '/v1/admin/employees']) assert.equal((await inject(app, path, post)).status, 403);
    }
  }
});
test('gate endpoints restrict staff roles before parsing and all admission aliases use V1', async () => {
  const paths = ['/v1/gate/v1/inspect', '/v1/gate/inspect', '/v1/ingresso-v1/portaria/inspecionar'];
  for (const role of ['USER', 'CASHIER', 'GATE', 'ADMIN']) {
    const app = createApp({ routes, logger: { info() {}, error() {} }, authenticate: async () => ({ user: { id: randomUUID(), role, active: true } }) });
    for (const path of paths) assert.equal((await inject(app, path, { method: 'POST', headers: { Authorization: 'Bearer test.header.signature', 'Content-Type': 'application/json' }, body: '{}' })).status, ['USER', 'CASHIER'].includes(role) ? 403 : 422);
  }
  const admissionRoutes = routes.filter((r) => r.path.endsWith('/admit') || r.path.endsWith('/liberar'));
  assert.ok(admissionRoutes.length >= 3);
  assert.equal(new Set(admissionRoutes.map((r) => r.handler)).size, 1);
  assert.equal(gateV1InspectSchema.safeParse({ chaveQr: 'A'.repeat(16) }).success, false);
  assert.equal(gateV1AdmitSchema.safeParse({ partidaId: randomUUID(), alocacaoId: randomUUID(), chaveQr: 'A'.repeat(16), catracaId: 'P1' }).success, false);
  assert.equal(gateV1HistorySchema.safeParse({ from: '2026-12-10T00:00:00Z', to: '2026-12-01T00:00:00Z' }).success, false);
});

test('V1 gate migration, authorization, payment, single use and receipt recovery in PostgreSQL', { timeout: 120000 }, async (t) => {
  const pg = await PGlite.create(), migrations = new URL('../prisma/migrations/', import.meta.url);
  const folders = (await readdir(migrations, { withFileTypes: true })).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const gateIndex = folders.findIndex((row) => row.name === '20261111010000_unified_gate_v1');
  const later = folders.splice(gateIndex + 1);
  const latest = folders.pop();
  assert.equal(latest.name, '20261111010000_unified_gate_v1');
  for (const folder of folders) await pg.exec(await readFile(new URL(`${folder.name}/migration.sql`, migrations), 'utf8'));
  const old = Array.from({ length: 7 }, () => randomUUID());
  await pg.exec(`
    INSERT INTO "Tenant" (id,slug,name) VALUES ('${old[0]}','migration-gate','Migration test');
    INSERT INTO ingresso_v1_estadios (id,"tenantId",nome,cidade,"capacidadeMaxima","atualizadoEm") VALUES ('${old[1]}','${old[0]}','Migration','Patos',100,now());
    INSERT INTO ingresso_v1_setores_estadio (id,"estadioId",nome,"capacidadeFisica","atualizadoEm") VALUES ('${old[2]}','${old[1]}','Setor',100,now());
    INSERT INTO ingresso_v1_partidas (id,"estadioId","timeMandante","timeVisitante","dataPartida","atualizadoEm") VALUES ('${old[3]}','${old[1]}','A','B',now(),now());
    INSERT INTO ingresso_v1_alocacoes_setor_partida (id,"partidaId","setorId","capacidadeLiberada") VALUES ('${old[4]}','${old[3]}','${old[2]}',100);
    INSERT INTO ingresso_v1_ingressos (id,"partidaId","alocacaoId","chaveQr",status,"atualizadoEm") VALUES
      ('${old[5]}','${old[3]}','${old[4]}','migration-used','UTILIZADO',now()),
      ('${old[6]}','${old[3]}','${old[4]}','migration-sold','VENDIDO',now());
  `);
  await pg.exec(await readFile(new URL(`${latest.name}/migration.sql`, migrations), 'utf8'));
  for (const folder of later) await pg.exec(await readFile(new URL(`${folder.name}/migration.sql`, migrations), 'utf8'));
  const socket = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 1 }); await socket.start();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1, connectionTimeoutMillis: 5000 }) });
  t.after(async () => { await db.$disconnect(); await socket.stop(); await pg.close(); });
  const backfilled = await db.ingressoV1.findMany({ where: { partidaId: old[3] }, orderBy: { chaveQr: 'asc' } });
  assert.deepEqual(backfilled.map((row) => row.status), ['VENDIDO', 'UTILIZADO']);
  assert.ok(backfilled.every((row) => /^[A-F0-9]{4}(-[A-F0-9]{4}){3}$/.test(row.codigoPortaria)));
  assert.equal((await db.partidaIngressoV1.findUnique({ where: { id: old[3] } })).portariaAtiva, false);
  const codes = (await pg.query('SELECT ingresso_v1_novo_codigo() AS code FROM generate_series(1,1000)')).rows;
  assert.equal(new Set(codes.map((r) => r.code)).size, 1000);
  let instant = new Date('2026-11-11T18:00:00Z');
  const store = createGateV1Store(db, { tenantSlug: 'gate-test', secret, now: () => instant });
  const admin = await db.user.create({ data: { name: 'Admin', email: 'admin@gate.test', passwordHash: 'test', role: 'ADMIN' } });
  const employee = await db.user.create({ data: { name: 'Portaria', email: 'gate@gate.test', passwordHash: 'test', role: 'GATE' } });
  const other = await db.user.create({ data: { name: 'Outro', email: 'other@gate.test', passwordHash: 'test', role: 'GATE' } });
  const tenant = await db.tenant.create({ data: { slug: 'gate-test', name: 'Clube de teste' } });
  async function context(tenantId = tenant.id) {
    const stadium = await db.estadioIngressoV1.create({ data: { tenantId, nome: randomUUID(), cidade: 'Patos', capacidadeMaxima: 100 } });
    const sector = await db.setorEstadioIngressoV1.create({ data: { estadioId: stadium.id, nome: 'Arquibancada', capacidadeFisica: 100 } });
    const match = await db.partidaIngressoV1.create({ data: { estadioId: stadium.id, timeMandante: 'Esporte', timeVisitante: 'Visitante', dataPartida: instant, status: 'PUBLICADA', portariaAtiva: true } });
    const allocation = await db.alocacaoSetorPartidaIngressoV1.create({ data: { partidaId: match.id, setorId: sector.id, capacidadeLiberada: 100 } });
    return { partidaId: match.id, alocacaoId: allocation.id, stadium, sector };
  }
  const ctx = await context(), another = await context();
  async function issue(extra = {}, current = ctx) {
    const order = await db.pedidoIngressoV1.create({ data: { usuarioId: admin.id, partidaId: current.partidaId, valorTotalCentavos: 3000, statusPagamento: 'PAGO' } });
    return db.ingressoV1.create({ data: { partidaId: current.partidaId, alocacaoId: current.alocacaoId, pedidoId: order.id, nomeTitular: 'Torcedor', cpfTitular: '12345678909', status: 'VENDIDO', chaveQr: signTicketV1Token(current, secret), ...extra } });
  }
  await t.test('paid app purchases and counter tickets share one searchable directory and paginate through ties', async () => {
    const match = await db.match.create({ data: { slug: randomUUID(), homeTeam: 'Casa', awayTeam: 'Visitante',
      startsAt: instant, stadium: 'Teste', competition: 'Teste', sectors: { create: { name: 'Geral', priceCents: 10 } } }, include: { sectors: true } });
    const buyer = await db.user.create({ data: { name: 'Pessoa diretório', email: 'directory@test.local', passwordHash: 'test' } });
    const ticket = await db.ticket.create({ data: { userId: buyer.id, matchId: match.id, sectorId: match.sectors[0].id,
      priceCents: 10, quantity: 1, status: 'ISSUED', payment: { create: { method: 'SICREDI', amountCents: 10, reference: randomUUID() } } } });
    await issue({ id: ticket.id, nomeTitular: buyer.name, criadoEm: ticket.createdAt });
    const list = (query = {}) => listAdminTickets(db, tenant.slug, { search: buyer.name, limit: 1, ...query });
    const first = await list();
    assert.equal(first.items[0].channel, 'app');
    assert.equal(first.items[0].ticket.payment.amountCents, 10);
    assert.ok(first.next);
    const second = await list({ cursor: first.next });
    assert.equal(second.items[0].channel, 'counter');
    assert.equal(second.next, null);
    assert.equal((await list({ matchId: match.id })).next, null);
    assert.equal((await list({ channel: 'counter', matchId: match.id })).items.length, 0);
    assert.equal((await list({ search: buyer.email })).items[0].ticket.id, ticket.id);
  });
  await t.test('app and V1 scopes stay independent; a group QR, manual code and recovery refer to the same admission', async () => {
    const entry = createTicketEntryService(db, { secret, issuer: 'test', now: () => instant });
    const gate = createAppGate({ staff: createStaffModel(db), reports: createAdminReportsStore(db), entry });
    const match = await db.match.create({ data: { slug: randomUUID(), homeTeam: 'Esporte', awayTeam: 'Visitante',
      startsAt: instant, stadium: 'Teste', competition: 'Teste', published: true, entryEnabled: true,
      sectors: { create: { name: 'Geral', priceCents: 3000 } } }, include: { sectors: true } });
    const sector = match.sectors[0];
    const fan = await db.user.create({ data: { name: 'Torcedor', email: 'group@gate.test', passwordHash: 'test' } });
    const ticket = await db.ticket.create({ data: { userId: fan.id, matchId: match.id, sectorId: sector.id,
      priceCents: 6000, quantity: 2, status: 'ISSUED', payment: { create: { method: 'SICREDI', amountCents: 6000, reference: 'SICREDI:' + 'A'.repeat(32) } } } });
    const issued = await entry.qr(fan, ticket.id);
    const input = { partidaId: match.id, alocacaoId: sector.id, ticketId: ticket.id, chaveQr: issued.qr, catracaId: 'P1', requestKey: randomUUID() };
    assert.deepEqual(await gate.matches(employee), []);
    await assert.rejects(gate.inspect(employee, input), { code: 'GATE_SCOPE_DENIED' });
    await store.assignments(admin.id, { userId: employee.id, allocationIds: [], appSectorIds: [sector.id] });
    assert.equal((await gate.matches(employee))[0].source, 'app');
    assert.equal((await gate.inspect(employee, input)).remainingQuantity, 2);
    const admitted = await gate.admit(employee, { ...input, chaveQr: issued.code });
    assert.equal(admitted.ticket.remainingQuantity, 1);
    assert.equal((await gate.admit(employee, input)).duplicate, true);
    assert.equal((await gate.receipt(employee, input)).admission.id, admitted.admission.id);
    await assert.rejects(gate.inspect(employee, input), { code: 'TICKET_QR_USED' });
    const next = await entry.qr(fan, ticket.id);
    await gate.inspect(employee, { ...input, chaveQr: next.code });
    const history = { kind: 'ALLOW', limit: 20, offset: 0, actorId: employee.id };
    const [historyRow] = (await gate.history(employee, history)).items;
    assert.equal(historyRow.id, admitted.admission.id);
    assert.equal(historyRow.gate, 'P1');
    assert.equal((await gate.history(other, history)).total, 0);
    await store.assignments(admin.id, { userId: employee.id, allocationIds: [], appSectorIds: [] });
    await assert.rejects(gate.admit(employee, { ...input, chaveQr: next.code, requestKey: randomUUID() }), { code: 'GATE_SCOPE_DENIED' });
    assert.equal((await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).usedQuantity, 1);
  });
  const a = await issue();
  const input = (ticket = a, extra = {}) => ({ partidaId: ctx.partidaId, alocacaoId: ctx.alocacaoId, chaveQr: ticket.chaveQr, ...extra });
  const operation = (ticket = a, extra = {}) => input(ticket, { catracaId: 'P1', requestKey: randomUUID(), ...extra });

  await t.test('scopes are explicit and revocation is immediate', async () => {
    assert.deepEqual(await store.matches(employee.id), []);
    await assert.rejects(store.inspect(employee.id, input()), { code: 'GATE_SCOPE_DENIED' });
    await assert.rejects(store.assignments(employee.id, { userId: other.id, allocationIds: [ctx.alocacaoId] }), { code: 'ADMIN_REQUIRED' });
    await store.assignments(admin.id, { userId: employee.id, allocationIds: [ctx.alocacaoId] });
    assert.equal((await store.matches(employee.id)).length, 1);
    assert.equal((await store.inspect(employee.id, input())).decision, 'REVIEW');
    await assert.rejects(store.inspect(employee.id, input(a, another)), { code: 'GATE_SCOPE_DENIED' });
    await store.assignments(admin.id, { userId: employee.id, allocationIds: [] });
    await assert.rejects(store.inspect(employee.id, input()), { code: 'GATE_SCOPE_DENIED' });
    await store.assignments(admin.id, { userId: employee.id, allocationIds: [ctx.alocacaoId] });
    await db.user.update({ where: { id: employee.id }, data: { active: false } });
    await assert.rejects(store.inspect(employee.id, input()), { code: 'GATE_REQUIRED' });
    await db.user.update({ where: { id: employee.id }, data: { active: true } });
  });
  await t.test('QR, manual and scanner codes identify one ticket without exposing CPF or QR', async () => {
    assert.match(a.codigoPortaria, /^[A-F0-9]{4}(-[A-F0-9]{4}){3}$/);
    const manual = await store.inspect(employee.id, input(a, { chaveQr: a.codigoPortaria.toLowerCase().replace(/-/g, '') }));
    assert.equal(manual.id, a.id); assert.equal(manual.cpfTitular, undefined); assert.equal(manual.codigoPortaria, undefined); assert.equal(manual.chaveQr, undefined);
    for (const raw of [a.id, '1234', a.chaveQr.slice(0, -1) + (a.chaveQr.endsWith('A') ? 'B' : 'A')]) await assert.rejects(store.inspect(employee.id, input(a, { chaveQr: raw })));
    assert.equal(verifyTicketV1TokenSignature(a.chaveQr, secret).claims.mid, ctx.partidaId);
    await assert.rejects(store.inspect(admin.id, input(a, another)), { code: 'WRONG_MATCH' });
    const sector = await db.setorEstadioIngressoV1.create({ data: { estadioId: ctx.stadium.id, nome: 'Visitante', capacidadeFisica: 20 } });
    const allocation = await db.alocacaoSetorPartidaIngressoV1.create({ data: { partidaId: ctx.partidaId, setorId: sector.id, capacidadeLiberada: 20 } });
    await assert.rejects(store.inspect(admin.id, input(a, { alocacaoId: allocation.id })), { code: 'WRONG_SECTOR' });
    const foreign = await db.tenant.create({ data: { slug: 'another-club', name: 'Outro clube' } }), foreignContext = await context(foreign.id);
    const foreignTicket = await issue({}, foreignContext);
    await assert.rejects(store.inspect(admin.id, { ...foreignContext, chaveQr: foreignTicket.chaveQr }), { code: 'GATE_SCOPE_DENIED' });
    await assert.rejects(store.assignments(admin.id, { userId: employee.id, allocationIds: [foreignContext.alocacaoId] }), { code: 'INVALID_ASSIGNMENT' });
  });
  await t.test('disabled gates, payment reversal and non-issued statuses block entry', async () => {
    await db.partidaIngressoV1.update({ where: { id: ctx.partidaId }, data: { portariaAtiva: false } });
    await assert.rejects(store.admit(employee.id, operation()), { code: 'GATE_CLOSED' });
    await db.partidaIngressoV1.update({ where: { id: ctx.partidaId }, data: { portariaAtiva: true } });
    instant = new Date('2026-11-12T00:00:00Z');
    await assert.rejects(store.inspect(employee.id, input()), { code: 'GATE_CLOSED' });
    instant = new Date('2026-11-11T18:00:00Z');
    for (const statusPagamento of ['PENDENTE', 'ESTORNADO']) {
      await db.pedidoIngressoV1.update({ where: { id: a.pedidoId }, data: { statusPagamento } });
      await assert.rejects(store.admit(employee.id, operation()), { code: 'TICKET_NOT_PAID' });
    }
    await db.pedidoIngressoV1.update({ where: { id: a.pedidoId }, data: { statusPagamento: 'PAGO' } });
    const canceled = await issue({ status: 'CANCELADO' });
    await assert.rejects(store.inspect(employee.id, input(canceled)), { code: 'TICKET_NOT_VALID' });
    const unpaid = await issue({ pedidoId: null });
    await assert.rejects(store.admit(employee.id, operation(unpaid)), { code: 'TICKET_NOT_PAID' });
    assert.equal(await db.admissionV1.count(), 0);
  });
  await t.test('concurrent submissions produce one admission; retries recover the same receipt', async () => {
    const op1 = operation(), op2 = operation();
    const outcomes = await Promise.allSettled([store.admit(employee.id, op1), store.admit(admin.id, op2)]);
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await db.admissionV1.count({ where: { ingressoId: a.id } }), 1);
    const winner = outcomes[0].status === 'fulfilled' ? employee.id : admin.id, op = winner === employee.id ? op1 : op2;
    const retry = await store.admit(winner, op);
    assert.equal(retry.decision, 'ALREADY_RECORDED'); assert.equal(retry.duplicate, true);
    assert.equal((await store.receipt(winner, op)).admission.id, retry.admission.id);
    await assert.rejects(store.receipt(other.id, op), { code: 'GATE_SCOPE_DENIED' });
    await assert.rejects(store.admit(employee.id, operation()), { code: 'INGRESSO_JA_UTILIZADO' });
    const b = await issue();
    await assert.rejects(store.admit(winner, { ...op, chaveQr: b.chaveQr }), { code: 'ADMISSION_KEY_CONFLICT' });
    const history = await store.history(admin.id, { partidaId: ctx.partidaId });
    assert.equal(history.total, 1); assert.equal(history.items[0].ticket.cpfTitular, undefined);
    assert.equal((await store.history(other.id, {})).total, 0);
    assert.equal(await db.auditLog.count({ where: { action: 'INGRESSO_V1_ACESSO_LIBERADO' } }), 1);
    const denied = await db.auditLog.findMany({ where: { action: 'INGRESSO_V1_VALIDACAO_RECUSADA' } });
    assert.ok(denied.length > 5); assert.ok(denied.every((row) => !JSON.stringify(row.details).includes(a.chaveQr)));
    const denials = await store.history(employee.id, { kind: 'DENIED', partidaId: ctx.partidaId, alocacaoId: ctx.alocacaoId });
    assert.ok(denials.total > 0); assert.ok(denials.items.every((row) => row.actor.id === employee.id));
    const protocol = denials.items[0].id;
    assert.equal((await store.history(admin.id, { kind: 'DENIED', protocol })).total, 1);
    assert.equal((await store.history(admin.id, { protocol: retry.admission.id })).total, 1);
  });
  await t.test('a race lost between consultation and conditional consumption cannot record admission', async () => {
    const ticket = await issue(); let intercepted = false;
    const racing = { ...db, $transaction: (work, options) => db.$transaction((tx) => work(new Proxy(tx, { get(target, prop) {
      if (prop !== 'ingressoV1') return Reflect.get(target, prop);
      return new Proxy(target.ingressoV1, { get(model, key) { if (key !== 'updateMany') return Reflect.get(model, key); return async () => { intercepted = true; return { count: 0 }; }; } });
    } })), options) };
    await assert.rejects(createGateV1Store(racing, { tenantSlug: 'gate-test', secret, now: () => instant }).admit(employee.id, operation(ticket)), { code: 'INGRESSO_JA_UTILIZADO' });
    assert.ok(intercepted); assert.equal(await db.admissionV1.count({ where: { ingressoId: ticket.id } }), 0);
  });
  await t.test('counter sale, stock rollback, private reprint and one admission across printed codes', async () => {
    const club = await db.tenant.upsert({ where: { slug: env.TENANT_SLUG }, create: { slug: env.TENANT_SLUG, name: 'Bilheteria' }, update: {} });
    const game = await context(club.id);
    const date = new Date(Date.now() + 3600000);
    await db.partidaIngressoV1.update({ where: { id: game.partidaId }, data: { dataPartida: date, vendasAtivas: true } });
    const seller = await db.user.create({ data: { name: 'Vendedor', email: 'seller@gate.test', passwordHash: 'test', role: 'TICKET_SELLER' } });
    const lot = await db.loteIngressoPartidaV1.create({ data: { alocacaoId: game.alocacaoId, tipoCategoria: 'INTEIRA', nome: 'Inteira', precoCentavos: 2000, quantidadeMaxima: 2 } });
    const counter = createTicketCounter(db, env.TENANT_SLUG);
    assert.ok((await counter.catalog()).some(l => l.id === lot.id));
    const sale = counterSaleSchema.parse({ key: randomUUID(), lotId: lot.id, quantity: 2, unitCents: 2000, cpf: '123.456.789-09', method: 'CARD' });
    assert.equal(counterSaleSchema.safeParse({ ...sale, cpf: '11111111111' }).success, false);
    await assert.rejects(counter.sale(employee.id, sale), { code: 'TICKET_SELLER_REQUIRED' });
    await assert.rejects(counter.sale(seller.id, { ...sale, quantity: 3 }), { code: 'LOTE_ESGOTADO' });
    assert.equal(await db.pedidoIngressoV1.count({ where: { chaveBalcao: sale.key } }), 0);
    const temporary = await counter.sale(seller.id, { ...sale, key: randomUUID() });
    await assert.rejects(counter.settle(admin.id, temporary.chaveBalcao, true), { code: 'COUNTER_NOT_FOUND' });
    await db.pedidoIngressoV1.update({ where: { id: temporary.id }, data: { expiraEm: new Date(0) } });
    assert.ok((await counter.catalog()).some(l => l.id === lot.id && l.available === 2));
    assert.equal((await counter.settle(seller.id, temporary.chaveBalcao, true)).statusPagamento, 'EXPIRADO');
    const abandoned = await counter.sale(seller.id, { ...sale, key: randomUUID() });
    assert.equal((await counter.settle(seller.id, abandoned.chaveBalcao, false)).statusPagamento, 'CANCELADO');
    assert.ok((await counter.catalog()).some(l => l.id === lot.id && l.available === 2));
    const smart = createTicketCounter(db, env.TENANT_SLUG, { PAGBANK_TERMINAL_TOKEN: 'test' });
    assert.throws(() => requireTerminalKey('', ''), { code: 'TERMINAL_KEY_REQUIRED' });
    assert.throws(() => requireTerminalKey('device', 'other'), { code: 'TERMINAL_KEY_REQUIRED' });
    const integrated = { ...sale, method: 'PAGBANK', key: randomUUID() };
    await assert.rejects(counter.sale(seller.id, integrated), { code: 'TERMINAL_UNAVAILABLE' });
    await smart.sale(seller.id, integrated);
    const begin = { key: integrated.key, attempt: randomUUID(), action: 'begin' };
    await assert.rejects(smart.terminal(other.id, begin), { code: 'COUNTER_NOT_FOUND' });
    const claim = await smart.terminal(seller.id, begin);
    assert.deepEqual(await smart.terminal(seller.id, begin), claim);
    assert.match(claim.reference, /^[0-9A-F]{10}$/);
    await assert.rejects(smart.terminal(seller.id, { ...begin, attempt: randomUUID() }), { code: 'TERMINAL_BUSY' });
    for (const pay of [false, true]) await assert.rejects(smart.settle(seller.id, integrated.key, pay), { code: 'COUNTER_TERMINAL_ONLY' });
    const approved = { ...begin, action: 'approved', ...claim, transaction: 'SDK-TEST-001' };
    await assert.rejects(smart.terminal(seller.id, { ...approved, amountCents: 1 }), { code: 'TERMINAL_MISMATCH' });
    const decline = { ...begin, action: 'declined', reason: 'A004' };
    assert.equal((await smart.terminal(seller.id, decline)).status, 'CANCELADO');
    assert.equal((await smart.terminal(seller.id, decline)).status, 'CANCELADO');
    assert.deepEqual(await smart.terminalQueue(seller.id), []);
    const held = await counter.sale(seller.id, sale);
    assert.equal(held.statusPagamento, 'PENDENTE');
    assert.equal(held.ingressos[0].status, 'RESERVADO');
    assert.equal((await counter.catalog()).some(l => l.id === lot.id), false);
    const order = await counter.settle(seller.id, sale.key, true);
    assert.equal(order.statusPagamento, 'PAGO');
    assert.equal((await counter.settle(seller.id, sale.key, true)).id, order.id);
    assert.equal(order.ingressos.length, 2); assert.equal(order.valorTotalCentavos, 4000);
    assert.equal((await counter.sale(seller.id, sale)).id, order.id);
    await assert.rejects(counter.sale(seller.id, { ...sale, method: 'CASH' }), { code: 'COUNTER_KEY_CONFLICT' });
    assert.equal((await counter.recent(seller.id)).length, 4);
    await assert.rejects(counter.receipt(other.id, sale.key), { code: 'COUNTER_NOT_FOUND' });
    const secondCopy = await counter.receipt(seller.id, sale.key);
    assert.deepEqual(secondCopy.ingressos, order.ingressos);
    const pdf = await counterTicketPdf(secondCopy);
    assert.ok(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')));
    assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 2);
    const reader = createGateV1Store(db, { tenantSlug: env.TENANT_SLUG, secret: env.TICKET_QR_SECRET });
    const input = { partidaId: game.partidaId, alocacaoId: game.alocacaoId, chaveQr: order.ingressos[0].chaveQr };
    assert.equal((await reader.inspect(admin.id, input)).decision, 'REVIEW');
    const barcode = order.ingressos[0].codigoPortaria.replaceAll('-', '');
    assert.equal((await reader.admit(admin.id, { ...input, chaveQr: barcode, requestKey: randomUUID(), catracaId: '1' })).decision, 'ALLOW');
    await assert.rejects(reader.inspect(admin.id, input), { code: 'INGRESSO_JA_UTILIZADO' });
    await db.setorEstadioIngressoV1.update({ where: { id: game.sector.id }, data: { numerado: true } });
    await db.loteIngressoPartidaV1.update({ where: { id: lot.id }, data: { quantidadeMaxima: 8 } });
    const numbered = { ...sale, key: randomUUID(), seat: { block: 101, row: 'A', first: 5 } };
    const seats = await counter.sale(seller.id, numbered);
    assert.deepEqual(seats.ingressos.map(i => i.assentoEscolhido).sort(), [5, 6]);
    await assert.rejects(counter.sale(seller.id, { ...numbered, key: randomUUID() }), { code: 'ASSENTO_JA_OCUPADO' });
    await counter.settle(seller.id, numbered.key, false);
    const moderninha = { ...numbered, method: 'PAGBANK', key: randomUUID() };
    assert.equal((await smart.sale(seller.id, moderninha)).ingressos.length, 2);
    const charge = { ...begin, key: moderninha.key };
    const proof = { ...approved, ...await smart.terminal(seller.id, charge), key: charge.key };
    assert.equal((await smart.terminal(seller.id, proof)).status, 'PAGO');
    assert.equal((await smart.terminal(seller.id, proof)).status, 'PAGO');
    assert.ok((await smart.receipt(seller.id, charge.key)).ingressos.every(t => t.status === 'VENDIDO'));
    const another = { ...moderninha, key: randomUUID(), seat: { ...numbered.seat, first: 9 } };
    await smart.sale(seller.id, another);
    const otherClaim = await smart.terminal(seller.id, { ...begin, key: another.key });
    await assert.rejects(smart.terminal(seller.id, { ...proof, key: another.key, ...otherClaim }), { code: 'TERMINAL_REFERENCE_CONFLICT' });
  });
});
