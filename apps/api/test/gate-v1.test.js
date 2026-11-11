import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/index.js';
import { createGateV1Store } from '../src/models/gate-v1.store.js';
import { signTicketV1Token, verifyTicketV1TokenSignature } from '../src/lib/ingresso-v1-token.js';
import { gateV1AdmitSchema, gateV1InspectSchema, gateV1HistorySchema } from '../src/validators/gate-v1.js';
import { createApp } from '../src/http/app.js';
import { routes } from '../src/routes/index.js';
import { inject } from './helpers/inject.js';

const secret = 'test-gate-key-'.repeat(8);
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
    assert.equal(manual.id, a.id); assert.equal(manual.cpfTitular, undefined); assert.equal(manual.chaveQr, undefined);
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
});
