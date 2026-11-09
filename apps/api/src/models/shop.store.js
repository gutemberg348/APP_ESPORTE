import { createHash } from 'node:crypto';
import { serializable } from '../lib/business-rules.js';
import { AppError } from '../lib/errors.js';
import { publicShopOrder, reservedStock, settleShopOrder, shopError, shopOrderInclude, applyShopRefund } from '../lib/shop-inventory.js';
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const audit = (tx, actorId, action, entityId, details) => tx.auditLog.create({ data: { actorId, action, entityId, details } });
const missing = () => new AppError(404, 'SHOP_NOT_FOUND', 'Registro da loja não encontrado.');
const stale = () => shopError('SHOP_STALE', 'Os dados foram atualizados por outra pessoa. Atualize a tela antes de salvar.');
const maxAmount = (value) => { if (!Number.isSafeInteger(value) || value < 0 || value > 100000000) throw shopError('SHOP_AMOUNT_LIMIT', 'O total ultrapassa o limite permitido.'); return value; };
export function createShopStore(client, { now = () => new Date(), shipping, settings: runtime = {} } = {}) {
  const config = (tx = client) => tx.shopSettings.upsert({ where: { id: 'main' }, create: { id: 'main' }, update: {} });
  async function stockMap(tx, ids) {
    const held = await tx.shopOrderItem.groupBy({ by: ['variantId'], where: { variantId: { in: ids }, order: { status: 'PENDING', expiresAt: { gt: now() } } }, _sum: { quantity: true } });
    return new Map(held.map((row) => [row.variantId, row._sum.quantity || 0]));
  }
  async function products(query, admin) {
    const { search = '', category, active, limit = 24, offset = 0 } = query;
    const where = { archivedAt: null, ...(admin ? active ? { active: active === 'true' } : {} : { active: true }), ...(category ? { category } : {}), ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } }] } : {}) };
    const [rows, total, categories] = await Promise.all([client.product.findMany({ where, include: { variants: { where: admin ? {} : { active: true }, orderBy: { sku: 'asc' } } }, orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }], take: limit, skip: offset }), client.product.count({ where }), client.product.findMany({ where: { archivedAt: null, ...(admin ? {} : { active: true }) }, distinct: ['category'], select: { category: true }, take: 200, orderBy: { category: 'asc' } })]);
    const held = await stockMap(client, rows.flatMap((row) => row.variants.map((variant) => variant.id)));
    return { items: rows.map(({ costCents, variants, ...product }) => ({ ...product, ...(admin ? { costCents } : {}), variants: variants.map((variant) => { const reserved = held.get(variant.id) || 0, available = Math.max(0, variant.stock - reserved); return admin ? { ...variant, reserved, available } : { id: variant.id, label: variant.label, sku: variant.sku, available }; }) })), total, offset, limit, categories: categories.map((row) => row.category) };
  }
  async function cart(tx, input) {
    const settings = await config(tx);
    if (!settings.enabled || settings.mode !== 'INTERNAL') throw shopError('SHOP_CLOSED', 'A compra pelo aplicativo não está disponível.');
    const userItems = [...input.items].sort((a, b) => a.variantId.localeCompare(b.variantId));
    const variants = await tx.productVariant.findMany({ where: { id: { in: userItems.map((item) => item.variantId) } }, include: { product: true } });
    const held = await stockMap(tx, variants.map((variant) => variant.id));
    const items = userItems.map((item) => {
      const variant = variants.find((row) => row.id === item.variantId);
      if (!variant || !variant.active || !variant.product.active || variant.product.archivedAt) throw shopError('SHOP_PRODUCT_UNAVAILABLE', 'Um dos produtos não está mais disponível.');
      if (variant.stock - (held.get(variant.id) || 0) < item.quantity) throw shopError('SHOP_OUT_OF_STOCK', `Estoque insuficiente para ${variant.product.name} · ${variant.label}.`);
      return { variant, quantity: item.quantity };
    });
    const subtotalCents = maxAmount(items.reduce((sum, { variant, quantity }) => sum + variant.product.priceCents * quantity, 0));
    const rules = await tx.shippingRule.findMany({ where: { active: true }, orderBy: { id: 'asc' } });
    const cartHash = hash([settings.updatedAt, runtime.MELHOR_ENVIO_ENVIRONMENT || 'sandbox', rules.map((rule) => [rule.id, rule.version]), items.map(({ variant, quantity }) => [variant.id, quantity, variant.active, variant.product.version, variant.product.priceCents, variant.product.weightGrams, variant.product.widthCm, variant.product.heightCm, variant.product.lengthCm])]);
    return { settings, rules, items, subtotalCents, cartHash };
  }
  async function liveBuyer(tx, userId) {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user?.active || !['USER', 'ADMIN'].includes(user.role)) throw new AppError(403, 'SHOP_ACCOUNT_REQUIRED', 'Sua conta não está habilitada para comprar.');
    return user;
  }
  return {
    async settings() {
      const value = await config();
      return { ...value, pixEnabled: runtime.PAYMENT_MODE === 'asaas', shippingConfigured: Boolean(runtime.MELHOR_ENVIO_TOKEN && runtime.MELHOR_ENVIO_CONTACT_EMAIL), shippingEnvironment: runtime.MELHOR_ENVIO_ENVIRONMENT || 'sandbox' };
    },
    async saveSettings(actorId, data) {
      if (data.shippingProvider === 'MELHOR_ENVIO' && data.enabled && data.mode === 'INTERNAL' && (!runtime.MELHOR_ENVIO_TOKEN || !runtime.MELHOR_ENVIO_CONTACT_EMAIL)) throw shopError('SHIPPING_NOT_CONFIGURED', 'Configure o token e o email do Melhor Envio na API antes de ativar este modo.');
      return serializable(client, async (tx) => { const row = await tx.shopSettings.upsert({ where: { id: 'main' }, create: { id: 'main', ...data }, update: data }); await audit(tx, actorId, 'SHOP_SETTINGS_UPDATED', row.id, { fields: Object.keys(data) }); return row; });
    },
    products,
    async saveProduct(actorId, { id, version, variants, ...data }) {
      return serializable(client, async (tx) => {
        const previous = id ? await tx.product.findUnique({ where: { id }, include: { variants: true } }) : null;
        if (id && (!previous || previous.archivedAt)) throw missing();
        if (previous && previous.version !== version) throw stale();
        const row = previous ? await tx.product.update({ where: { id }, data: { ...data, version: { increment: 1 } } }) : await tx.product.create({ data });
        const kept = new Set();
        for (const variant of variants) {
          const { id: variantId, initialStock = 0, ...fields } = variant;
          if (variantId) {
            if (!previous?.variants.some((item) => item.id === variantId)) throw shopError('SHOP_INVALID_VARIANT', 'A variação não pertence a este produto.');
            await tx.productVariant.update({ where: { id: variantId }, data: { ...fields, version: { increment: 1 } } }); kept.add(variantId);
          } else {
            const created = await tx.productVariant.create({ data: { ...fields, productId: row.id, stock: initialStock } }); kept.add(created.id);
            if (initialStock) await tx.stockMovement.create({ data: { variantId: created.id, actorId, requestKey: `INITIAL:${created.id}`, kind: 'INITIAL', quantity: initialStock, balanceAfter: initialStock, reason: 'Estoque inicial do produto' } });
          }
        }
        await tx.productVariant.updateMany({ where: { productId: row.id, id: { notIn: [...kept] } }, data: { active: false, version: { increment: 1 } } });
        await audit(tx, actorId, previous ? 'SHOP_PRODUCT_UPDATED' : 'SHOP_PRODUCT_CREATED', row.id, { name: row.name, priceCents: row.priceCents, variants: [...kept] });
        return tx.product.findUnique({ where: { id: row.id }, include: { variants: true } });
      });
    },
    archive(actorId, { id, version, reason }) {
      return serializable(client, async (tx) => { const row = await tx.product.findUnique({ where: { id } }); if (!row || row.archivedAt) throw missing(); if (row.version !== version) throw stale(); await tx.product.update({ where: { id }, data: { archivedAt: now(), active: false, version: { increment: 1 } } }); await audit(tx, actorId, 'SHOP_PRODUCT_ARCHIVED', id, { reason }); return { archived: true }; });
    },
    adjustStock(actorId, input) {
      return serializable(client, async (tx) => {
        const previous = await tx.stockMovement.findUnique({ where: { requestKey: input.requestKey } });
        if (previous) { if (previous.actorId !== actorId || previous.variantId !== input.variantId || previous.quantity !== input.quantity || previous.reason !== input.reason) throw shopError('SHOP_OPERATION_CONFLICT', 'Essa operação já foi usada com outros dados.'); return previous; }
        const variant = await tx.productVariant.findUnique({ where: { id: input.variantId } }); if (!variant) throw missing(); if (variant.version !== input.version) throw stale();
        const held = await reservedStock(tx, variant.id, now());
        const balance = variant.stock + input.quantity;
        if (balance < held || balance > 1000000) throw shopError('SHOP_STOCK_RESERVED', 'O saldo não pode ser negativo ou menor que as reservas ativas.');
        await tx.productVariant.update({ where: { id: variant.id }, data: { stock: balance, version: { increment: 1 } } });
        const movement = await tx.stockMovement.create({ data: { variantId: variant.id, actorId, requestKey: input.requestKey, quantity: input.quantity, balanceAfter: balance, kind: 'ADJUSTMENT', reason: input.reason } });
        await audit(tx, actorId, 'SHOP_STOCK_ADJUSTED', variant.id, { quantity: input.quantity, before: variant.stock, after: balance, reason: input.reason }); return movement;
      });
    },
    async stock(query) {
      const where = query.search ? { OR: [{ sku: { contains: query.search, mode: 'insensitive' } }, { product: { name: { contains: query.search, mode: 'insensitive' } } }] } : {};
      const [rows, total] = await Promise.all([client.productVariant.findMany({ where, include: { product: { select: { name: true, archivedAt: true } } }, orderBy: { sku: 'asc' }, take: query.limit, skip: query.offset }), client.productVariant.count({ where })]);
      const held = await stockMap(client, rows.map((row) => row.id));
      return { items: rows.map((row) => ({ ...row, reserved: held.get(row.id) || 0, available: Math.max(0, row.stock - (held.get(row.id) || 0)) })), total };
    },
    movements: ({ limit, offset, search }) => client.stockMovement.findMany({ where: search ? { variant: { OR: [{ sku: { contains: search, mode: 'insensitive' } }, { product: { name: { contains: search, mode: 'insensitive' } } }] } } : {}, include: { variant: { select: { sku: true, label: true, product: { select: { name: true } } } }, actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
    shippingRules: () => client.shippingRule.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], take: 200 }),
    saveShippingRule(actorId, { id, version, ...data }) {
      return serializable(client, async (tx) => { const previous = id ? await tx.shippingRule.findUnique({ where: { id } }) : null; if (id && !previous) throw missing(); if (previous && previous.version !== version) throw stale(); const row = id ? await tx.shippingRule.update({ where: { id }, data: { ...data, version: { increment: 1 } } }) : await tx.shippingRule.create({ data }); await audit(tx, actorId, 'SHOP_SHIPPING_RULE_SAVED', row.id, { name: row.name, active: row.active }); return row; });
    },
    async quote(userId, input) {
      await liveBuyer(client, userId);
      const value = await cart(client, input);
      let options = [];
      if (input.deliveryMethod === 'PICKUP') {
        if (!value.settings.pickupEnabled || !value.settings.pickupAddress) throw shopError('SHOP_PICKUP_DISABLED', 'A retirada não está disponível.');
        options = [{ id: 'pickup', name: 'Retirada na loja', amountCents: 0, minDays: 0, maxDays: 0, testMode: false }];
      } else if (value.settings.shippingProvider === 'MELHOR_ENVIO') options = await shipping.quote(value.settings.originPostalCode, input.postalCode, value.items);
      else {
        const weight = value.items.reduce((sum, item) => sum + item.variant.product.weightGrams * item.quantity, 0);
        options = value.rules.filter((rule) => input.postalCode >= rule.postalCodeFrom && input.postalCode <= rule.postalCodeTo).map((rule) => ({ id: `rule:${rule.id}`, name: rule.name, amountCents: maxAmount(rule.freeAboveCents !== null && value.subtotalCents >= rule.freeAboveCents ? 0 : rule.baseCents + Math.ceil(weight / 1000) * rule.perKgCents), minDays: rule.minDays, maxDays: rule.maxDays, testMode: false }));
      }
      if (!options.length) throw shopError('SHOP_NO_SHIPPING', 'Não há entrega disponível para esse CEP. Escolha retirada ou consulte a loja.');
      options.sort((a, b) => a.amountCents - b.amountCents);
      const quote = await client.shopShippingQuote.create({ data: { userId, cartHash: value.cartHash, postalCode: input.postalCode, deliveryMethod: input.deliveryMethod, options, expiresAt: new Date(now().getTime() + 10 * 60000) } });
      return { id: quote.id, subtotalCents: value.subtotalCents, options: options.map(({ packages, ...option }) => ({ ...option, totalCents: maxAmount(value.subtotalCents + option.amountCents) })), expiresAt: quote.expiresAt, serverTime: now() };
    },
    reserve(userId, input) {
      return serializable(client, async (tx) => {
        await liveBuyer(tx, userId);
        const requestHash = hash(input), previous = await tx.shopOrder.findUnique({ where: { userId_requestKey: { userId, requestKey: input.requestKey } }, include: shopOrderInclude });
        if (previous) { if (previous.requestHash !== requestHash) throw shopError('SHOP_OPERATION_CONFLICT', 'A chave de compra já foi usada com outros dados.'); return publicShopOrder(previous, now()); }
        const value = await cart(tx, input), quote = await tx.shopShippingQuote.findUnique({ where: { id: input.quoteId } });
        if (!quote || quote.userId !== userId || quote.cartHash !== value.cartHash || quote.postalCode !== input.postalCode || quote.deliveryMethod !== input.deliveryMethod || quote.expiresAt <= now()) throw shopError('SHOP_QUOTE_EXPIRED', 'Os valores mudaram ou a cotação venceu. Calcule o frete novamente.');
        const choice = quote.options.find((option) => option.id === input.shippingOptionId);
        if (!choice) throw shopError('SHOP_INVALID_SHIPPING', 'Selecione uma das opções de entrega calculadas.');
        if (choice.testMode && runtime.NODE_ENV === 'production' && runtime.ASAAS_ENVIRONMENT === 'production') throw shopError('SHOP_TEST_SHIPPING', 'Configure o Melhor Envio em produção antes de aceitar pagamentos reais com entrega.');
        const totalCents = maxAmount(value.subtotalCents + choice.amountCents);
        if (totalCents !== input.expectedTotalCents) throw shopError('SHOP_PRICE_CHANGED', 'O total mudou. Revise o pedido.');
        if (await tx.shopOrder.count({ where: { userId, status: 'PENDING', expiresAt: { gt: now() } } }) >= 3) throw shopError('SHOP_PENDING_LIMIT', 'Conclua ou cancele seus pedidos pendentes antes de reservar mais produtos.');
        if (quote.expiresAt <= now()) throw shopError('SHOP_QUOTE_EXPIRED', 'A cotação venceu. Calcule novamente.');
        let order = await tx.shopOrder.create({ data: { userId, requestKey: input.requestKey, requestHash, recipient: input.recipient, phone: input.phone, address: input.deliveryMethod === 'DELIVERY' ? input.address : { pickupAddress: value.settings.pickupAddress }, deliveryMethod: input.deliveryMethod, shippingName: choice.name, shippingService: choice.id, shippingDays: choice.maxDays, shippingSnapshot: { option: choice, originPostalCode: value.settings.originPostalCode, environment: runtime.MELHOR_ENVIO_ENVIRONMENT || null }, subtotalCents: value.subtotalCents, shippingCents: choice.amountCents, totalCents, expiresAt: new Date(now().getTime() + 30 * 60000), items: { create: value.items.map(({ variant, quantity }) => ({ variantId: variant.id, quantity, productName: variant.product.name, variantLabel: variant.label, sku: variant.sku, image: variant.product.images[0] || '', unitPriceCents: variant.product.priceCents, costCents: variant.product.costCents })) } }, include: shopOrderInclude });
        if (totalCents === 0) { await settleShopOrder(tx, order, { method: 'FREE', reference: `FREE:${order.id}`, actorId: userId, amountCents: 0, now }); order = await tx.shopOrder.findUnique({ where: { id: order.id }, include: shopOrderInclude }); }
        await audit(tx, userId, 'SHOP_ORDER_RESERVED', order.id, { totalCents, shippingService: choice.id, items: value.items.length }); return publicShopOrder(order, now());
      });
    },
    async orders(userId, query, admin = false) {
      const where = { ...(admin ? {} : { userId }), ...(query.status === 'EXPIRED' ? { status: 'PENDING', expiresAt: { lte: now() } } : query.status === 'PENDING' ? { status: 'PENDING', expiresAt: { gt: now() } } : query.status ? { status: query.status } : {}), ...(query.from || query.to ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {}), ...(query.search ? { OR: [{ recipient: { contains: query.search, mode: 'insensitive' } }, { user: { email: { contains: query.search, mode: 'insensitive' } } }, ...(/^\d+$/.test(query.search) && Number(query.search) <= 2147483647 ? [{ number: Number(query.search) }] : [])] } : {}) };
      const [rows, total, revenue, pending] = await Promise.all([client.shopOrder.findMany({ where, include: { ...shopOrderInclude, ...(admin ? { user: { select: { id: true, name: true, email: true } } } : {}) }, orderBy: { createdAt: 'desc' }, take: query.limit, skip: query.offset }), client.shopOrder.count({ where }), client.shopPayment.aggregate({ where: { order: where }, _sum: { amountCents: true, refundedCents: true } }), client.shopOrder.count({ where: { AND: [where, { status: 'PENDING', expiresAt: { gt: now() } }] } })]);
      return { items: rows.map((order) => publicShopOrder(order, now(), admin)), total, summary: { paidCents: revenue._sum.amountCents || 0, refundedCents: revenue._sum.refundedCents || 0, netCents: (revenue._sum.amountCents || 0) - (revenue._sum.refundedCents || 0), pending } };
    },
    cancel(userId, orderId, admin = false) {
      return serializable(client, async (tx) => { const order = await tx.shopOrder.findFirst({ where: { id: orderId, ...(admin ? {} : { userId }) }, include: shopOrderInclude }); if (!order) throw missing(); if (order.status === 'CANCELED') return publicShopOrder(order, now()); if (order.status !== 'PENDING' || order.payment) throw shopError('SHOP_CANCEL_PAID', 'Pedidos pagos exigem estorno pelo painel Pagamentos.'); await tx.shopOrder.update({ where: { id: orderId }, data: { status: 'CANCELED', version: { increment: 1 } } }); if (order.paymentIntent) await tx.gatewayIntent.update({ where: { id: order.paymentIntent.id }, data: { cancelRequestedAt: now(), pixPayload: null, wakeVersion: { increment: 1 }, nextAttemptAt: now() } }); await audit(tx, userId, 'SHOP_ORDER_CANCELED', orderId, {}); return publicShopOrder(await tx.shopOrder.findUnique({ where: { id: orderId }, include: shopOrderInclude }), now()); });
    },
    confirm(actorId, input) {
      return serializable(client, async (tx) => { const order = await tx.shopOrder.findUnique({ where: { id: input.orderId }, include: shopOrderInclude }); if (!order) throw missing(); if (!order.payment && order.paymentIntent && !['CANCELED', 'REFUNDED'].includes(order.paymentIntent.state)) throw shopError('PIX_IN_PROGRESS', 'Concilie ou cancele o Pix antes de confirmar um recebimento manual.'); await settleShopOrder(tx, order, { method: 'MANUAL', reference: `MANUAL:${input.reference}`, actorId, amountCents: input.receivedCents, now }); await audit(tx, actorId, 'SHOP_MANUAL_RECEIPT', order.id, { reason: input.reason }); return publicShopOrder(await tx.shopOrder.findUnique({ where: { id: order.id }, include: shopOrderInclude }), now(), true); });
    },
    refundManual(actorId, input) {
      return serializable(client, async (tx) => {
        const order = await tx.shopOrder.findUnique({ where: { id: input.orderId }, include: shopOrderInclude }); if (!order) throw missing();
        if (order.payment?.method !== 'MANUAL') throw shopError('SHOP_REFUND_METHOD', 'Use Pagamentos para estornar Pix Asaas. Este registro é exclusivo de recebimentos manuais.');
        const reference = `MANUAL-REFUND:${input.reference}`;
        if (order.payment.refundedCents > 0) {
          if (order.payment.refundReference === reference && order.payment.refundedCents === input.refundedCents) return publicShopOrder(order, now(), true);
          throw shopError('SHOP_ALREADY_REFUNDED', 'Este pedido já tem uma devolução registrada.');
        }
        if (!order.inventoryConsumedAt || input.refundedCents !== order.totalCents || input.refundedCents <= 0) throw shopError('SHOP_REFUND_AMOUNT', 'Informe a devolução integral do valor recebido.');
        await tx.shopPayment.update({ where: { orderId: order.id }, data: { refundReference: reference } });
        await applyShopRefund(tx, order, input.refundedCents, now, actorId, { reference, reason: input.reason, method: 'MANUAL' });
        return publicShopOrder(await tx.shopOrder.findUnique({ where: { id: order.id }, include: shopOrderInclude }), now(), true);
      });
    },
    fulfill(actorId, input) {
      return serializable(client, async (tx) => {
        const order = await tx.shopOrder.findUnique({ where: { id: input.orderId }, include: shopOrderInclude }); if (!order) throw missing(); if (order.version !== input.version) throw stale();
        if (!order.payment || order.payment.refundedCents > 0 || order.payment.amountCents !== order.totalCents || (order.payment.method === 'ASAAS' && (!order.paymentIntent || order.paymentIntent.refundRequestedAt || order.paymentIntent.state !== 'RECEIVED'))) throw shopError('SHOP_PAYMENT_REQUIRED', 'Confirme o recebimento e resolva eventuais estornos antes de despachar.');
        const next = { PAID: ['PREPARING', ...(order.deliveryMethod === 'PICKUP' ? ['READY'] : [])], PREPARING: order.deliveryMethod === 'PICKUP' ? ['READY'] : ['SHIPPED'], READY: ['DELIVERED'], SHIPPED: ['SHIPPED', 'DELIVERED'] };
        if (!next[order.status]?.includes(input.status)) throw shopError('SHOP_INVALID_TRANSITION', 'Essa etapa não está disponível para o pedido.');
        if (input.status === 'SHIPPED' && !input.trackingCode) throw shopError('SHOP_TRACKING_REQUIRED', 'Informe o código de rastreio para marcar como enviado.');
        await tx.shopOrder.update({ where: { id: order.id }, data: { status: input.status, trackingCode: input.trackingCode || order.trackingCode, trackingUrl: input.trackingUrl || order.trackingUrl, notes: input.notes, ...(input.status === 'SHIPPED' && !order.shippedAt ? { shippedAt: now() } : {}), ...(input.status === 'DELIVERED' ? { deliveredAt: now() } : {}), version: { increment: 1 } } });
        await audit(tx, actorId, 'SHOP_ORDER_FULFILLED', order.id, { before: order.status, after: input.status, reason: input.reason }); return publicShopOrder(await tx.shopOrder.findUnique({ where: { id: order.id }, include: shopOrderInclude }), now(), true);
      });
    },
  };
}
