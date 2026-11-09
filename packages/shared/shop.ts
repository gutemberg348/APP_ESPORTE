export interface ShopSettings {
  id: string; name: string; mode: 'INTERNAL' | 'EXTERNAL'; enabled: boolean; externalUrl: string;
  pickupEnabled: boolean; pickupAddress: string; shippingProvider: 'RULES' | 'MELHOR_ENVIO'; originPostalCode: string;
  paymentInstructions: string; supportPhone: string; updatedAt: string;
  pixEnabled: boolean; shippingConfigured: boolean; shippingEnvironment: 'sandbox' | 'production';
}
export type ShopSettingsInput = Omit<ShopSettings, 'id' | 'updatedAt' | 'pixEnabled' | 'shippingConfigured' | 'shippingEnvironment'>;
export interface ProductVariant { id: string; productId: string; sku: string; label: string; stock: number; reserved: number; available: number; lowStock: number; active: boolean; version: number }
export interface Product {
  id: string; name: string; description: string; category: string; images: string[]; priceCents: number; compareAtCents: number | null; costCents?: number;
  weightGrams: number; widthCm: number; heightCm: number; lengthCm: number; active: boolean; featured: boolean; archivedAt: string | null; version: number; createdAt: string; variants: ProductVariant[];
}
export type ProductInput = Pick<Product, 'name' | 'description' | 'category' | 'images' | 'priceCents' | 'compareAtCents' | 'weightGrams' | 'widthCm' | 'heightCm' | 'lengthCm' | 'active' | 'featured'> & { costCents: number; variants: { id?: string; sku: string; label: string; active: boolean; lowStock: number; initialStock?: number }[] };
export interface ShopPage<T> { items: T[]; total: number; limit?: number; offset?: number }
export interface ProductPage extends ShopPage<Product> { categories: string[] }
export interface ShippingRule { id: string; name: string; postalCodeFrom: string; postalCodeTo: string; baseCents: number; perKgCents: number; freeAboveCents: number | null; minDays: number; maxDays: number; active: boolean; version: number }
export interface ShippingOption { id: string; name: string; amountCents: number; totalCents: number; minDays: number; maxDays: number; testMode: boolean }
export interface ShopQuote { id: string; subtotalCents: number; options: ShippingOption[]; expiresAt: string; serverTime: string }
export interface CartInput { items: { variantId: string; quantity: number }[]; deliveryMethod: 'PICKUP' | 'DELIVERY'; postalCode: string }
export interface ShopAddress { postalCode: string; street: string; number: string; complement: string; district: string; city: string; state: string }
export interface ShopCheckoutInput extends CartInput { quoteId: string; shippingOptionId: string; recipient: string; phone: string; address?: ShopAddress; expectedTotalCents: number; requestKey: string }
export type ShopOrderStatus = 'PENDING' | 'EXPIRED' | 'PAID' | 'PREPARING' | 'READY' | 'SHIPPED' | 'DELIVERED' | 'CANCELED' | 'REFUNDED' | 'REFUND_REVIEW';
export interface ShopOrderItem { id: string; variantId: string; productName: string; variantLabel: string; sku: string; image: string; quantity: number; unitPriceCents: number; costCents?: number }
export interface ShopOrder {
  id: string; number: number; userId: string; status: ShopOrderStatus; recipient: string; phone: string; address: Partial<ShopAddress> & { pickupAddress?: string };
  deliveryMethod: 'PICKUP' | 'DELIVERY'; shippingName: string; shippingService: string; shippingDays: number; subtotalCents: number; shippingCents: number; totalCents: number;
  expiresAt: string; trackingCode: string; trackingUrl: string; notes: string; version: number; createdAt: string; serverTime: string;
  items: ShopOrderItem[]; payment: { method: string; amountCents: number; refundedCents: number; confirmedAt: string } | null; intentId: string | null;
  user?: { id: string; name: string; email: string };
}
export interface ShopOrdersPage extends ShopPage<ShopOrder> { summary: { paidCents: number; refundedCents: number; netCents: number; pending: number } }
export interface StockVariant extends ProductVariant { product: { name: string; archivedAt: string | null } }
export interface StockMovement { id: string; kind: 'INITIAL' | 'ADJUSTMENT' | 'SALE' | 'RETURN'; quantity: number; balanceAfter: number; reason: string; createdAt: string; orderId: string | null; variant: { sku: string; label: string; product: { name: string } }; actor: { name: string } }
