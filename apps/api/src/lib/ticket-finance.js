import { z } from "zod";
import { AppError } from "./errors.js";
export const DEFAULT_FINANCIAL_POLICY = {
  companyBps: 1000,
  commissionBase: "NET",
  gatewayBps: 0,
  gatewayFixedCents: 0,
  settingsVersion: 0,
};
export const policySchema = z
  .object({
    companyBps: z.number().int().min(0).max(10000),
    commissionBase: z.enum(["NET", "GROSS"]),
    gatewayBps: z.number().int().min(0).max(10000),
    gatewayFixedCents: z.number().int().min(0).max(100000000),
    settingsVersion: z.number().int().min(0),
  })
  .strict();
export async function captureFinancialPolicy(tx) {
  const settings = await tx.financialSettings.upsert({
    where: { id: "main" }, create: { id: "main" }, update: {},
  });
  return {
    companyBps: settings.companyBps,
    commissionBase: settings.commissionBase,
    gatewayBps: settings.gatewayBps,
    gatewayFixedCents: settings.gatewayFixedCents,
    settingsVersion: settings.version,
  };
}
export function calculateTicketAllocation(
  grossCents,
  refundedCents,
  gatewayFeeCents,
  inputPolicy,
) {
  const policy = policySchema.parse(inputPolicy);
  if (
    ![grossCents, refundedCents, gatewayFeeCents].every(
      (value) =>
        Number.isSafeInteger(value) && value >= 0 && value <= 2147483647,
    ) ||
    refundedCents > grossCents
  )
    throw new AppError(
      409,
      "FINANCIAL_INVALID_AMOUNT",
      "Valores financeiros inconsistentes.",
    );
  const remaining = grossCents - refundedCents,
    net = remaining - gatewayFeeCents;
  const base = policy.commissionBase === "NET" ? Math.max(0, net) : remaining;
  const companyCents = Math.floor((base * policy.companyBps + 5000) / 10000),
    clubCents = net - companyCents;
  return {
    grossCents,
    refundedCents,
    gatewayFeeCents,
    companyCents,
    clubCents,
  };
}
// Call only inside the transaction that confirms payment/refund. Deltas are immutable.
export async function recordTicketFinancial(
  tx,
  ticket,
  {
    providerNetCents,
    manualFeeCents,
    blocked = false,
    reason = "Conciliação financeira",
  } = {},
) {
  const payment =
    ticket.payment ||
    (await tx.ticketPayment.findUnique({ where: { ticketId: ticket.id } }));
  if (!payment || payment.amountCents === 0) return null;
  const previous = await tx.ticketFinancial.findUnique({
    where: { paymentId: payment.id },
  });
  // Older receipts have no agreed policy: report them separately, never invent a 10% allocation.
  if (!previous && !ticket.financialPolicy) return null;
  const policy = policySchema.parse(previous?.policy || ticket.financialPolicy);
  let feeSource =
    previous?.feeSource ||
    (payment.method === "MANUAL" ? "MANUAL" : "ESTIMATED");
  let fee =
    previous?.gatewayFeeCents ??
    (payment.method === "MANUAL"
      ? 0
      : Math.floor((payment.amountCents * policy.gatewayBps + 5000) / 10000) +
        policy.gatewayFixedCents);
  if (providerNetCents !== undefined && providerNetCents !== null) {
    if (
      !Number.isSafeInteger(providerNetCents) ||
      providerNetCents < 0 ||
      providerNetCents > payment.amountCents
    )
      throw new AppError(
        409,
        "FINANCIAL_PROVIDER_MISMATCH",
        "O líquido do gateway é incompatível com o recebimento.",
      );
    fee = payment.amountCents - providerNetCents;
    feeSource = "PROVIDER";
  } else if (manualFeeCents !== undefined) {
    fee = manualFeeCents;
    feeSource = "MANUAL";
  }
  const values = calculateTicketAllocation(
    payment.amountCents,
    payment.refundedCents || 0,
    fee,
    policy,
  );
  const data = { ...values, feeSource, blocked };
  if (
    previous &&
    Object.entries(data).every(([field, value]) => previous[field] === value)
  )
    return previous;
  const current = previous
    ? await tx.ticketFinancial.update({
        where: { id: previous.id },
        data: { ...data, version: { increment: 1 } },
      })
    : await tx.ticketFinancial.create({
        data: { ...data, paymentId: payment.id, policy },
      });
  await tx.ticketFinancialEntry.create({
    data: {
      financialId: current.id,
      revision: current.version,
      grossDeltaCents: values.grossCents - (previous?.grossCents || 0),
      refundedDeltaCents: values.refundedCents - (previous?.refundedCents || 0),
      gatewayDeltaCents:
        values.gatewayFeeCents - (previous?.gatewayFeeCents || 0),
      companyDeltaCents: values.companyCents - (previous?.companyCents || 0),
      clubDeltaCents: values.clubCents - (previous?.clubCents || 0),
      reason,
    },
  });
  return current;
}
