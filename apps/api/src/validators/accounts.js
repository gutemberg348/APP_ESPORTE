import { z } from "zod";
export const accountFields = {
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  city: z.string().trim().max(60).optional(),
  contact: z
    .string()
    .regex(/^(?:\d{10,13})?$/, "Informe um telefone com DDD.")
    .optional(),
  active: z.boolean().optional(),
  password: z
    .string()
    .min(12, "Use pelo menos 12 caracteres na nova senha.")
    .max(128)
    .optional(),
};
export const accountDetailSchema = z.object({ userId: z.uuid() }).strict();
export const accountUpdateSchema = z
  .object({ userId: z.uuid(), updatedAt: z.iso.datetime(), ...accountFields })
  .strict()
  .refine(
    (v) => Object.keys(v).some((key) => !["userId", "updatedAt"].includes(key)),
    "Informe ao menos um campo.",
  );
