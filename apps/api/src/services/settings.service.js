import { db } from '../config/database.js';
import { createSettingsStore } from '../models/settings.store.js';
export const settingsService = createSettingsStore(db);
