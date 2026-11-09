import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { createShopStore } from '../models/shop.store.js';
import { createShippingProvider } from '../shipping/providers.js';
export const shippingProvider = createShippingProvider({ settings: env });
export const shopService = createShopStore(db, { settings: env, shipping: shippingProvider });
