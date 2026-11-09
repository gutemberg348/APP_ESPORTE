import { z } from "zod";
import { passwordRecoveryService as service } from "../services/password-recovery.service.js";
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const requestSchema = z
  .object({
  email: z.string().trim().toLowerCase().email().max(254),
    portal: z.enum(["APP", "ADMIN"]).default("APP"),
  })
  .strict();
const resetSchema = z
  .object({ token, password: z.string().min(12).max(128) })
  .strict();
export const passwordRecoveryController = {
  request: async ({ body }) => ({
    status: 202,
    data: await service.request(requestSchema.parse(body)),
  }),
  validate: async ({ body }) => ({
    data: await service.validate(
      z.object({ token }).strict().parse(body).token,
    ),
  }),
  reset: async ({ body }) => ({
    data: await service.reset(resetSchema.parse(body)),
  }),
  forUser: async ({ user, body }) => ({
    status: 202,
    data: await service.forUser(
      user,
      z.object({ userId: z.uuid() }).strict().parse(body).userId,
    ),
  }),
  status: async ({ user }) => ({ data: await service.status(user) }),
  verify: async ({ user }) => ({ data: await service.verify(user) }),
};
