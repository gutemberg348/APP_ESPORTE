import { createHash } from "node:crypto";
import { serializable } from "../lib/business-rules.js";
import { AppError } from "../lib/errors.js";
import { createFinanceStore } from "./finance.store.js";
import { decodePayoutAttachment } from "../lib/payout-attachments.js";
const fail = (code, message) => new AppError(409, code, message);
const actor = { select: { name: true, email: true } };
const attachmentSelect = {
  id: true,
  withdrawalId: true,
  payoutId: true,
  name: true,
  mimeType: true,
  byteLength: true,
  sha256: true,
  createdAt: true,
  actor,
  removedAt: true,
  removalReason: true,
};
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const include = {
  actor,
  payout: {
    select: { id: true, reference: true, transferredAt: true, voidedAt: true },
  },
  _count: { select: { attachments: { where: { removedAt: null } } } },
};
export function createWithdrawalStore(db, { now = () => new Date() } = {}) {
  const finance = createFinanceStore(db, { now });
  const audit = (tx, actorId, action, entityId, details) =>
    tx.auditLog.create({ data: { actorId, action, entityId, details } });
  async function pending(tx) {
    return tx.withdrawalRequest.aggregate({
      where: { status: "PENDING" },
      _sum: { amountCents: true },
      _count: true,
    });
  }
  async function summary(tx) {
    const [balance, held] = await Promise.all([
      finance.balancesInTransaction(tx),
      pending(tx),
    ]);
    return {
      ...balance,
      pendingCents: held._sum.amountCents || 0,
      pendingCount: held._count,
      availableToRequestCents: Math.max(
        0,
        balance.availableCents - (held._sum.amountCents || 0),
      ),
    };
  }
  async function request(tx, id) {
    const row = await tx.withdrawalRequest.findUnique({ where: { id } });
    if (!row)
      throw new AppError(
        404,
        "WITHDRAWAL_NOT_FOUND",
        "Pedido de saque não encontrado.",
      );
    return row;
  }
  async function parent(tx, input, writable = false) {
    if (input.withdrawalId) {
      const row = await request(tx, input.withdrawalId);
      if (writable && !["PENDING", "SENT"].includes(row.status))
        throw fail(
          "WITHDRAWAL_CLOSED",
          "Não é possível anexar a um pedido cancelado ou anulado.",
        );
    } else {
      const row = await tx.clubPayout.findUnique({
        where: { id: input.payoutId },
      });
      if (!row)
        throw new AppError(404, "PAYOUT_NOT_FOUND", "Envio não encontrado.");
      if (writable && row.voidedAt)
        throw fail("PAYOUT_VOIDED", "O envio está anulado.");
    }
    return input.withdrawalId
      ? { withdrawalId: input.withdrawalId }
      : { payoutId: input.payoutId };
  }
  return {
    summary: () =>
      db.$transaction((tx) => summary(tx), {
        isolationLevel: "RepeatableRead",
      }),
    async list({ status, search, limit = 20, offset = 0 } = {}) {
      const where = {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { recipient: { contains: search, mode: "insensitive" } },
                { notes: { contains: search, mode: "insensitive" } },
                {
                  payout: {
                    is: {
                      reference: { contains: search, mode: "insensitive" },
                    },
                  },
                },
              ],
            }
          : {}),
      };
      const [items, total] = await db.$transaction([
        db.withdrawalRequest.findMany({
          where,
          include,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: limit,
          skip: offset,
        }),
        db.withdrawalRequest.count({ where }),
      ]);
      return { items, total };
    },
    create(actorId, input) {
      return serializable(db, async (tx) => {
        const previous = await tx.withdrawalRequest.findUnique({
          where: { requestKey: input.requestKey },
          include,
        });
        if (previous) {
          if (
            previous.actorId !== actorId ||
            previous.requestHash !== hash(input)
          )
            throw fail(
              "WITHDRAWAL_KEY_CONFLICT",
              "Esta operação já foi usada para outro pedido.",
            );
          return previous;
        }
        const balance = await summary(tx);
        if (input.expectedAvailableCents !== balance.availableToRequestCents)
          throw fail(
            "WITHDRAWAL_BALANCE_CHANGED",
            "O saldo disponível mudou. Atualize os valores antes de pedir.",
          );
        if (input.amountCents > balance.availableToRequestCents)
          throw fail(
            "WITHDRAWAL_OVER_BALANCE",
            "O pedido ultrapassa o saldo livre para novos saques.",
          );
        const { expectedAvailableCents, ...data } = input;
        const row = await tx.withdrawalRequest.create({
          data: { ...data, actorId, requestHash: hash(input) },
          include,
        });
        await audit(tx, actorId, "WITHDRAWAL_REQUESTED", row.id, {
          amountCents: row.amountCents,
          recipient: row.recipient,
        });
        return row;
      });
    },
    cancel(actorId, { id, version, reason }) {
      return serializable(db, async (tx) => {
        const row = await request(tx, id);
        if (row.status === "CANCELED")
          return tx.withdrawalRequest.findUnique({ where: { id }, include });
        if (row.status !== "PENDING" || row.version !== version)
          throw fail(
            "WITHDRAWAL_CHANGED",
            "Este pedido já foi alterado ou concluído. Atualize a lista.",
          );
        const updated = await tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: "CANCELED",
            resolutionReason: reason,
            resolvedAt: now(),
            version: { increment: 1 },
          },
          include,
        });
        await audit(tx, actorId, "WITHDRAWAL_CANCELED", id, {
          reason,
          amountCents: row.amountCents,
        });
        return updated;
      });
    },
    send(actorId, { id, version, ...input }) {
      return serializable(db, async (tx) => {
        const row = await request(tx, id);
        if (row.status === "SENT") {
          const previousPayout = await tx.clubPayout.findUnique({
            where: { id: row.payoutId },
            select: { requestKey: true },
          });
          if (previousPayout?.requestKey !== input.requestKey)
            throw fail(
              "WITHDRAWAL_ALREADY_SENT",
              "Este pedido já possui um envio registrado.",
            );
        }
        if (
          row.status !== "SENT" &&
          (row.status !== "PENDING" || row.version !== version)
        )
          throw fail(
            "WITHDRAWAL_CHANGED",
            "Este pedido já foi alterado ou concluído. Atualize a lista.",
          );
        const payout = await finance.payoutInTransaction(
          tx,
          actorId,
          { ...input, amountCents: row.amountCents, recipient: row.recipient },
          id,
        );
        if (row.status === "SENT") {
          if (row.payoutId !== payout.id)
            throw fail(
              "WITHDRAWAL_ALREADY_SENT",
              "Este pedido já possui outro envio.",
            );
          return tx.withdrawalRequest.findUnique({ where: { id }, include });
        }
        const saved = await tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: "SENT",
            payoutId: payout.id,
            resolvedAt: now(),
            version: { increment: 1 },
          },
          include,
        });
        await audit(tx, actorId, "WITHDRAWAL_SENT", id, {
          payoutId: payout.id,
          amountCents: row.amountCents,
        });
        return saved;
      });
    },
    async attachments(input) {
      const scope = await parent(db, input);
      return db.payoutAttachment.findMany({
        where: scope,
        select: attachmentSelect,
        orderBy: { createdAt: "desc" },
      });
    },
    upload(actorId, input) {
      const file = decodePayoutAttachment(input);
      return serializable(db, async (tx) => {
        const scope = await parent(tx, input, true),
          existing = await tx.payoutAttachment.findFirst({
            where: { ...scope, sha256: file.sha256, removedAt: null },
            select: attachmentSelect,
          });
        if (existing) return existing;
        if (
          (await tx.payoutAttachment.count({
            where: { ...scope, removedAt: null },
          })) >= 5
        )
          throw fail(
            "RECEIPT_LIMIT",
            "Limite de cinco comprovantes por registro.",
          );
        const row = await tx.payoutAttachment.create({
          data: { ...scope, ...file, actorId },
          select: attachmentSelect,
        });
        await audit(tx, actorId, "PAYOUT_RECEIPT_ATTACHED", row.id, {
          ...scope,
          sha256: row.sha256,
          byteLength: row.byteLength,
        });
        return row;
      });
    },
    async content(id) {
      const row = await db.payoutAttachment.findUnique({ where: { id } });
      if (!row || row.removedAt)
        throw new AppError(
          404,
          "RECEIPT_NOT_FOUND",
          "Comprovante não encontrado.",
        );
      return {
        id: row.id,
        name: row.name,
        mimeType: row.mimeType,
        base64: Buffer.from(row.content).toString("base64"),
      };
    },
    remove(actorId, { id, reason }) {
      return serializable(db, async (tx) => {
        const row = await tx.payoutAttachment.findUnique({ where: { id } });
        if (!row)
          throw new AppError(
            404,
            "RECEIPT_NOT_FOUND",
            "Comprovante não encontrado.",
          );
        if (row.removedAt) return { removed: true };
        await tx.payoutAttachment.update({
          where: { id },
          data: { removedAt: now(), removalReason: reason },
        });
        await audit(tx, actorId, "PAYOUT_RECEIPT_REMOVED", id, {
          reason,
          withdrawalId: row.withdrawalId,
          payoutId: row.payoutId,
        });
        return { removed: true };
      });
    },
  };
}
