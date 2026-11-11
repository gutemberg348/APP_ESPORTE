import { db } from '../config/database.js';
import { createShopImageStore } from '../models/shop-image.store.js';
export const shopImageService = createShopImageStore(db);
