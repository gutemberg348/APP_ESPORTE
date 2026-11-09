import { z } from "zod";
import { accountFields } from "./accounts.js";
const role = z.enum(["ADMIN", "GATE", "CASHIER"]);
const email = z.string().trim().toLowerCase().email().max(254);
const contact = z.string().regex(/^(?:\d{10,13})?$/);
export const employeeCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email,
    role: role.default("GATE"),
    contact: contact.default(""),
    password: z.string().min(12).max(128),
  })
  .strict();
export const employeeUpdateSchema = z
  .object({
    userId: z.uuid(),
    updatedAt: z.iso.datetime(),
    ...accountFields,
    role: role.optional(),
  })
  .strict()
  .refine(
    (v) => Object.keys(v).some((key) => !["userId", "updatedAt"].includes(key)),
    "Informe ao menos um campo.",
  );
export const employeePasswordSchema = z
  .object({ userId: z.uuid(), password: z.string().min(12).max(128) })
  .strict();
export const employeeAssignmentsSchema = z
  .object({
    userId: z.uuid(),
    sectorIds: z
      .array(z.uuid())
      .max(100)
      .refine(
        (values) => new Set(values).size === values.length,
        "Não repita setores.",
      ),
  })
  .strict();
