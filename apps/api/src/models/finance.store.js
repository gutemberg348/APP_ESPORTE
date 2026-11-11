import { createHash } from "node:crypto";
import { serializable, clubDay } from "../lib/business-rules.js";
import { AppError } from "../lib/errors.js";
import {
  captureFinancialPolicy,
  recordTicketFinancial,
} from "../lib/ticket-finance.js";
const error = (code, message) => new AppError(409, code, message);
const sum = (row, key) => row._sum[key] || 0;
const jsonPayout = (row) => ({
  ...row,
  balanceBeforeCents: Number(row.balanceBeforeCents),
});
export function nextPayoutDate(
  weekday,
  lastPaidAt,
  now = new Date(),
  firstCreditAt,
) {
  const day = clubDay(now),
    today = new Date(`${day}T12:00:00Z`),
    delta = (today.getUTCDay() - weekday + 7) % 7;
  const lastScheduled = new Date(today.getTime() - delta * 86400000)
    .toISOString()
    .slice(0, 10);
  const paidDay = lastPaidAt ? clubDay(lastPaidAt) : null;
  const firstDay = firstCreditAt ? clubDay(firstCreditAt) : null;
  return {
    due:
      (!firstDay || firstDay <= lastScheduled) &&
      (!paidDay || paidDay < lastScheduled),
    scheduledDay: lastScheduled,
    nextDay: new Date(
      today.getTime() + ((weekday - today.getUTCDay() + 7) % 7 || 7) * 86400000,
    )
      .toISOString()
      .slice(0, 10),
  };
}
export function createFinanceStore(client, { now = () => new Date() } = {}) {
  const settings = (tx = client) =>
    tx.financialSettings.upsert({
      where: { id: "main" },
      create: { id: "main" },
      update: {},
    });
  async function balances(tx) {
    const totals = await tx.ticketFinancial.aggregate({
      _sum: {
        grossCents: true,
        refundedCents: true,
        gatewayFeeCents: true,
        companyCents: true,
        clubCents: true,
      },
    });
    const ready = await tx.ticketFinancial.aggregate({
      where: { blocked: false, feeSource: { in: ["PROVIDER", "MANUAL"] } },
      _sum: { clubCents: true },
    });
    const sent = await tx.clubPayout.aggregate({
      where: { voidedAt: null },
      _sum: { amountCents: true },
    });
    const unissued = await tx.ticketRefundCost.aggregate({
      _sum: { grossCents: true, refundedCents: true, gatewayFeeCents: true },
    });
    const unissuedFeeCents = sum(unissued, "gatewayFeeCents");
    const totalSentCents = sum(sent, "amountCents"),
      clubEarnedCents = sum(totals, "clubCents") - unissuedFeeCents;
    return {
      grossCents: sum(totals, "grossCents") + sum(unissued, "grossCents"),
      refundedCents:
        sum(totals, "refundedCents") + sum(unissued, "refundedCents"),
      gatewayFeeCents: sum(totals, "gatewayFeeCents") + unissuedFeeCents,
      companyCents: sum(totals, "companyCents"),
      clubEarnedCents,
      totalSentCents,
      outstandingCents: clubEarnedCents - totalSentCents,
      availableCents: Math.max(
        0,
        Math.min(clubEarnedCents, sum(ready, "clubCents") - unissuedFeeCents) -
          totalSentCents,
      ),
    };
  }
  async function payoutTransaction(tx, actorId, input, withdrawalId) {
    const requestHash = createHash("sha256")
      .update(JSON.stringify(withdrawalId ? { ...input, withdrawalId } : input))
      .digest("hex");
    const previous = await tx.clubPayout.findUnique({
      where: { requestKey: input.requestKey },
    });
    if (previous) {
      if (previous.requestHash !== requestHash || previous.actorId !== actorId)
        throw error(
          "PAYOUT_KEY_CONFLICT",
          "Essa operação já foi registrada com outros dados.",
        );
      return jsonPayout(previous);
    }
    if (new Date(input.transferredAt) > now())
      throw error(
        "PAYOUT_FUTURE",
        "Registre somente uma transferência já realizada.",
      );
    const balance = await balances(tx);
    if (balance.availableCents !== input.expectedBalanceCents)
      throw error(
        "PAYOUT_BALANCE_CHANGED",
        "O saldo mudou. Confira os valores atualizados antes de registrar.",
      );
    if (input.amountCents > balance.availableCents)
      throw error(
        "PAYOUT_OVER_BALANCE",
        "O repasse não pode ultrapassar o saldo liberado do time.",
      );
    const reserved = await tx.withdrawalRequest.aggregate({
      where: {
        status: "PENDING",
        ...(withdrawalId ? { id: { not: withdrawalId } } : {}),
      },
      _sum: { amountCents: true },
    });
    if (
      input.amountCents >
      balance.availableCents - (reserved._sum.amountCents || 0)
    )
      throw error(
        "PAYOUT_RESERVED",
        "Parte desse saldo já está comprometida com outros pedidos de saque. Confira os pedidos pendentes.",
      );
    const row = await tx.clubPayout.create({
      data: {
        actorId,
        requestKey: input.requestKey,
        requestHash,
        amountCents: input.amountCents,
        balanceBeforeCents: BigInt(balance.availableCents),
        reference: input.reference,
        recipient: input.recipient,
        transferredAt: new Date(input.transferredAt),
        notes: input.notes,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "CLUB_PAYOUT_RECORDED",
        entityId: row.id,
        details: {
          amountCents: input.amountCents,
          reference: input.reference,
          balanceBeforeCents: balance.availableCents,
          balanceAfterCents: balance.availableCents - input.amountCents,
        },
      },
    });
    return jsonPayout(row);
  }
  return {
    balancesInTransaction: balances,
    settings,
    saveSettings(actorId, { version, ...data }) {
      return serializable(client, async (tx) => {
        const current = await settings(tx);
        if (current.version !== version)
          throw error(
            "FINANCE_SETTINGS_CHANGED",
            "As configurações mudaram. Atualize a página antes de salvar.",
          );
        const saved = await tx.financialSettings.update({
          where: { id: "main" },
          data: { ...data, version: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "FINANCE_SETTINGS_UPDATED",
            entityId: "main",
            details: {
              before: {
                companyBps: current.companyBps,
                commissionBase: current.commissionBase,
                gatewayBps: current.gatewayBps,
                gatewayFixedCents: current.gatewayFixedCents,
              },
              after: data,
            },
          },
        });
        return saved;
      });
    },
    summary() {
      return client.$transaction(
        async (tx) => {
          const config = await settings(tx),
            totals = await balances(tx);
          const last = await tx.clubPayout.findFirst({
            where: { voidedAt: null },
            orderBy: { transferredAt: "desc" },
          });
          const first = await tx.ticketFinancial.findFirst({
            orderBy: { createdAt: "asc" },
            select: { createdAt: true },
          });
          const pendingFeeCount = await tx.ticketFinancial.count({
            where: { feeSource: "ESTIMATED" },
          });
          const blockedCount = await tx.ticketFinancial.count({
            where: { blocked: true },
          });
          const legacy = await tx.ticketPayment.aggregate({
            where: { amountCents: { gt: 0 }, financial: { is: null } },
            _sum: { amountCents: true },
            _count: { id: true },
          });
          return {
            ...totals,
            pendingFeeCount,
            blockedCount,
            legacyCount: legacy._count.id,
            legacyGrossCents: sum(legacy, "amountCents"),
            schedule: nextPayoutDate(
              config.payoutWeekday,
              last?.transferredAt,
              now(),
              first?.createdAt,
            ),
            lastPayout: last ? jsonPayout(last) : null,
            serverTime: now(),
          };
        },
        { isolationLevel: "RepeatableRead" },
      );
    },
    async receipts(query) {
      const [items, total] = await Promise.all([
        client.ticketFinancial.findMany({
          include: {
            payment: {
              include: {
                ticket: {
                  select: {
                    id: true,
                    quantity: true,
                    match: { select: { homeTeam: true, awayTeam: true } },
                    user: { select: { name: true, email: true } },
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
        client.ticketFinancial.count(),
      ]);
      return { items, total };
    },
    async payouts(query) {
      const [items, total] = await Promise.all([
        client.clubPayout.findMany({
          include: {
            actor: { select: { name: true, email: true } },
            withdrawal: { select: { id: true } },
          },
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
        client.clubPayout.count(),
      ]);
      return { items: items.map(jsonPayout), total };
    },
    async refundCosts(query) {
      const [items, total] = await Promise.all([
        client.ticketRefundCost.findMany({
          include: {
            intent: { select: { providerReference: true, ticketId: true } },
          },
          orderBy: { createdAt: "desc" },
          take: query.limit,
          skip: query.offset,
        }),
        client.ticketRefundCost.count(),
      ]);
      return { items, total };
    },
    payoutInTransaction: payoutTransaction,
    payout(actorId, input) {
      return serializable(client, (tx) =>
        payoutTransaction(tx, actorId, input),
      );
    },
    voidPayout(actorId, { id, reason }) {
      return serializable(client, async (tx) => {
        const row = await tx.clubPayout.findUnique({ where: { id } });
        if (!row)
          throw new AppError(
            404,
            "PAYOUT_NOT_FOUND",
            "Repasse não encontrado.",
          );
        if (row.voidedAt) return jsonPayout(row);
        const updated = await tx.clubPayout.update({
          where: { id },
          data: { voidedAt: now(), voidReason: reason },
        });
        await tx.withdrawalRequest.updateMany({
          where: { payoutId: id, status: "SENT" },
          data: {
            status: "VOIDED",
            resolutionReason: reason,
            resolvedAt: now(),
            version: { increment: 1 },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "CLUB_PAYOUT_RECORD_VOIDED",
            entityId: id,
            details: {
              reason,
              amountCents: row.amountCents,
              reference: row.reference,
            },
          },
        });
        return jsonPayout(updated);
      });
    },
    adoptLegacy(actorId, reason) {
      return serializable(client, async (tx) => {
        const policy = await captureFinancialPolicy(tx),
          rows = await tx.ticket.findMany({
            where: {
              payment: {
                is: { amountCents: { gt: 0 }, financial: { is: null } },
              },
            },
            include: { payment: true, paymentIntents: true },
            take: 100,
          });
        for (const ticket of rows) {
          await tx.ticket.update({
            where: { id: ticket.id },
            data: { financialPolicy: policy },
          });
          const intent = ticket.paymentIntents.find(
            (item) =>
              ticket.payment.reference === `${(item.provider || 'asaas').toUpperCase()}:${item.providerReference}`,
          );
          await recordTicketFinancial(
            tx,
            { ...ticket, financialPolicy: policy },
            {
              providerNetCents:
                ["ASAAS", "SICREDI"].includes(ticket.payment.method)
                  ? intent?.netCents
                  : undefined,
              blocked: Boolean(
                intent?.refundRequestedAt &&
                  ticket.payment.refundedCents < ticket.payment.amountCents,
              ),
              reason: "Adoção explícita da regra para recebimento histórico",
            },
          );
        }
        await tx.auditLog.create({
          data: {
            actorId,
            action: "LEGACY_TICKET_FINANCE_ADOPTED",
            entityId: "main",
            details: { reason, count: rows.length, policy },
          },
        });
        return { adopted: rows.length };
      });
    },
  };
}
