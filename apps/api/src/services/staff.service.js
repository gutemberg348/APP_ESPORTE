import { staffModel } from '../models/staff.model.js';
import { assertAdmin } from '../lib/ticket-rules.js';
import { assertGateUser } from '../lib/gate-rules.js';
import { hashPassword } from '../lib/crypto.js';
export const staffService = {
  list(user, query) { assertAdmin(user); return staffModel.list(query); },
  async create(user, { name, email, password }) { assertAdmin(user); return staffModel.create(user.id, { name, email, passwordHash: await hashPassword(password) }); },
  update(user, input) { assertAdmin(user); return staffModel.update(user.id, input); },
  async password(user, { userId, password }) { assertAdmin(user); await staffModel.password(user.id, userId, await hashPassword(password)); },
  assignments(user, input) { assertAdmin(user); return staffModel.assignments(user.id, input); },
  gateMatches(user) { assertGateUser(user); return staffModel.gateMatches(user); },
};
