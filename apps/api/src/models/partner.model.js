import { db } from "../config/database.js";
import { env } from "../config/env.js";
import { createPartnerStore } from "./partner.store.js";
export const partnerModel = createPartnerStore(db, env.TENANT_SLUG);
