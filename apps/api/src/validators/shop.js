import { SHOP_IMAGE_MAX_COUNT } from '@nacional/shared/shop-media';
import { z } from 'zod';
import { digits } from '@nacional/shared/forms';
import { paginationSchema } from './index.js';
const amount = z.number().int().min(0).max(100000000);
const text = (max) => z.string().trim().max(max);
const phone = text(25).transform((value) => digits(value, 15)).pipe(z.string().regex(/^[1-9]{2}[2-9]\d{7,8}$/, 'Informe telefone com DDD.'));
export const postalCode = text(12).transform((value) => digits(value)).pipe(z.string().regex(/^\d{8}$/, 'Informe um CEP com 8 dígitos.'));
export const safeUrl = text(1000).refine((value) => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } }, 'Informe um endereço HTTPS válido.');
const optionalUrl = z.union([z.literal(''), safeUrl]);
export const productImage = z.union([safeUrl, z.string().regex(/^\/media\/shop\/[a-z0-9-]+\.(png|jpg|webp)$/)]);
const version = z.number().int().min(0);
const sku = text(80).min(1).transform((value) => value.toUpperCase());
export const generateSkuSchema = z.object({ excludeSkus: z.array(sku).max(50).default([]) }).strict();
export const checkSkusSchema = z.object({ items: z.array(z.object({ sku, variantId: z.uuid().optional() }).strict()).min(1).max(50) }).strict();
export const settingsSchema = z.object({ name: text(100).min(2), mode: z.enum(['INTERNAL', 'EXTERNAL']), enabled: z.boolean(), externalUrl: optionalUrl, pickupEnabled: z.boolean(), pickupAddress: text(500), shippingProvider: z.enum(['RULES', 'MELHOR_ENVIO']), originPostalCode: z.union([z.literal(''), postalCode]), paymentInstructions: text(1000), supportPhone: z.union([z.literal(''), phone]) }).strict().superRefine((value, ctx) => {
  if (value.enabled && value.mode === 'EXTERNAL' && !value.externalUrl) ctx.addIssue({ code: 'custom', path: ['externalUrl'], message: 'Informe o link da loja.' });
  if (value.enabled && value.mode === 'INTERNAL' && value.pickupEnabled && !value.pickupAddress) ctx.addIssue({ code: 'custom', path: ['pickupAddress'], message: 'Informe o endereço para retirada.' });
  if (value.shippingProvider === 'MELHOR_ENVIO' && !value.originPostalCode) ctx.addIssue({ code: 'custom', path: ['originPostalCode'], message: 'Informe o CEP de origem.' });
});
export const productSchema = z.object({ name: text(150).min(2), description: text(4000).default(''), category: text(80).min(1).default('Geral'), images: z.array(productImage).max(SHOP_IMAGE_MAX_COUNT).default([]), priceCents: amount, compareAtCents: amount.nullable().default(null), costCents: amount.default(0), weightGrams: z.number().int().min(1).max(100000), widthCm: z.number().int().min(1).max(200), heightCm: z.number().int().min(1).max(200), lengthCm: z.number().int().min(1).max(200), active: z.boolean(), featured: z.boolean().default(false), variants: z.array(z.object({ id: z.uuid().optional(), sku: text(80).min(1).transform((value) => value.toUpperCase()), label: text(100).min(1), active: z.boolean(), lowStock: z.number().int().min(0).max(100000), initialStock: z.number().int().min(0).max(100000).optional() }).strict()).min(1).max(50) }).strict().superRefine((value, ctx) => {
  if (value.compareAtCents !== null && value.compareAtCents <= value.priceCents) ctx.addIssue({ code: 'custom', path: ['compareAtCents'], message: 'O preço anterior deve ser maior que o preço de venda.' });
  if (new Set(value.variants.map((variant) => variant.sku)).size !== value.variants.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Cada variação deve ter um SKU diferente.' });
  const existingIds = value.variants.filter((variant) => variant.id).map((variant) => variant.id);
  if (new Set(existingIds).size !== existingIds.length) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Uma variação não pode ser enviada duas vezes.' });
  if (value.variants.some((variant) => variant.id && variant.initialStock !== undefined)) ctx.addIssue({ code: 'custom', path: ['variants'], message: 'Ajuste o estoque de variações existentes na aba Estoque.' });
});
export const updateProductSchema = productSchema.safeExtend({ id: z.uuid(), version });
export const archiveSchema = z.object({ id: z.uuid(), version, reason: text(500).min(5) }).strict();
export const stockSchema = z.object({ variantId: z.uuid(), version, quantity: z.number().int().min(-100000).max(100000).refine((value) => value !== 0), reason: text(500).min(5), requestKey: text(80).min(16) }).strict();
export const shippingSchema = z.object({ name: text(100).min(2), postalCodeFrom: postalCode, postalCodeTo: postalCode, baseCents: amount, perKgCents: amount, freeAboveCents: amount.nullable(), minDays: z.number().int().min(0).max(120), maxDays: z.number().int().min(0).max(120), active: z.boolean() }).strict().refine((value) => value.postalCodeFrom <= value.postalCodeTo && value.minDays <= value.maxDays, 'Confira a faixa de CEP e os prazos.');
export const updateShippingSchema = shippingSchema.safeExtend({ id: z.uuid(), version });
export const cartSchema = z.object({ items: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(20) }).strict()).min(1).max(20), deliveryMethod: z.enum(['PICKUP', 'DELIVERY']), postalCode: z.union([z.literal(''), postalCode]).default('') }).strict().superRefine((value, ctx) => {
  if (new Set(value.items.map((item) => item.variantId)).size !== value.items.length) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Agrupe as quantidades de cada variação.' });
  if (value.items.reduce((sum, item) => sum + item.quantity, 0) > 50) ctx.addIssue({ code: 'custom', path: ['items'], message: 'Limite de 50 unidades por pedido.' });
  if (value.deliveryMethod === 'DELIVERY' && !value.postalCode) ctx.addIssue({ code: 'custom', path: ['postalCode'], message: 'Informe o CEP para entrega.' });
});
const address = z.object({ postalCode, street: text(150).min(2), number: text(20).min(1), complement: text(100).default(''), district: text(100).min(2), city: text(100).min(2), state: z.enum(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']) }).strict();
export const checkoutSchema = cartSchema.safeExtend({ quoteId: z.uuid(), shippingOptionId: text(80).min(1), recipient: text(100).min(2), phone, address: address.optional(), expectedTotalCents: amount, requestKey: text(80).min(16) }).superRefine((value, ctx) => {
  if (value.deliveryMethod === 'DELIVERY' && (!value.address || value.address.postalCode !== value.postalCode)) ctx.addIssue({ code: 'custom', path: ['address'], message: 'Confira o endereço e o CEP da cotação.' });
});
export const orderIdSchema = z.object({ orderId: z.uuid() }).strict();
export const confirmShopSchema = orderIdSchema.extend({ receivedCents: amount, reference: text(80).min(5), paymentVerified: z.literal(true), reason: text(500).min(5) }).strict();
export const refundShopSchema = orderIdSchema.extend({ refundedCents: amount, reference: text(80).min(5), refundVerified: z.literal(true), reason: text(500).min(5) }).strict();
export const fulfillSchema = z.object({ orderId: z.uuid(), version, status: z.enum(['PREPARING', 'READY', 'SHIPPED', 'DELIVERED']), trackingCode: text(100).default(''), trackingUrl: optionalUrl.default(''), notes: text(1000).default(''), reason: text(500).min(5) }).strict();
export const shopQuerySchema = paginationSchema.extend({ search: text(100).default(''), status: z.enum(['PENDING','EXPIRED','PAID','PREPARING','READY','SHIPPED','DELIVERED','CANCELED','REFUNDED','REFUND_REVIEW']).optional(), category: text(80).optional(), active: z.enum(['true','false']).optional(), from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional() }).strict().refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), 'A data inicial deve ser anterior à final.');
