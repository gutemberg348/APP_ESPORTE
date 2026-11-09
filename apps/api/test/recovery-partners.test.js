import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client/index.js";
import { createPasswordRecoveryStore } from "../src/models/password-recovery.store.js";
import { createPartnerStore } from "../src/models/partner.store.js";
import { createStaffModel } from "../src/models/staff.model.js";
import { createAdminAccountStore } from "../src/models/admin-account.store.js";
import { accountUpdateSchema } from "../src/validators/accounts.js";
import { employeeUpdateSchema } from "../src/validators/staff.js";
import { createMailCipher, createSmtpMailer } from "../src/lib/mail.js";
import {
  hashToken,
  newSessionToken,
  hashPassword,
  verifyPassword,
} from "../src/lib/crypto.js";
import {
  partnerCreateSchema,
  benefitCreateSchema,
} from "../src/validators/partners.js";
import { createApp } from "../src/http/app.js";
import { routes } from "../src/routes/index.js";
import { inject } from "./helpers/inject.js";

test("new admin routes reject supporters, gate and cashier accounts before database access", async () => {
  for (const role of ["USER", "GATE", "CASHIER"]) {
    const app = createApp({
      routes,
      authenticate: async () => ({
        user: { id: randomUUID(), active: true, role },
      }),
      logger: { info() {}, error() {} },
    });
    for (const route of routes.filter(
      (r) =>
        r.path.startsWith("/v1/admin/partners") ||
        r.path.startsWith("/v1/admin/email") ||
        r.path === "/v1/admin/users/recovery" ||
        r.path === "/v1/admin/users/detail" ||
        (r.path === "/v1/admin/users" && r.method === "PATCH"),
    )) {
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
        `${role} ${route.path}`,
      );
    }
  }
});
test("recovery endpoints validate input, keep tokens out of query strings and do not expose account existence", async () => {
  const app = createApp({ routes, logger: { info() {}, error() {} } });
  for (const path of [
    "/v1/auth/reset-password",
    "/v1/auth/reset-password/validate",
    "/v1/auth/forgot-password",
  ]) {
    assert.equal(
      (
        await inject(app, path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
      422,
    );
  }
  const responses = [];
  for (const email of ["missing@test.local", "admin@nacional.local"])
    responses.push(
      await inject(app, "/v1/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      }),
    );
  assert.equal(responses[0].status, 503);
  const [first, second] = await Promise.all(responses.map((r) => r.json()));
  assert.equal(first.error.code, second.error.code);
  assert.equal(first.error.message, second.error.message);
});
test("partner validators reject unsafe links, invalid percentages and reversed validity windows", () => {
  const input = {
    name: "Loja teste",
    discount: "10% off",
    category: "Compras",
  };
  assert.equal(partnerCreateSchema.safeParse(input).success, true);
  for (const website of [
    "javascript:alert(1)",
    "http://loja.test",
    "https://user:pass@loja.test",
  ])
    assert.equal(
      partnerCreateSchema.safeParse({ ...input, website }).success,
      false,
    );
  assert.equal(
    partnerCreateSchema.safeParse({
      ...input,
      offer: {
        cashbackBps: 8000,
        commissionBps: 3000,
        active: true,
        customerQrEnabled: false,
      },
    }).success,
    false,
  );
  assert.equal(
    benefitCreateSchema.safeParse({
      partnerId: randomUUID(),
      title: "Teste",
      active: true,
      startsAt: "2026-11-10T00:00:00Z",
      endsAt: "2026-11-09T00:00:00Z",
    }).success,
    false,
  );
});
test("account editing requires a version, rejects privilege injection and accepts optional strong password for both account types", () => {
  const input = {
    userId: randomUUID(),
    updatedAt: new Date().toISOString(),
    name: "Nome atualizado",
    city: "Patos",
    contact: "83999999999",
  };
  assert.equal(accountUpdateSchema.safeParse(input).success, true);
  for (const extra of [
    { password: "" },
    { password: "short" },
    { role: "ADMIN" },
    { points: 10000 },
    { passwordHash: "injected" },
    { contact: "invalid" },
  ])
    assert.equal(
      accountUpdateSchema.safeParse({ ...input, ...extra }).success,
      false,
    );
  assert.equal(
    accountUpdateSchema.safeParse({ ...input, updatedAt: undefined }).success,
    false,
  );
  assert.equal(
    employeeUpdateSchema.safeParse({
      ...input,
      role: "CASHIER",
      password: "NovaSenhaSegura123!",
    }).success,
    true,
  );
  assert.equal(
    employeeUpdateSchema.safeParse({ ...input, role: "USER" }).success,
    false,
  );
});
test("mail payloads are authenticated encryption; SMTP credentials are never included in messages", async () => {
  const cipher = createMailCipher("a".repeat(64)),
    payload = cipher.encrypt({
      token: "plain-token",
      email: "person@test.local",
    });
  assert.equal(payload.includes("plain-token"), false);
  assert.equal(cipher.decrypt(payload).token, "plain-token");
  assert.throws(() => createMailCipher("b".repeat(64)).decrypt(payload));
  let options, message;
  const mailer = createSmtpMailer(
    {
      SMTP_HOST: "smtp.test",
      SMTP_PORT: 587,
      SMTP_USER: "u",
      SMTP_PASSWORD: "secret",
      SMTP_FROM_EMAIL: "noreply@test.local",
      SMTP_FROM_NAME: "Esporte",
      SMTP_SECURE: false,
    },
    (config) => {
      options = config;
      return {
        verify: async () => true,
        sendMail: async (mail) => {
          message = mail;
          return { accepted: [mail.to] };
        },
      };
    },
  );
  await mailer.send({
    to: "person@test.local",
    name: "<img onerror=bad>",
    url: "https://app.test/reset-password#token=abc&portal=app",
    minutes: 15,
    deliveryId: "test-id",
  });
  assert.equal(options.requireTLS, true);
  assert.equal(options.tls.rejectUnauthorized, true);
  assert.equal(options.disableFileAccess, true);
  assert.equal(options.disableUrlAccess, true);
  assert.equal(message.to, "person@test.local");
  assert.equal(message.messageId, "<recovery-test-id@test.local>");
  assert.equal(JSON.stringify(message).includes("secret"), false);
  assert.equal(message.html.includes("<img onerror=bad>"), false);
  assert.ok(message.html.includes("&lt;img"));
  assert.ok(
    message.text.includes(
      "https://app.test/reset-password#token=abc&portal=app",
    ),
  );
});
test(
  "recovery, partners and employees against disposable PostgreSQL",
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
    let clock = new Date(Date.now() + 10000);
    const now = () => clock,
      advance = (ms) => {
        clock = new Date(clock.getTime() + ms);
      };
    const cipher = createMailCipher("k".repeat(64));
    const recovery = createPasswordRecoveryStore(db, {
      cipher,
      now,
      ttlMinutes: 15,
      publicUrl: "https://clube.test/reset-password",
    });
    const user = (role = "USER") =>
      db.user.create({
        data: {
          name: `Teste ${role}`,
          email: `${randomUUID()}@test.local`,
          passwordHash: "hash-before-reset",
          role,
        },
      });
    const admin = await user("ADMIN"),
      cashier = await user("CASHIER"),
      gate = await user("GATE"),
      fan = await user();
    await t.test(
      "unknown and inactive accounts receive no mail or tokens",
      async () => {
        await recovery.issue("unknown@test.local", newSessionToken());
        const inactive = await user();
        await db.user.update({
          where: { id: inactive.id },
          data: { active: false },
        });
        await recovery.issue(inactive.email, newSessionToken());
        assert.equal(await db.passwordResetToken.count(), 0);
      },
    );
    await t.test(
      "tokens are hashed, queued payload is encrypted, cooldown is durable and send clears payload",
      async () => {
        const token = newSessionToken();
        await recovery.issue(fan.email, token, "ADMIN");
        const row = await db.passwordResetToken.findUnique({
          where: { tokenHash: hashToken(token) },
          include: { delivery: true },
        });
        assert.ok(row);
        assert.notEqual(row.tokenHash, token);
        assert.equal(row.delivery.payload.includes(token), false);
        await recovery.issue(fan.email, newSessionToken());
        assert.equal(
          await db.passwordResetToken.count({ where: { userId: fan.id } }),
          1,
        );
        const sent = [];
        await recovery.deliver({ send: async (message) => sent.push(message) });
        assert.equal(sent.length, 1);
        const url = new URL(sent[0].url);
        assert.equal(url.search, "");
        assert.equal(
          new URLSearchParams(url.hash.slice(1)).get("token"),
          token,
        );
        const mail = await db.mailDelivery.findUnique({
          where: { id: row.delivery.id },
        });
        assert.equal(mail.status, "SENT");
        assert.equal(mail.payload, null);
        assert.equal((await recovery.inspect(token)).valid, true);
        await db.session.create({
          data: {
            userId: fan.id,
            tokenHash: hashToken(newSessionToken()),
            expiresAt: new Date(clock.getTime() + 86400000),
          },
        });
        await recovery.consume(token, "hash-after-reset");
        assert.equal(
          (await db.user.findUnique({ where: { id: fan.id } })).passwordHash,
          "hash-after-reset",
        );
        assert.equal(
          await db.session.count({
            where: { userId: fan.id, revokedAt: null },
          }),
          0,
        );
        await assert.rejects(recovery.consume(token, "hash-replayed"), {
          code: "RESET_LINK_INVALID",
        });
      },
    );
    await t.test(
      "expired, deactivated, changed-email and changed-password tokens cannot reset or send mail",
      async () => {
        for (const kind of ["expired", "inactive", "email", "password"]) {
          const u = await user(),
            token = newSessionToken();
          await recovery.issue(u.email, token);
          if (kind === "expired") advance(16 * 60000);
          else
            await db.user.update({
              where: { id: u.id },
              data:
                kind === "inactive"
                  ? { active: false }
                  : kind === "email"
                    ? { email: `${randomUUID()}@test.local` }
                    : { passwordHash: "new-password" },
            });
          await assert.rejects(recovery.inspect(token), {
            code: "RESET_LINK_INVALID",
          });
          await assert.rejects(recovery.consume(token, "bad"), {
            code: "RESET_LINK_INVALID",
          });
          let sent = false;
          await recovery.deliver({
            send: async () => {
              sent = true;
            },
          });
          assert.equal(sent, false);
        }
      },
    );
    await t.test(
      "new links invalidate previous links and simultaneous use succeeds only once",
      async () => {
        const u = await user(),
          old = newSessionToken(),
          fresh = newSessionToken();
        await recovery.issue(u.email, old);
        advance(61000);
        await recovery.issue(u.email, fresh);
        await assert.rejects(recovery.inspect(old), {
          code: "RESET_LINK_INVALID",
        });
        const results = await Promise.allSettled([
          recovery.consume(fresh, "winner-one"),
          recovery.consume(fresh, "winner-two"),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          await db.passwordResetToken.count({
            where: { userId: u.id, usedAt: null },
          }),
          0,
        );
      },
    );
    await t.test(
      "SMTP failures retry without exposing provider errors and stop after five attempts",
      async () => {
        const u = await user(),
          token = newSessionToken();
        await recovery.issue(u.email, token);
        for (let attempt = 0; attempt < 5; attempt++) {
          await recovery.deliver({
            send: async () => {
              throw new Error("secret-user SMTP password");
            },
          });
          advance(15001 * 2 ** attempt);
        }
        const mail = await db.mailDelivery.findFirst({
          where: { reset: { userId: u.id } },
        });
        assert.equal(mail.status, "FAILED");
        assert.equal(mail.attempts, 5);
        assert.equal(mail.payload, null);
        assert.equal(mail.errorCode, "SMTP_DELIVERY_FAILED");
      },
    );
    await db.tenant.create({ data: { slug: "test-club", name: "Teste" } });
    const partners = createPartnerStore(db, "test-club"),
      staff = createStaffModel(db);
    const accounts = createAdminAccountStore(db);
    await t.test(
      "supporter editing without a password preserves credentials, sessions and valid recovery links",
      async () => {
        const u = await user(),
          token = newSessionToken();
        await recovery.issue(u.email, token);
        const session = await db.session.create({
          data: {
            userId: u.id,
            tokenHash: hashToken(newSessionToken()),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        const detail = await accounts.detail(u.id);
        assert.equal("passwordHash" in detail, false);
        const changed = await accounts.update(admin.id, {
          userId: u.id,
          updatedAt: detail.updatedAt.toISOString(),
          name: "Torcedor editado",
          city: "Patos",
          contact: "83999999999",
        });
        assert.equal(changed.name, "Torcedor editado");
        assert.equal(changed.city, "Patos");
        assert.equal(changed.contact, "83999999999");
        assert.equal(
          (await db.user.findUnique({ where: { id: u.id } })).passwordHash,
          u.passwordHash,
        );
        assert.equal(
          (await db.session.findUnique({ where: { id: session.id } }))
            .revokedAt,
          null,
        );
        assert.equal((await recovery.inspect(token)).valid, true);
      },
    );
    await t.test(
      "supporter edits atomically change profile and password, revoke sessions and invalidate recovery; audit never stores secrets",
      async () => {
        const u = await user(),
          token = newSessionToken();
        await recovery.issue(u.email, token);
        await db.session.create({
          data: {
            userId: u.id,
            tokenHash: hashToken(newSessionToken()),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        const password = "NovaSenhaDeAcesso123!",
          passwordHash = await hashPassword(password);
        const changed = await accounts.update(admin.id, {
          userId: u.id,
          updatedAt: u.updatedAt.toISOString(),
          name: "Nome e senha alterados",
          email: `${randomUUID()}@test.local`,
          passwordHash,
        });
        assert.equal(changed.name, "Nome e senha alterados");
        assert.equal("passwordHash" in changed, false);
        assert.equal(
          await verifyPassword(
            password,
            (await db.user.findUnique({ where: { id: u.id } })).passwordHash,
          ),
          true,
        );
        assert.equal(
          await db.session.count({ where: { userId: u.id, revokedAt: null } }),
          0,
        );
        await assert.rejects(recovery.inspect(token), {
          code: "RESET_LINK_INVALID",
        });
        const delivery = await db.mailDelivery.findFirst({
          where: { reset: { userId: u.id } },
        });
        assert.equal(delivery.status, "SKIPPED");
        assert.equal(delivery.payload, null);
        const audit = await db.auditLog.findFirst({
          where: { entityId: u.id, action: "ACCOUNT_UPDATED" },
        });
        assert.equal(audit.details.passwordChanged, true);
        assert.equal(JSON.stringify(audit.details).includes(password), false);
        assert.equal(
          JSON.stringify(audit.details).includes(passwordHash),
          false,
        );
        await assert.rejects(
          accounts.update(admin.id, {
            userId: u.id,
            updatedAt: u.updatedAt.toISOString(),
            name: "Stale",
          }),
          { code: "ACCOUNT_CHANGED" },
        );
      },
    );
    await t.test(
      "duplicate email rolls back both profile and password and keeps the existing login session",
      async () => {
        const u = await user();
        const session = await db.session.create({
          data: {
            userId: u.id,
            tokenHash: hashToken(newSessionToken()),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        await assert.rejects(
          accounts.update(admin.id, {
            userId: u.id,
            updatedAt: u.updatedAt.toISOString(),
            name: "Must roll back",
            email: admin.email,
            passwordHash: "must-not-save",
          }),
          { code: "P2002" },
        );
        const fresh = await db.user.findUnique({ where: { id: u.id } });
        assert.equal(fresh.name, u.name);
        assert.equal(fresh.passwordHash, u.passwordHash);
        assert.equal(
          (await db.session.findUnique({ where: { id: session.id } }))
            .revokedAt,
          null,
        );
        assert.equal(
          await db.auditLog.count({
            where: { entityId: u.id, action: "ACCOUNT_UPDATED" },
          }),
          0,
        );
      },
    );
    await t.test(
      "employee form can update city, contact and password together and invalidate previous recovery links",
      async () => {
        const employee = await user("GATE"),
          token = newSessionToken();
        await recovery.issue(employee.email, token);
        const changed = await staff.update(admin.id, {
          userId: employee.id,
          updatedAt: employee.updatedAt.toISOString(),
          name: "Funcionário editado",
          city: "Patos",
          contact: "83999999999",
          passwordHash: "employee-new-hash",
        });
        assert.equal(changed.name, "Funcionário editado");
        assert.equal(changed.city, "Patos");
        assert.equal("passwordHash" in changed, false);
        assert.equal(
          (await db.user.findUnique({ where: { id: employee.id } }))
            .passwordHash,
          "employee-new-hash",
        );
        await assert.rejects(recovery.inspect(token), {
          code: "RESET_LINK_INVALID",
        });
      },
    );
    const input = partnerCreateSchema.parse({
      name: "Mercado teste",
      category: "Mercado",
      discount: "10% de desconto",
      offer: {
        cashbackBps: 1000,
        commissionBps: 200,
        active: true,
        customerQrEnabled: false,
      },
    });
    let partner;
    await t.test(
      "partner creation links a merchant and tenant offer without leaking operator accounts publicly",
      async () => {
        partner = await partners.create(admin.id, input);
        assert.ok(partner.merchant);
        assert.equal(partner.merchant.offers[0].cashbackBps, 1000);
        const result = await partners.publicList();
        assert.equal(result.length, 1);
        assert.equal("merchant" in result[0], false);
        assert.equal((await partners.list({ search: "Mercado" })).total, 1);
        const { passwordHash } = JSON.parse(
          JSON.stringify(partner.merchant.operators[0]?.user || {}),
        );
        assert.equal(passwordHash, undefined);
      },
    );
    await t.test(
      "benefits only publish inside their validity window; updates reject stale versions",
      async () => {
        const at = new Date(),
          base = {
            partnerId: partner.id,
            title: "Oferta válida",
            description: "Teste",
            conditions: "Teste",
            active: true,
            startsAt: null,
            endsAt: null,
          };
        const offer = await partners.benefit(admin.id, base);
        await partners.benefit(admin.id, {
          ...base,
          title: "Futura",
          startsAt: new Date(at.getTime() + 86400000),
          endsAt: null,
        });
        await partners.benefit(admin.id, {
          ...base,
          title: "Encerrada",
          endsAt: new Date(at.getTime() - 86400000),
        });
        assert.deepEqual(
          (await partners.publicList())[0].benefits.map((b) => b.title),
          ["Oferta válida"],
        );
        await partners.benefit(admin.id, {
          ...base,
          id: offer.id,
          updatedAt: offer.updatedAt.toISOString(),
          active: false,
        });
        await assert.rejects(
          partners.benefit(admin.id, {
            ...base,
            id: offer.id,
            updatedAt: offer.updatedAt.toISOString(),
          }),
          { code: "BENEFIT_CHANGED" },
        );
        await assert.rejects(
          partners.update(admin.id, {
            ...input,
            id: partner.id,
            updatedAt: partner.updatedAt.toISOString(),
          }),
          { code: "PARTNER_CHANGED" },
        );
        partner = (await partners.list()).items[0];
      },
    );
    await t.test(
      "cashier permissions reject supporters and gate staff; updates can remove access immediately",
      async () => {
        for (const employee of [fan, gate])
          await assert.rejects(
            partners.operators(admin.id, {
              partnerId: partner.id,
              updatedAt: partner.updatedAt.toISOString(),
              userIds: [employee.id],
            }),
            { code: "INVALID_CASHIER" },
          );
        partner = await partners.operators(admin.id, {
          partnerId: partner.id,
          updatedAt: partner.updatedAt.toISOString(),
          userIds: [cashier.id],
        });
        assert.equal(partner.merchant.operators[0].active, true);
        assert.equal(
          "passwordHash" in partner.merchant.operators[0].user,
          false,
        );
        partner = await partners.operators(admin.id, {
          partnerId: partner.id,
          updatedAt: partner.updatedAt.toISOString(),
          userIds: [],
        });
        assert.equal(partner.merchant.operators[0].active, false);
      },
    );
    await t.test(
      "employee editing preserves last administrator, rejects stale edits and revokes sessions on role change",
      async () => {
        await assert.rejects(
          staff.update(admin.id, { userId: admin.id, role: "CASHIER" }),
          { code: "SELF_ACCESS_CHANGE" },
        );
        await assert.rejects(
          staff.update(cashier.id, { userId: admin.id, active: false }),
          { code: "LAST_ADMIN" },
        );
        await db.session.create({
          data: {
            userId: cashier.id,
            tokenHash: hashToken(newSessionToken()),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        partner = await partners.operators(admin.id, {
          partnerId: partner.id,
          updatedAt: partner.updatedAt.toISOString(),
          userIds: [cashier.id],
        });
        const changed = await staff.update(admin.id, {
          userId: cashier.id,
          updatedAt: cashier.updatedAt.toISOString(),
          role: "GATE",
          name: "Novo nome",
          contact: "83999999999",
        });
        assert.equal(changed.role, "GATE");
        assert.equal(changed.contact, "83999999999");
        assert.equal(
          await db.session.count({
            where: { userId: cashier.id, revokedAt: null },
          }),
          0,
        );
        assert.equal(
          (
            await db.merchantOperator.findFirst({
              where: { userId: cashier.id },
            })
          ).active,
          false,
        );
        await assert.rejects(
          staff.update(admin.id, {
            userId: cashier.id,
            updatedAt: cashier.updatedAt.toISOString(),
            name: "Stale",
          }),
          { code: "EMPLOYEE_CHANGED" },
        );
        assert.ok((await staff.list()).some((u) => u.id === admin.id));
      },
    );
    await t.test(
      "archiving preserves merchant history, hides benefits and restoration never reopens cashier access",
      async () => {
        partner = (await partners.list()).items[0];
        const archived = await partners.archive(admin.id, {
          id: partner.id,
          updatedAt: partner.updatedAt.toISOString(),
        });
        assert.ok(archived.archivedAt);
        assert.equal(archived.merchant.active, false);
        assert.equal((await partners.publicList()).length, 0);
        assert.equal((await partners.list({ status: "archived" })).total, 1);
        const restored = await partners.archive(
          admin.id,
          { id: partner.id, updatedAt: archived.updatedAt.toISOString() },
          true,
        );
        assert.equal(restored.active, false);
        assert.equal(restored.merchant.active, false);
        assert.equal(
          await db.auditLog.count({
            where: { entityId: partner.id, action: "PARTNER_ARCHIVED" },
          }),
          1,
        );
      },
    );
  },
);
