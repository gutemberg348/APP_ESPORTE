import { partnerService as service } from "../services/partner.service.js";
import {
  partnerCreateSchema,
  partnerUpdateSchema,
  partnerQuerySchema,
  partnerActionSchema,
  benefitCreateSchema,
  benefitUpdateSchema,
  operatorsSchema,
} from "../validators/partners.js";
export const partnerController = {
  list: async ({ user, url }) => ({
    data: await service.list(
      user,
      partnerQuerySchema.parse(Object.fromEntries(url.searchParams)),
    ),
  }),
  create: async ({ user, body }) => ({
    status: 201,
    data: await service.create(user, partnerCreateSchema.parse(body)),
  }),
  update: async ({ user, body }) => ({
    data: await service.update(user, partnerUpdateSchema.parse(body)),
  }),
  archive: async ({ user, body }) => ({
    data: await service.archive(user, partnerActionSchema.parse(body)),
  }),
  restore: async ({ user, body }) => ({
    data: await service.archive(user, partnerActionSchema.parse(body), true),
  }),
  createBenefit: async ({ user, body }) => ({
    status: 201,
    data: await service.benefit(user, benefitCreateSchema.parse(body)),
  }),
  updateBenefit: async ({ user, body }) => ({
    data: await service.benefit(user, benefitUpdateSchema.parse(body)),
  }),
  operators: async ({ user, body }) => ({
    data: await service.operators(user, operatorsSchema.parse(body)),
  }),
};
