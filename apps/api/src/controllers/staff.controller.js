import { staffService } from '../services/staff.service.js';
import { adminQuerySchema } from '../validators/admin.js';
import { employeeCreateSchema, employeeUpdateSchema, employeePasswordSchema, employeeAssignmentsSchema } from '../validators/staff.js';
export const staffController = {
  list: async ({ user, url }) => ({ data: await staffService.list(user, adminQuerySchema.parse(Object.fromEntries(url.searchParams))) }),
  create: async ({ user, body }) => ({ status: 201, data: await staffService.create(user, employeeCreateSchema.parse(body)) }),
  update: async ({ user, body }) => ({ data: await staffService.update(user, employeeUpdateSchema.parse(body)) }),
  password: async ({ user, body }) => { await staffService.password(user, employeePasswordSchema.parse(body)); return { status: 204 }; },
  assignments: async ({ user, body }) => ({ data: await staffService.assignments(user, employeeAssignmentsSchema.parse(body)) }),
  matches: async ({ user }) => ({ data: await staffService.gateMatches(user) }),
};
