import { z } from "zod";
const money = z.number().int().min(0).max(100000000);
export const financeSettingsSchema = z
  .object({
    version: z.number().int().min(0),
    companyName: z.string().trim().min(2).max(100),
    companyBps: z.number().int().min(0).max(10000),
    commissionBase: z.enum(["NET", "GROSS"]),
    gatewayBps: z.number().int().min(0).max(10000),
    gatewayFixedCents: money,
    payoutWeekday: z.number().int().min(0).max(6),
    clubRecipient: z.string().trim().max(200),
    clubPixKey: z.string().trim().max(200),
  })
  .strict();
export const payoutSchema = z
  .object({
    amountCents: money.min(1),
    expectedBalanceCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    transferredAt: z.iso.datetime({ offset: true }),
    reference: z.string().trim().min(5).max(100),
    recipient: z.string().trim().min(2).max(200),
    notes: z.string().trim().max(1000).default(""),
    transferVerified: z.literal(true),
    requestKey: z.string().min(16).max(80),
  })
  .strict();
export const voidPayoutSchema = z
  .object({
    id: z.uuid(),
    reason: z.string().trim().min(10).max(500),
    confirmed: z.literal(true),
  })
  .strict();
export const legacyFinanceSchema = z
  .object({
    reason: z.string().trim().min(10).max(500),
    confirmed: z.literal(true),
  })
  .strict();
export const financeQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();
