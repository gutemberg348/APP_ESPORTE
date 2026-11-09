import { randomUUID } from "node:crypto";
import { serializable } from "../lib/business-rules.js";
import { AppError } from "../lib/errors.js";
import { hashToken } from "../lib/crypto.js";
const invalid = () =>
  new AppError(
    422,
    "RESET_LINK_INVALID",
    "Este link expirou ou já foi utilizado. Solicite um novo link.",
  );
function usable(reset, now) {
  return (
    reset &&
    !reset.usedAt &&
    reset.expiresAt > now &&
    reset.user.active &&
    reset.emailAtIssue === reset.user.email &&
    reset.credentialHash === hashToken(reset.user.passwordHash)
  );
}
export function createPasswordRecoveryStore(
  db,
  { cipher, now = () => new Date(), ttlMinutes = 15, publicUrl },
) {
  return {
    issue(email, token, portal = "APP", actorId) {
      return serializable(db, async (tx) => {
        const at = now(),
          user = await tx.user.findUnique({ where: { email } });
        if (!user?.active) return;
        const recent = await tx.passwordResetToken.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        });
        if (recent && at - recent.createdAt < 60000) return;
        if (
          (await tx.passwordResetToken.count({
            where: {
              userId: user.id,
              createdAt: { gt: new Date(at - 3600000) },
            },
          })) >= 5
        )
          return;
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: at },
        });
        await tx.mailDelivery.updateMany({
          where: {
            reset: { userId: user.id },
            status: { in: ["QUEUED", "FAILED"] },
          },
          data: { status: "SKIPPED", payload: null },
        });
        const url = new URL(publicUrl);
        url.hash = new URLSearchParams({
          token,
          portal: portal.toLowerCase(),
        }).toString();
        await tx.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash: hashToken(token),
            credentialHash: hashToken(user.passwordHash),
            emailAtIssue: user.email,
            expiresAt: new Date(at.getTime() + ttlMinutes * 60000),
            createdAt: at,
            delivery: {
              create: {
                payload: cipher.encrypt({
                  to: user.email,
                  name: user.name,
                  url: url.toString(),
                  minutes: ttlMinutes,
                }),
              },
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actorId || user.id,
            action: "PASSWORD_RECOVERY_REQUESTED",
            entityId: user.id,
            details: { portal },
          },
        });
      });
    },
    async inspect(token) {
      const reset = await db.passwordResetToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (!usable(reset, now())) throw invalid();
      return { valid: true, expiresAt: reset.expiresAt };
    },
    consume(token, passwordHash) {
      return serializable(db, async (tx) => {
        const at = now(),
          reset = await tx.passwordResetToken.findUnique({
            where: { tokenHash: hashToken(token) },
            include: { user: true },
          });
        if (!usable(reset, at)) throw invalid();
        const changed = await tx.user.updateMany({
          where: {
            id: reset.userId,
            active: true,
            email: reset.emailAtIssue,
            passwordHash: reset.user.passwordHash,
          },
          data: { passwordHash },
        });
        if (changed.count !== 1) throw invalid();
        const consumed = await tx.passwordResetToken.updateMany({
          where: { id: reset.id, usedAt: null, expiresAt: { gt: at } },
          data: { usedAt: at },
        });
        if (consumed.count !== 1) throw invalid();
        await tx.passwordResetToken.updateMany({
          where: { userId: reset.userId, usedAt: null },
          data: { usedAt: at },
        });
        await tx.session.updateMany({
          where: { userId: reset.userId, revokedAt: null },
          data: { revokedAt: at },
        });
        await tx.mailDelivery.updateMany({
          where: {
            reset: { userId: reset.userId },
            status: { in: ["QUEUED", "FAILED"] },
          },
          data: { status: "SKIPPED", payload: null },
        });
        await tx.auditLog.create({
          data: {
            actorId: reset.userId,
            action: "PASSWORD_RECOVERED",
            entityId: reset.userId,
            details: { sessionsRevoked: true },
          },
        });
      });
    },
    async deliver(mailer) {
      const at = now();
      const candidate = await db.mailDelivery.findFirst({
        where: {
          OR: [
            { status: "QUEUED", nextAttemptAt: { lte: at } },
            { status: "SENDING", lockedUntil: { lt: at } },
          ],
        },
        orderBy: { createdAt: "asc" },
      });
      if (!candidate) return false;
      const lockToken = randomUUID();
      const locked = await db.mailDelivery.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          lockToken: candidate.lockToken,
          updatedAt: candidate.updatedAt,
        },
        data: {
          status: "SENDING",
          lockToken,
          lockedUntil: new Date(at.getTime() + 90000),
          attempts: { increment: 1 },
        },
      });
      if (!locked.count) return false;
      const reset = await db.passwordResetToken.findUnique({
        where: { id: candidate.resetId },
        include: { user: true },
      });
      let data;
      try {
        if (!usable(reset, now()) || !candidate.payload)
          data = { status: "SKIPPED", payload: null };
        else {
          await mailer.send({
            ...cipher.decrypt(candidate.payload),
            deliveryId: candidate.id,
          });
          data = {
            status: "SENT",
            sentAt: now(),
            payload: null,
            errorCode: null,
          };
        }
      } catch {
        const failed = candidate.attempts + 1 >= 5;
        data = {
          status: failed ? "FAILED" : "QUEUED",
          errorCode: "SMTP_DELIVERY_FAILED",
          nextAttemptAt: new Date(
            now().getTime() + Math.min(300000, 15000 * 2 ** candidate.attempts),
          ),
          ...(failed ? { payload: null } : {}),
        };
      }
      await db.mailDelivery.updateMany({
        where: { id: candidate.id, lockToken },
        data: { ...data, lockedUntil: null, lockToken: null },
      });
      return true;
    },
    async deliveryStatus() {
      const rows = await db.mailDelivery.groupBy({
        by: ["status"],
        _count: true,
      });
      return Object.fromEntries(rows.map((r) => [r.status, r._count]));
    },
  };
}
