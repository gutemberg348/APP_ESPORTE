import { db } from '../config/database.js';
import { authUserInclude as include } from './auth.model.js';
export const userModel = {
  byEmail: (email) => db.user.findUnique({ where: { email }, include }),
  byId: (id) => db.user.findUnique({ where: { id }, include }),
  create: (data) => db.user.create({ data, include }),
  update: (id, data) => db.user.update({ where: { id }, data, include }),
};
