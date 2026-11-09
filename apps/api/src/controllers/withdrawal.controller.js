import { withdrawalService as service } from '../services/withdrawal.service.js';
import * as schema from '../validators/withdrawals.js';
export const withdrawalController = {
  summary: async () => ({ data: await service.summary() }),
  list: async ({ url }) => ({ data: await service.list(schema.withdrawalQuerySchema.parse(Object.fromEntries(url.searchParams))) }),
  create: async ({ user, body }) => ({ status: 201, data: await service.create(user.id, schema.withdrawalCreateSchema.parse(body)) }),
  cancel: async ({ user, body }) => ({ data: await service.cancel(user.id, schema.withdrawalCancelSchema.parse(body)) }),
  send: async ({ user, body }) => ({ data: await service.send(user.id, schema.withdrawalSendSchema.parse(body)) }),
  attachments: async ({ url }) => ({ data: await service.attachments(schema.attachmentParentSchema.parse(Object.fromEntries(url.searchParams))) }),
  upload: async ({ user, body }) => ({ status: 201, data: await service.upload(user.id, schema.attachmentUploadSchema.parse(body)) }),
  content: async ({ body }) => ({ data: await service.content(schema.attachmentIdSchema.parse(body).id) }),
  remove: async ({ user, body }) => ({ data: await service.remove(user.id, schema.attachmentRemoveSchema.parse(body)) }),
};
