import { db } from '../config/database.js';
import { createWithdrawalStore } from '../models/withdrawal.store.js';
export const withdrawalService = createWithdrawalStore(db);
