import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { createGateV1Store } from '../models/gate-v1.store.js';
export const gateV1Service = createGateV1Store(db, { tenantSlug: env.TENANT_SLUG, secret: env.TICKET_QR_SECRET });
