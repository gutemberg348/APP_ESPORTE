import { z } from "zod";
const amount = z.number().int().min(1).max(100000000);
export const withdrawalCreateSchema = z
  .object({
    amountCents: amount,
    expectedAvailableCents: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER),
    recipient: z.string().trim().min(2).max(200),
    pixKey: z.string().trim().max(200).default(""),
    notes: z.string().trim().max(1000).default(""),
    requestKey: z.string().min(16).max(80),
  })
  .strict();
export const withdrawalCancelSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().min(0),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export const withdrawalSendSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().min(0),
    expectedBalanceCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    reference: z.string().trim().min(5).max(100),
    transferredAt: z.iso.datetime({ offset: true }),
    notes: z.string().trim().max(1000).default(""),
    transferVerified: z.literal(true),
    requestKey: z.string().min(16).max(80),
  })
  .strict();
export const withdrawalQuerySchema = z
  .object({
    status: z.enum(["PENDING", "SENT", "CANCELED", "VOIDED"]).optional(),
    search: z.string().trim().max(100).default(""),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();
const parent = z.object({
  withdrawalId: z.uuid().optional(),
  payoutId: z.uuid().optional(),
});
const oneParent = (value) =>
  Boolean(value.withdrawalId) !== Boolean(value.payoutId);
export const attachmentParentSchema = parent
  .strict()
  .refine(oneParent, "Informe um pedido ou um envio.");
export const attachmentUploadSchema = parent
  .extend({
    name: z.string().trim().min(1).max(180),
    mimeType: z.enum([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]),
    base64: z.string().min(4).max(6990508),
  })
  .strict()
  .refine(oneParent, "Informe um pedido ou um envio.");
export const attachmentIdSchema = z.object({ id: z.uuid() }).strict();
export const attachmentRemoveSchema = z
  .object({ id: z.uuid(), reason: z.string().trim().min(5).max(500) })
  .strict();
