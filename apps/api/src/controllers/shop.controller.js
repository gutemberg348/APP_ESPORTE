import { shopService, shopSkuService, shippingProvider } from '../services/shop.service.js';
import * as schema from '../validators/shop.js';
import { z } from 'zod';
const query = (url) => Object.fromEntries(url.searchParams);
export const shopController = {
  generateSku: async ({ body }) => ({ data: await shopSkuService.generate(schema.generateSkuSchema.parse(body).excludeSkus) }),
  checkSkus: async ({ body }) => ({ data: await shopSkuService.check(schema.checkSkusSchema.parse(body).items) }),
  settings: async () => ({ data: await shopService.settings() }),
  adminSettings: async () => ({ data: await shopService.settings(true) }),
  saveSettings: async ({ user, body }) => ({ data: await shopService.saveSettings(user.id, schema.settingsSchema.parse(body)) }),
  products: async ({ url }) => ({ data: await shopService.products(schema.shopQuerySchema.parse(query(url)), false) }),
  adminProducts: async ({ url }) => ({ data: await shopService.products(schema.shopQuerySchema.parse(query(url)), true) }),
  createProduct: async ({ user, body }) => ({ status: 201, data: await shopService.saveProduct(user.id, schema.productSchema.parse(body)) }),
  updateProduct: async ({ user, body }) => ({ data: await shopService.saveProduct(user.id, schema.updateProductSchema.parse(body)) }),
  archiveProduct: async ({ user, body }) => ({ data: await shopService.archive(user.id, schema.archiveSchema.parse(body)) }),
  stock: async ({ url }) => ({ data: await shopService.stock(schema.shopQuerySchema.parse(query(url))) }),
  adjustStock: async ({ user, body }) => ({ data: await shopService.adjustStock(user.id, schema.stockSchema.parse(body)) }),
  movements: async ({ url }) => ({ data: await shopService.movements(schema.shopQuerySchema.parse(query(url))) }),
  rules: async () => ({ data: await shopService.shippingRules() }),
  createRule: async ({ user, body }) => ({ status: 201, data: await shopService.saveShippingRule(user.id, schema.shippingSchema.parse(body)) }),
  updateRule: async ({ user, body }) => ({ data: await shopService.saveShippingRule(user.id, schema.updateShippingSchema.parse(body)) }),
  postalCode: async ({ url }) => ({ data: await shippingProvider.postalCode(z.object({ postalCode: schema.postalCode }).strict().parse(query(url)).postalCode) }),
  quote: async ({ user, body }) => ({ data: await shopService.quote(user.id, schema.cartSchema.parse(body)) }),
  checkout: async ({ user, body }) => ({ status: 201, data: await shopService.reserve(user.id, schema.checkoutSchema.parse(body)) }),
  orders: async ({ user, url }) => ({ data: await shopService.orders(user.id, schema.shopQuerySchema.parse(query(url))) }),
  adminOrders: async ({ user, url }) => ({ data: await shopService.orders(user.id, schema.shopQuerySchema.parse(query(url)), true) }),
  cancel: async ({ user, body }) => ({ data: await shopService.cancel(user.id, schema.orderIdSchema.parse(body).orderId) }),
  adminCancel: async ({ user, body }) => ({ data: await shopService.cancel(user.id, schema.orderIdSchema.parse(body).orderId, true) }),
  confirm: async ({ user, body }) => ({ data: await shopService.confirm(user.id, schema.confirmShopSchema.parse(body)) }),
  refundManual: async ({ user, body }) => ({ data: await shopService.refundManual(user.id, schema.refundShopSchema.parse(body)) }),
  fulfill: async ({ user, body }) => ({ data: await shopService.fulfill(user.id, schema.fulfillSchema.parse(body)) }),
};
