import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/index.js";
import {
  calculateTicketAllocation,
  recordTicketFinancial,
  captureFinancialPolicy,
  DEFAULT_FINANCIAL_POLICY,
} from "../src/lib/ticket-finance.js";
import {
  createFinanceStore,
  nextPayoutDate,
} from "../src/models/finance.store.js";
import { createTicketCheckoutStore } from "../src/models/ticket-checkout.store.js";
import { createAdminReportsStore } from "../src/models/admin-reports.store.js";
import { routes } from "../src/routes/index.js";
import { createApp } from "../src/http/app.js";
import { inject } from "./helpers/inject.js";
import { productImage } from "../src/validators/shop.js";
import imageManifest from "../prisma/shop-demo-images.json" with { type: "json" };
test("ticket allocations conserve every cent across fees, fractional commissions and partial/full refunds", () => {
  const net = calculateTicketAllocation(10000, 0, 99, DEFAULT_FINANCIAL_POLICY);
  assert.equal(net.companyCents, 990);
  assert.equal(net.clubCents, 8911);
  const gross = calculateTicketAllocation(10000, 0, 99, {
    ...DEFAULT_FINANCIAL_POLICY,
    commissionBase: "GROSS",
  });
  assert.equal(gross.companyCents, 1000);
  assert.equal(gross.clubCents, 8901);
  const refunded = calculateTicketAllocation(
    10000,
    10000,
    99,
    DEFAULT_FINANCIAL_POLICY,
  );
  assert.equal(refunded.companyCents, 0);
  assert.equal(refunded.clubCents, -99);
  for (let amount = 1; amount < 2000; amount += 19)
    for (const companyBps of [0, 1, 1000, 3333, 10000])
      for (const refundedCents of [0, Math.floor(amount / 2), amount]) {
        const row = calculateTicketAllocation(amount, refundedCents, 99, {
          ...DEFAULT_FINANCIAL_POLICY,
          companyBps,
        });
        assert.equal(
          row.grossCents - row.refundedCents,
          row.gatewayFeeCents + row.companyCents + row.clubCents,
        );
      }
  assert.throws(() =>
    calculateTicketAllocation(100, 101, 0, DEFAULT_FINANCIAL_POLICY),
  );
  assert.throws(() =>
    calculateTicketAllocation(100, 0, -1, DEFAULT_FINANCIAL_POLICY),
  );
});
test("weekly schedule respects the club timezone and a transfer already made on the scheduled day", () => {
  const now = new Date("2026-11-13T15:00:00Z");
  assert.equal(
    nextPayoutDate(5, new Date("2026-11-06T15:00:00Z"), now).due,
    true,
  );
  assert.equal(nextPayoutDate(5, now, now).due, false);
  assert.equal(nextPayoutDate(5, now, now).nextDay, "2026-11-20");
});
test("finance routes require active ADMIN before touching the database", async () => {
  const app = createApp({
    routes,
    authenticate: async () => ({
      user: { id: randomUUID(), role: "USER", active: true },
    }),
    logger: { info() {}, error() {} },
  });
  for (const route of routes.filter((route) =>
    route.path.startsWith("/v1/admin/finance"),
  )) {
    const response = await inject(app, route.path, {
      method: route.method,
      headers: {
        Authorization: "Bearer test.header.signature",
        "Content-Type": "application/json",
      },
      body: route.method === "GET" ? undefined : "{}",
    });
    assert.equal(response.status, 403);
  }
});
test("catalogue images are public but restricted to the versioned asset directory", async () => {
  const app = createApp({ routes: [], logger: { info() {}, error() {} } });
  const asset = await inject(app, imageManifest.bone, {
    headers: { Range: "bytes=0-63" },
  });
  assert.equal(asset.status, 206);
  assert.match(asset.headers.get("content-type"), /image\/png/);
  assert.equal(asset.headers.get("content-length"), "64");
  assert.match(asset.headers.get("cache-control"), /immutable/);
  for (const value of [
    "/media/shop/../../.env",
    "/media/shop/.env",
    "http://remote.test/image.png",
    "javascript:alert(1)",
  ])
    assert.equal(productImage.safeParse(value).success, false);
  assert.equal((await inject(app, "/media/shop/.env")).status, 404);
});
test(
  "ticket finance, immutable deltas and manual weekly payouts against disposable PostgreSQL",
  { timeout: 120000 },
  async (t) => {
    const pg = await PGlite.create(),
      migrations = new URL("../prisma/migrations/", import.meta.url);
    for (const folder of (await readdir(migrations, { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name)))
      await pg.exec(
        await readFile(
          new URL(`${folder.name}/migration.sql`, migrations),
          "utf8",
        ),
      );
    const socket = new PGLiteSocketServer({
      db: pg,
      port: 0,
      host: "127.0.0.1",
      maxConnections: 1,
    });
    await socket.start();
    const db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`,
        max: 1,
      }),
    });
    t.after(async () => {
      await db.$disconnect();
      await socket.stop();
      await pg.close();
    });
    const clock = new Date(),
      now = () => clock,
      store = createFinanceStore(db, { now });
    const admin = await db.user.create({
      data: {
        name: "Admin financeiro",
        email: "finance-admin@test.local",
        role: "ADMIN",
        passwordHash: "test",
      },
    });
    const buyer = await db.user.create({
      data: {
        name: "Comprador financeiro",
        email: "finance-buyer@test.local",
        passwordHash: "test",
      },
    });
    const match = await db.match.create({
      data: {
        slug: randomUUID(),
        homeTeam: "Esporte",
        awayTeam: "Visitante",
        stadium: "Estádio teste",
        competition: "Teste",
        startsAt: new Date(clock.getTime() + 86400000),
        published: true,
        sectors: { create: { name: "Sol", priceCents: 10000, capacity: 1000 } },
      },
      include: { sectors: true },
    });
    const sectorId = match.sectors[0].id;
    async function receipt({
      gross = 10000,
      fee = 99,
      policy = DEFAULT_FINANCIAL_POLICY,
      source = "PROVIDER",
      legacy = false,
    } = {}) {
      const user = await db.user.create({
        data: {
          name: "Titular teste",
          email: `finance-${randomUUID()}@test.local`,
          passwordHash: "test",
        },
      });
      const ticket = await db.ticket.create({
        data: {
          userId: user.id,
          matchId: match.id,
          sectorId,
          status: "ISSUED",
          priceCents: gross,
          ...(!legacy ? { financialPolicy: policy } : {}),
        },
      });
      const payment = await db.ticketPayment.create({
        data: {
          ticketId: ticket.id,
          method: source === "MANUAL" ? "MANUAL" : "ASAAS",
          reference: `ASAAS:pay_${randomUUID()}`,
          amountCents: gross,
          confirmedById: source === "MANUAL" ? admin.id : null,
        },
      });
      const financial = await db.$transaction((tx) =>
        recordTicketFinancial(
          tx,
          { ...ticket, payment },
          {
            ...(source === "PROVIDER"
              ? { providerNetCents: gross - fee }
              : source === "MANUAL"
                ? { manualFeeCents: fee }
                : {}),
          },
        ),
      );
      return { ticket, payment, financial };
    }
    const payoutBody = (amount, balance = amount) => ({
      amountCents: amount,
      expectedBalanceCents: balance,
      reference: randomUUID(),
      recipient: "Esporte Clube de Patos",
      transferredAt: clock.toISOString(),
      notes: "Repasse semanal de teste",
      transferVerified: true,
      requestKey: randomUUID(),
    });
    await t.test(
      "reservation freezes 10/90 policy while future settings change independently",
      async () => {
        const checkout = createTicketCheckoutStore(db, { now }),
          ticket = await checkout.reserve(buyer.id, {
            matchId: match.id,
            sectorId,
            quantity: 1,
          });
        let saved = await store.settings();
        assert.equal(saved.companyBps, 1000);
        assert.equal(saved.commissionBase, "NET");
        const { id, updatedAt, ...input } = saved;
        await store.saveSettings(admin.id, { ...input, companyBps: 2000 });
        assert.equal(
          (await db.ticket.findUnique({ where: { id: ticket.id } }))
            .financialPolicy.companyBps,
          1000,
        );
        await assert.rejects(store.saveSettings(admin.id, input), {
          code: "FINANCE_SETTINGS_CHANGED",
        });
        const current = await store.settings();
        await store.saveSettings(admin.id, {
          ...input,
          version: current.version,
        });
      },
    );
    await t.test(
      "receipt and replays create one allocation; aggregate report balances gross, refund, company, team and fees",
      async () => {
        const { ticket, payment, financial } = await receipt();
        assert.equal(financial.companyCents, 990);
        assert.equal(financial.clubCents, 8911);
        await db.$transaction((tx) =>
          recordTicketFinancial(
            tx,
            { ...ticket, payment },
            { providerNetCents: 9901 },
          ),
        );
        assert.equal(
          await db.ticketFinancialEntry.count({
            where: { financialId: financial.id },
          }),
          1,
        );
        const summary = await store.summary();
        assert.equal(
          summary.grossCents - summary.refundedCents,
          summary.gatewayFeeCents +
            summary.companyCents +
            summary.clubEarnedCents,
        );
        assert.equal(summary.availableCents, 8911);
        const report = await createAdminReportsStore(db).sales({
          limit: 25,
          offset: 0,
          deleted: "all",
        });
        assert.equal(report.summary.companyCents, 990);
        assert.equal(report.summary.clubCents, 8911);
      },
    );
    await t.test(
      "estimated fees stay outside transferable funds; actual gateway fee reconciles by delta once",
      async () => {
        const before = await store.summary(),
          { ticket, payment, financial } = await receipt({
            source: "ESTIMATED",
            policy: { ...DEFAULT_FINANCIAL_POLICY, gatewayFixedCents: 250 },
          });
        assert.equal(
          (await store.summary()).availableCents,
          before.availableCents,
        );
        assert.equal(financial.feeSource, "ESTIMATED");
        const actual = await db.$transaction((tx) =>
          recordTicketFinancial(
            tx,
            { ...ticket, payment },
            { providerNetCents: 9901 },
          ),
        );
        assert.equal(actual.gatewayFeeCents, 99);
        assert.equal(actual.clubCents, 8911);
        const delta = await db.ticketFinancialEntry.aggregate({
          where: { financialId: financial.id },
          _sum: {
            companyDeltaCents: true,
            clubDeltaCents: true,
            gatewayDeltaCents: true,
          },
        });
        assert.equal(delta._sum.clubDeltaCents, actual.clubCents);
        assert.equal(delta._sum.companyDeltaCents, actual.companyCents);
      },
    );
    await t.test(
      "recording a full manual payout zeros available balance but preserves company money and receipt history",
      async () => {
        const before = await store.summary(),
          body = payoutBody(before.availableCents),
          payout = await store.payout(admin.id, body);
        assert.equal(payout.amountCents, before.availableCents);
        const after = await store.summary();
        assert.equal(after.outstandingCents, 0);
        assert.equal(after.availableCents, 0);
        assert.equal(after.companyCents, before.companyCents);
        assert.equal((await store.payout(admin.id, body)).id, payout.id);
        await assert.rejects(
          store.payout(admin.id, { ...body, amountCents: 1 }),
          { code: "PAYOUT_KEY_CONFLICT" },
        );
        assert.equal(await db.clubPayout.count(), 1);
        await assert.rejects(store.payout(admin.id, payoutBody(1, 0)), {
          code: "PAYOUT_OVER_BALANCE",
        });
      },
    );
    await t.test(
      "two operators cannot spend the same team balance; stale values, future dates and duplicate references fail safely",
      async () => {
        await receipt();
        const before = await store.summary(),
          bodies = [
            payoutBody(before.availableCents),
            payoutBody(before.availableCents),
          ];
        const results = await Promise.allSettled(
          bodies.map((body) => store.payout(admin.id, body)),
        );
        assert.equal(
          results.filter((row) => row.status === "fulfilled").length,
          1,
        );
        assert.equal(
          results.find((row) => row.status === "rejected").reason.code,
          "PAYOUT_BALANCE_CHANGED",
        );
        await receipt();
        const fresh = await store.summary();
        await assert.rejects(
          store.payout(
            admin.id,
            payoutBody(fresh.availableCents, fresh.availableCents - 1),
          ),
          { code: "PAYOUT_BALANCE_CHANGED" },
        );
        await assert.rejects(
          store.payout(admin.id, {
            ...payoutBody(fresh.availableCents),
            transferredAt: new Date(clock.getTime() + 86400000).toISOString(),
          }),
          { code: "PAYOUT_FUTURE" },
        );
      },
    );
    await t.test(
      "refund after payout preserves a debit for next week, and repeated refund does not subtract twice",
      async () => {
        const { ticket, payment } = await receipt();
        const before = await store.summary();
        await store.payout(admin.id, payoutBody(before.availableCents));
        const refunded = await db.ticketPayment.update({
          where: { id: payment.id },
          data: { refundedCents: payment.amountCents },
        });
        const entry = await db.$transaction((tx) =>
          recordTicketFinancial(
            tx,
            { ...ticket, payment: refunded },
            { providerNetCents: 9901, reason: "Estorno integral" },
          ),
        );
        assert.equal(entry.companyCents, 0);
        assert.equal(entry.clubCents, -99);
        const after = await store.summary();
        assert.equal(after.availableCents, 0);
        assert.equal(after.outstandingCents, -9010);
        await db.$transaction((tx) =>
          recordTicketFinancial(
            tx,
            { ...ticket, payment: refunded },
            { providerNetCents: 9901, reason: "Repetição do estorno" },
          ),
        );
        assert.equal((await store.summary()).outstandingCents, -9010);
      },
    );
    await t.test(
      "voiding an erroneous payout record restores balance once without deleting original history",
      async () => {
        const row = await db.clubPayout.findFirst();
        const before = await store.summary();
        await store.voidPayout(admin.id, {
          id: row.id,
          reason: "Comprovante lançado por engano",
        });
        const after = await store.summary();
        assert.equal(
          after.outstandingCents,
          before.outstandingCents + row.amountCents,
        );
        await store.voidPayout(admin.id, {
          id: row.id,
          reason: "Mesmo lançamento",
        });
        assert.equal(
          (await store.summary()).outstandingCents,
          after.outstandingCents,
        );
      },
    );
    await t.test(
      "legacy receipts remain separate until explicit audited adoption",
      async () => {
        await receipt({ legacy: true, source: "MANUAL", fee: 0 });
        const before = await store.summary();
        assert.equal(before.legacyCount, 1);
        const adopted = await store.adoptLegacy(
          admin.id,
          "Contrato conferido com o clube para recebimentos antigos",
        );
        assert.equal(adopted.adopted, 1);
        assert.equal((await store.summary()).legacyCount, 0);
        assert.equal(
          await db.auditLog.count({
            where: { action: "LEGACY_TICKET_FINANCE_ADOPTED" },
          }),
          1,
        );
      },
    );
    await t.test("unissued refund fees remain in the global balance without creating a receipt", async () => {
      const before = await store.summary();
      const user = await db.user.create({ data: { name: "Pagamento tardio", email: `late-${randomUUID()}@test.local`, passwordHash: "test" } });
      const ticket = await db.ticket.create({ data: { userId: user.id, matchId: match.id, sectorId, status: "CANCELED", priceCents: 5000 } });
      const customer = await db.billingCustomer.create({ data: { userId: user.id, environment: "sandbox", documentEncrypted: "test-only", documentLast4: "4725" } });
      const intent = await db.gatewayIntent.create({ data: { environment: "sandbox", generation: randomUUID(), ticketId: ticket.id, customerId: customer.id, amountCents: 5000, refundedCents: 5000, netCents: 4900, expiresAt: clock, state: "REFUNDED", snapshot: { userId: user.id } } });
      await db.ticketRefundCost.create({ data: { intentId: intent.id, grossCents: 5000, refundedCents: 5000, gatewayFeeCents: 100 } });
      const after = await store.summary();
      assert.equal(after.grossCents, before.grossCents + 5000);
      assert.equal(after.refundedCents, before.refundedCents + 5000);
      assert.equal(after.gatewayFeeCents, before.gatewayFeeCents + 100);
      assert.equal(after.outstandingCents, before.outstandingCents - 100);
      assert.equal(after.companyCents, before.companyCents);
      assert.equal(after.grossCents - after.refundedCents, after.gatewayFeeCents + after.companyCents + after.clubEarnedCents);
      assert.equal(await db.ticketPayment.count({ where: { ticketId: ticket.id } }), 0);
    });
  },
);
