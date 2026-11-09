import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/index.js";
import { createWithdrawalStore } from "../src/models/withdrawal.store.js";
import { createFinanceStore } from "../src/models/finance.store.js";
import {
  recordTicketFinancial,
  DEFAULT_FINANCIAL_POLICY,
} from "../src/lib/ticket-finance.js";
import { decodePayoutAttachment } from "../src/lib/payout-attachments.js";
import * as schemas from "../src/validators/withdrawals.js";
import { createApp } from "../src/http/app.js";
import { routes } from "../src/routes/index.js";
import { inject } from "./helpers/inject.js";
const pdf = {
  name: "../../Comprovante.exe",
  mimeType: "application/pdf",
  base64: Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  ).toString("base64"),
};
const png = {
  name: "Comprovante.png",
  mimeType: "image/png",
  base64:
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1kAAAAASUVORK5CYII=",
};
test("receipt validation rejects spoofed types, invalid encoding, excessive size, multiple parents and unsafe filenames", () => {
  const result = decodePayoutAttachment(pdf);
  assert.ok(result.name.endsWith(".pdf"));
  assert.equal(result.name.includes("/"), false);
  assert.equal(result.name.includes(".exe"), false);
  assert.equal(decodePayoutAttachment(png).mimeType, "image/png");
  for (const input of [
    { ...pdf, mimeType: "image/png" },
    { ...pdf, base64: "YWJj===" },
    {
      ...pdf,
      base64: Buffer.from("<script>alert(1)</script>").toString("base64"),
    },
    { ...pdf, mimeType: "image/svg+xml" },
  ])
    assert.throws(() => decodePayoutAttachment(input));
  assert.throws(
    () =>
      decodePayoutAttachment({
        ...pdf,
        base64: Buffer.alloc(5242881).toString("base64"),
      }),
    { code: "RECEIPT_TOO_LARGE" },
  );
  const parent = { withdrawalId: randomUUID() };
  assert.equal(
    schemas.attachmentUploadSchema.safeParse({ ...parent, ...pdf }).success,
    true,
  );
  assert.equal(
    schemas.attachmentUploadSchema.safeParse({
      ...parent,
      payoutId: randomUUID(),
      ...pdf,
    }).success,
    false,
  );
  assert.equal(
    schemas.withdrawalCreateSchema.safeParse({ amountCents: -1 }).success,
    false,
  );
});
test("withdrawal requests, receipts and content routes require administrator before parsing or querying data", async () => {
  for (const role of ["USER", "GATE", "CASHIER"]) {
    const app = createApp({
      routes,
      authenticate: async () => ({
        user: { id: randomUUID(), role, active: true },
      }),
      logger: { info() {}, error() {} },
    });
    for (const route of routes.filter((r) =>
      r.path.startsWith("/v1/admin/withdrawals"),
    ))
      assert.equal(
        (
          await inject(app, route.path, {
            method: route.method,
            headers: {
              authorization: "Bearer test",
              "content-type": "application/json",
            },
            body: "{}",
          })
        ).status,
        403,
      );
  }
});
test(
  "withdrawals and protected proof attachments against disposable PostgreSQL",
  { timeout: 120000 },
  async (t) => {
    const pg = await PGlite.create(),
      migrations = new URL("../prisma/migrations/", import.meta.url);
    for (const folder of (await readdir(migrations, { withFileTypes: true }))
      .filter((f) => f.isDirectory())
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
    const now = () => new Date(),
      store = createWithdrawalStore(db, { now }),
      finance = createFinanceStore(db, { now });
    const admin = await db.user.create({
      data: {
        name: "Admin saques",
        email: "withdrawal@test.local",
        role: "ADMIN",
        passwordHash: "test",
      },
    });
    const match = await db.match.create({
      data: {
        slug: randomUUID(),
        homeTeam: "Esporte",
        awayTeam: "Teste",
        startsAt: new Date(Date.now() + 86400000),
        stadium: "Teste",
        competition: "Teste",
        sectors: { create: { name: "Sol", priceCents: 10000, capacity: 1000 } },
      },
      include: { sectors: true },
    });
    async function credit(gross) {
      const buyer = await db.user.create({
        data: {
          name: "Comprador teste",
          email: `credit-${randomUUID()}@test.local`,
          passwordHash: "test",
        },
      });
      const ticket = await db.ticket.create({
        data: {
          userId: buyer.id,
          matchId: match.id,
          sectorId: match.sectors[0].id,
          status: "ISSUED",
          priceCents: gross,
          financialPolicy: DEFAULT_FINANCIAL_POLICY,
        },
      });
      const payment = await db.ticketPayment.create({
        data: {
          ticketId: ticket.id,
          method: "MANUAL",
          reference: randomUUID(),
          amountCents: gross,
          confirmedById: admin.id,
        },
      });
      await db.$transaction((tx) =>
        recordTicketFinancial(
          tx,
          { ...ticket, payment },
          { manualFeeCents: 0 },
        ),
      );
      return { ticket, payment };
    }
    const originalCredit = await credit(100000);
    const requestBody = async (amount) => ({
      amountCents: amount,
      expectedAvailableCents: (await store.summary()).availableToRequestCents,
      recipient: "Esporte Clube de Patos",
      pixKey: "chave-teste",
      notes: "Teste",
      requestKey: randomUUID(),
    });
    const sendBody = async (row) => ({
      id: row.id,
      version: row.version,
      expectedBalanceCents: (await store.summary()).availableCents,
      reference: randomUUID(),
      transferredAt: new Date(Date.now() - 1000).toISOString(),
      notes: "Envio teste",
      transferVerified: true,
      requestKey: randomUUID(),
    });
    let first, sent;
    await t.test(
      "request reserves availability without lowering club balance or recording a transfer; duplicate keys do not reserve twice",
      async () => {
        const before = await store.summary(),
          input = await requestBody(30000);
        first = await store.create(admin.id, input);
        assert.equal((await store.create(admin.id, input)).id, first.id);
        const after = await store.summary();
        assert.equal(after.availableCents, before.availableCents);
        assert.equal(after.pendingCents, 30000);
        assert.equal(
          after.availableToRequestCents,
          before.availableToRequestCents - 30000,
        );
        assert.equal(after.totalSentCents, before.totalSentCents);
        await assert.rejects(
          store.create(admin.id, { ...input, amountCents: 100 }),
          { code: "WITHDRAWAL_KEY_CONFLICT" },
        );
        await assert.rejects(
          store.create(admin.id, { ...(await requestBody(1000000)) }),
          { code: "WITHDRAWAL_OVER_BALANCE" },
        );
      },
    );
    await t.test(
      "attachments persist bytes privately, avoid duplicate upload, support removal with an audit trail and stay out of list payloads",
      async () => {
        const file = await store.upload(admin.id, {
          withdrawalId: first.id,
          ...pdf,
        });
        assert.equal(
          (await store.upload(admin.id, { withdrawalId: first.id, ...pdf })).id,
          file.id,
        );
        const list = await store.attachments({ withdrawalId: first.id });
        assert.equal(list.length, 1);
        assert.equal("content" in list[0], false);
        assert.equal("base64" in list[0], false);
        assert.equal("passwordHash" in list[0].actor, false);
        assert.equal((await store.content(file.id)).base64, pdf.base64);
        assert.equal(
          (await store.list({ status: "PENDING" })).items[0]._count.attachments,
          1,
        );
        await store.remove(admin.id, {
          id: file.id,
          reason: "Arquivo incorreto",
        });
        await assert.rejects(store.content(file.id), {
          code: "RECEIPT_NOT_FOUND",
        });
        assert.equal(
          (await store.attachments({ withdrawalId: first.id }))[0]
            .removalReason,
          "Arquivo incorreto",
        );
        assert.equal(
          await db.auditLog.count({
            where: { action: "PAYOUT_RECEIPT_REMOVED", entityId: file.id },
          }),
          1,
        );
        assert.ok(
          (await store.upload(admin.id, { withdrawalId: first.id, ...png })).id,
        );
      },
    );
    await t.test(
      "confirming a request atomically records exactly one payout and prevents replay or cancellation of a sent request",
      async () => {
        const before = await store.summary(),
          input = await sendBody(first);
        sent = await store.send(admin.id, input);
        assert.equal(sent.status, "SENT");
        const replay = await store.send(admin.id, input);
        assert.equal(replay.payoutId, sent.payoutId);
        const after = await store.summary();
        assert.equal(after.pendingCents, 0);
        assert.equal(
          after.availableCents,
          before.availableCents - first.amountCents,
        );
        assert.equal(
          after.totalSentCents,
          before.totalSentCents + first.amountCents,
        );
        assert.equal(await db.clubPayout.count(), 1);
        await assert.rejects(
          store.send(admin.id, {
            ...input,
            requestKey: randomUUID(),
            reference: randomUUID(),
          }),
          { code: "WITHDRAWAL_ALREADY_SENT" },
        );
        await assert.rejects(
          store.cancel(admin.id, {
            id: first.id,
            version: 0,
            reason: "Já foi enviado",
          }),
          { code: "WITHDRAWAL_CHANGED" },
        );
        assert.equal(
          (await finance.payouts({ limit: 25, offset: 0 })).items[0].withdrawal
            .id,
          first.id,
        );
      },
    );
    await t.test(
      "cancel restores request availability and direct payout cannot consume money committed to another request",
      async () => {
        const pending = await store.create(admin.id, await requestBody(20000)),
          summary = await store.summary();
        await assert.rejects(
          finance.payout(admin.id, {
            amountCents: summary.availableCents,
            expectedBalanceCents: summary.availableCents,
            reference: randomUUID(),
            recipient: "Time",
            transferredAt: new Date(Date.now() - 1000).toISOString(),
            notes: "",
            transferVerified: true,
            requestKey: randomUUID(),
          }),
          { code: "PAYOUT_RESERVED" },
        );
        const canceled = await store.cancel(admin.id, {
          id: pending.id,
          version: pending.version,
          reason: "Pedido duplicado",
        });
        assert.equal(canceled.status, "CANCELED");
        assert.equal(
          (await store.summary()).availableToRequestCents,
          summary.availableToRequestCents + 20000,
        );
        await assert.rejects(
          store.upload(admin.id, { withdrawalId: pending.id, ...pdf }),
          { code: "WITHDRAWAL_CLOSED" },
        );
        await assert.rejects(store.send(admin.id, await sendBody(canceled)), {
          code: "WITHDRAWAL_CHANGED",
        });
      },
    );
    await t.test(
      "concurrent requests cannot over-reserve; voiding a mistaken transfer restores balance and marks its request voided",
      async () => {
        const input = await requestBody(
          (await store.summary()).availableToRequestCents,
        );
        const attempts = await Promise.allSettled([
          store.create(admin.id, input),
          store.create(admin.id, { ...input, requestKey: randomUUID() }),
        ]);
        assert.equal(
          attempts.filter((r) => r.status === "fulfilled").length,
          1,
        );
        const pending = attempts.find((r) => r.status === "fulfilled").value;
        await store.cancel(admin.id, {
          id: pending.id,
          version: pending.version,
          reason: "Encerrar teste",
        });
        const before = await store.summary();
        await finance.voidPayout(admin.id, {
          id: sent.payoutId,
          reason: "Registro incorreto conferido",
        });
        assert.equal(
          (await db.withdrawalRequest.findUnique({ where: { id: first.id } }))
            .status,
          "VOIDED",
        );
        assert.equal(
          (await store.summary()).availableCents,
          before.availableCents + first.amountCents,
        );
        const file = await store
          .upload(admin.id, { payoutId: sent.payoutId, ...pdf })
          .catch((error) => error);
        assert.equal(file.code, "PAYOUT_VOIDED");
      },
    );
    await t.test(
      "receipt cap, refund-driven loss of funds and legacy transfers preserve the same accounting rules",
      async () => {
        const request = await store.create(admin.id, await requestBody(100));
        for (let index = 0; index < 5; index++)
          await store.upload(admin.id, {
            withdrawalId: request.id,
            ...pdf,
            base64: Buffer.from(
              Buffer.from(pdf.base64, "base64")
                .toString()
                .replace("1 0 obj", `%proof-${index}\n1 0 obj`),
            ).toString("base64"),
          });
        await assert.rejects(
          store.upload(admin.id, { withdrawalId: request.id, ...png }),
          { code: "RECEIPT_LIMIT" },
        );
        await store.cancel(admin.id, {
          id: request.id,
          version: request.version,
          reason: "Liberar limite para teste",
        });
        const pending = await store.create(
          admin.id,
          await requestBody((await store.summary()).availableToRequestCents),
        );
        const refunded = await db.ticketPayment.update({
          where: { id: originalCredit.payment.id },
          data: { refundedCents: originalCredit.payment.amountCents },
        });
        await db.$transaction((tx) =>
          recordTicketFinancial(
            tx,
            { ...originalCredit.ticket, payment: refunded },
            { manualFeeCents: 0 },
          ),
        );
        assert.equal((await store.summary()).availableToRequestCents, 0);
        await assert.rejects(store.send(admin.id, await sendBody(pending)), {
          code: "PAYOUT_OVER_BALANCE",
        });
        assert.equal(
          (await db.withdrawalRequest.findUnique({ where: { id: pending.id } }))
            .status,
          "PENDING",
        );
        await store.cancel(admin.id, {
          id: pending.id,
          version: pending.version,
          reason: "Saldo alterado por devolução",
        });
        await credit(10000);
        const balance = (await store.summary()).availableCents;
        const legacy = await finance.payout(admin.id, {
          amountCents: balance,
          expectedBalanceCents: balance,
          reference: randomUUID(),
          recipient: "Time",
          transferredAt: new Date(Date.now() - 1000).toISOString(),
          notes: "",
          transferVerified: true,
          requestKey: randomUUID(),
        });
        const proof = await store.upload(admin.id, {
          payoutId: legacy.id,
          ...png,
        });
        assert.equal((await store.content(proof.id)).base64, png.base64);
        assert.equal(
          (await store.attachments({ payoutId: legacy.id })).length,
          1,
        );
      },
    );
  },
);

test("the protected upload parser accepts an actual 5 MB receipt while normal routes retain the small body limit", async () => {
  const upload = routes.find(
    (r) =>
      r.path === "/v1/admin/withdrawals/attachments" && r.method === "POST",
  );
  const app = createApp({
    routes: [
      {
        ...upload,
        handler: async ({ body }) => {
          const file = decodePayoutAttachment(
            schemas.attachmentUploadSchema.parse(body),
          );
          return { data: { byteLength: file.byteLength } };
        },
      },
    ],
    authenticate: async () => ({
      user: { id: randomUUID(), role: "ADMIN", active: true },
    }),
    logger: { info() {}, error() {} },
  });
  const bytes = Buffer.alloc(5 * 1024 * 1024, 32);
  bytes.write("%PDF-1.4");
  bytes.write("%%EOF", bytes.length - 5);
  const response = await inject(app, upload.path, {
    method: "POST",
    headers: {
      authorization: "Bearer test",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...pdf,
      withdrawalId: randomUUID(),
      base64: bytes.toString("base64"),
    }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.byteLength, bytes.length);
});
