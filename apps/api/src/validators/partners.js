import { z } from "zod";
const website = z.union([
  z.literal(""),
  z
    .url()
    .max(500)
    .refine((v) => {
      const url = new URL(v);
      return url.protocol === "https:" && !url.username && !url.password;
    }, "Use um endereço HTTPS válido."),
]);
const fields = {
  name: z.string().trim().min(2).max(100),
  discount: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(60),
  icon: z
    .enum(["coffee", "basket", "heart", "fuel", "pizza", "activity", "gift"])
    .default("gift"),
  description: z.string().trim().max(2000).default(""),
  conditions: z.string().trim().max(2000).default(""),
  location: z.string().trim().max(300).default(""),
  contact: z
    .string()
    .regex(/^(?:\d{10,13})?$/)
    .default(""),
  website: website.default(""),
  active: z.boolean().default(true),
  offer: z
    .object({
      cashbackBps: z.number().int().min(0).max(10000),
      commissionBps: z.number().int().min(0).max(10000),
      active: z.boolean(),
      customerQrEnabled: z.boolean(),
    })
    .strict()
    .refine(
      (v) => v.cashbackBps + v.commissionBps <= 10000,
      "Cashback e comissão não podem ultrapassar 100%.",
    )
    .optional(),
};
export const partnerCreateSchema = z.object(fields).strict();
export const partnerUpdateSchema = z
  .object({ ...fields, id: z.uuid(), updatedAt: z.iso.datetime() })
  .strict();
export const partnerActionSchema = z
  .object({ id: z.uuid(), updatedAt: z.iso.datetime() })
  .strict();
export const partnerQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(["active", "inactive", "archived", "all"]).default("all"),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();
const benefit = {
  partnerId: z.uuid(),
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).default(""),
  conditions: z.string().trim().max(2000).default(""),
  active: z.boolean(),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
};
const validDates = (v) =>
  !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt);
export const benefitCreateSchema = z
  .object(benefit)
  .strict()
  .refine(validDates, "O fim deve ser posterior ao início.");
export const benefitUpdateSchema = z
  .object({ ...benefit, id: z.uuid(), updatedAt: z.iso.datetime() })
  .strict()
  .refine(validDates, "O fim deve ser posterior ao início.");
export const operatorsSchema = z
  .object({
    partnerId: z.uuid(),
    updatedAt: z.iso.datetime(),
    userIds: z
      .array(z.uuid())
      .max(100)
      .refine((v) => new Set(v).size === v.length, "Não repita funcionários."),
  })
  .strict();
