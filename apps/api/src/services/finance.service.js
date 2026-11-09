import { db } from '../config/database.js';
import { createFinanceStore } from '../models/finance.store.js';
export const financeService=createFinanceStore(db);
