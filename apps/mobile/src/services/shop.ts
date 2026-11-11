import type { ShopSettings, ShopSettingsInput, Product, ProductInput, ProductPage, ShippingRule, CartInput, ShopQuote, ShopCheckoutInput, ShopOrder, ShopOrdersPage, ShopPage, StockVariant, StockMovement, ShopAddress } from '@nacional/shared/shop';
import type { ShopImage, ShopImageUpload } from '@nacional/shared/shop';
import { request } from './api';
const qs = (values: Record<string, string>) => new URLSearchParams(Object.entries(values).filter(([, value]) => value)).toString();
export const shopApi = {
  settings: (token: string) => request<ShopSettings>('/shop/settings', { token }),
  products: (token: string, filters: Record<string, string> = {}) => request<ProductPage>(`/shop/products?${qs({ limit: '24', ...filters })}`, { token }),
  postalCode: (token: string, postalCode: string) => request<Omit<ShopAddress, 'number' | 'complement'>>(`/shop/postal-code?${qs({ postalCode })}`, { token }),
  quote: (token: string, body: CartInput) => request<ShopQuote>('/shop/quote', { token, method: 'POST', body }),
  checkout: (token: string, body: ShopCheckoutInput) => request<ShopOrder>('/shop/orders', { token, method: 'POST', body }),
  orders: (token: string, filters: Record<string, string> = {}) => request<ShopOrdersPage>(`/shop/orders?${qs({ limit: '20', ...filters })}`, { token }),
  cancel: (token: string, orderId: string) => request<ShopOrder>('/shop/orders/cancel', { token, method: 'POST', body: { orderId } }),
};
export const shopAdminApi = {
  uploadImage: (token: string, body: ShopImageUpload) => request<ShopImage>('/admin/shop/images', { token, method: 'POST', body, timeoutMs: 45000 }),
  generateSku: (token: string, excludeSkus: string[]) => request<{ sku: string }>('/admin/shop/skus/generate', { token, method: 'POST', body: { excludeSkus } }),
  checkSkus: (token: string, items: { sku: string; variantId?: string }[]) => request<{ sku: string; status: 'AVAILABLE' | 'CURRENT' | 'USED' }[]>('/admin/shop/skus/check', { token, method: 'POST', body: { items } }),
  settings: (token: string) => request<ShopSettings>('/admin/shop/settings', { token }),
  saveSettings: (token: string, body: ShopSettingsInput) => request<ShopSettings>('/admin/shop/settings', { token, method: 'PUT', body }),
  products: (token: string, filters: Record<string, string> = {}) => request<ProductPage>(`/admin/shop/products?${qs({ limit: '25', ...filters })}`, { token }),
  saveProduct: (token: string, body: ProductInput & { id?: string; version?: number }) => request<Product>('/admin/shop/products', { token, method: body.id ? 'PATCH' : 'POST', body }),
  archive: (token: string, id: string, version: number, reason: string) => request('/admin/shop/products', { token, method: 'DELETE', body: { id, version, reason } }),
  stock: (token: string, filters: Record<string, string> = {}) => request<ShopPage<StockVariant>>(`/admin/shop/stock?${qs({ limit: '25', ...filters })}`, { token }),
  adjustStock: (token: string, body: { variantId: string; version: number; quantity: number; reason: string; requestKey: string }) => request('/admin/shop/stock', { token, method: 'POST', body }),
  movements: (token: string, filters: Record<string, string> = {}) => request<StockMovement[]>(`/admin/shop/stock/movements?${qs({ limit: '25', ...filters })}`, { token }),
  rules: (token: string) => request<ShippingRule[]>('/admin/shop/shipping', { token }),
  saveRule: (token: string, body: Omit<ShippingRule, 'id' | 'version'> & { id?: string; version?: number }) => request<ShippingRule>('/admin/shop/shipping', { token, method: body.id ? 'PATCH' : 'POST', body }),
  orders: (token: string, filters: Record<string, string> = {}) => request<ShopOrdersPage>(`/admin/shop/orders?${qs({ limit: '25', ...filters })}`, { token }),
  cancel: (token: string, orderId: string) => request<ShopOrder>('/admin/shop/orders/cancel', { token, method: 'POST', body: { orderId } }),
  confirm: (token: string, body: { orderId: string; receivedCents: number; reference: string; paymentVerified: true; reason: string }) => request<ShopOrder>('/admin/shop/orders/confirm', { token, method: 'POST', body }),
  refundManual: (token: string, body: { orderId: string; refundedCents: number; reference: string; refundVerified: true; reason: string }) => request<ShopOrder>('/admin/shop/orders/refund-manual', { token, method: 'POST', body }),
  fulfill: (token: string, body: { orderId: string; version: number; status: string; trackingCode: string; trackingUrl: string; notes: string; reason: string }) => request<ShopOrder>('/admin/shop/orders', { token, method: 'PATCH', body }),
};
