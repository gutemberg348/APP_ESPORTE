import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { createGateV1Store } from '../models/gate-v1.store.js';
import { createAppGate } from './app-gate.js';
import { staffService } from './staff.service.js';
import { ticketEntryService } from './ticket-entry.service.js';
import { createAdminReportsStore } from '../models/admin-reports.store.js';

export const appGate = createAppGate({ staff: staffService, entry: ticketEntryService, reports: createAdminReportsStore(db) });
export const gateV1Service = createGateV1Store(db, { tenantSlug: env.TENANT_SLUG, secret: env.TICKET_QR_SECRET });
