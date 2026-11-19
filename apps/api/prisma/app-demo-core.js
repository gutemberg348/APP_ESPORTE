import { createHash } from 'node:crypto';
import { productSchema } from '../src/validators/shop.js';
import { seedDemoV1 } from './app-demo-v1.js';

const idFor = (key) => { const h = createHash('sha256').update(key).digest('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`; };
export function demoMatches(now = new Date()) {
  const localDay = new Date(now.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  return Array.from({ length: 6 }, (_, index) => {
    const startsAt = new Date(`${localDay}T19:00:00-03:00`);
    startsAt.setUTCDate(startsAt.getUTCDate() + (index + 1) * 3);
    return { slug: `app-teste-jogo-${index + 1}`, homeTeam: 'Esporte', awayTeam: `Adversário teste ${index + 1}`, startsAt,
      stadium: 'José Cavalcanti · TESTE', competition: 'TESTE — sem evento real', isHome: true, published: true,
      salesEnabled: true, salesOpenAt: now, salesCloseAt: new Date(startsAt.getTime() - 3600000),
      sectors: { create: [{ name: 'Arquibancada · TESTE', priceCents: 10, capacity: 100 }, { name: 'Cadeiras · TESTE', priceCents: 200, capacity: 30 }] } };
  });
}

// Explicit operator seed, never part of migrate deploy. One transaction prevents partial fixtures.
export async function seedAppDemo(db, { images, enableShop = false, tenantSlug = 'nacional-patos', now = new Date() }) {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(78216403)`;
    const actor = await tx.user.findFirst({ where: { role: { in: ['ADMIN', 'OWNER'] }, active: true }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (!actor) throw new Error('Cadastre um administrador ativo antes de executar o seed.');
    let productsCreated = 0;
    const schedule = demoMatches(now);
    const v1 = await seedDemoV1(tx, { tenantSlug, schedule });
    const matchesCreated = v1.matchesCreated;
    const shirts = ['Alvirrubra', 'Treino vermelha', 'Torcedor infantil', 'Torcedora', 'Treino juvenil'];
    for (const [index, name] of shirts.entries()) {
      const id = idFor(`esporte-app-demo-shirt-${index}`);
      if (await tx.product.findUnique({ where: { id } })) continue;
      const input = productSchema.parse({ name: `[TESTE] Camisa Esporte · ${name}`, category: 'Camisas',
        description: 'PRODUTO DE TESTE. Imagem conceitual; não representa mercadoria disponível para entrega. Preço e estoque fictícios. Ajuste ou arquive no painel após testar.',
        images: [images[index % 2 ? 'camisa-treino' : 'camisa-torcedor']], priceCents: 100 + index * 100,
        compareAtCents: null, costCents: 0, weightGrams: 250, widthCm: 22, heightCm: 5, lengthCm: 26, active: true, featured: true,
        variants: ['P', 'M', 'G', 'GG'].map((label, size) => ({ sku: `APP-TESTE-CAM-${index + 1}-${size + 1}`, label, initialStock: 10, lowStock: 2, active: true })) });
      const { variants, ...product } = input;
      await tx.product.create({ data: { id, ...product } });
      for (const { initialStock, ...variant } of variants) {
        const row = await tx.productVariant.create({ data: { ...variant, productId: id, stock: initialStock } });
        await tx.stockMovement.create({ data: { variantId: row.id, actorId: actor.id, requestKey: `INITIAL:${row.id}`, kind: 'INITIAL', quantity: initialStock, balanceAfter: initialStock, reason: 'Estoque de teste do app' } });
      }
      productsCreated++;
    }
    if (enableShop) {
      const previous = await tx.shopSettings.findUnique({ where: { id: 'main' } });
      const pickupAddress = 'Retirada de teste — não compareça ao estádio.';
      await tx.shopSettings.upsert({ where: { id: 'main' },
        create: { id: 'main', name: 'Loja do Esporte', enabled: true, mode: 'INTERNAL', pickupEnabled: true, pickupAddress },
        update: { enabled: true, mode: 'INTERNAL', ...(previous?.pickupEnabled && !previous.pickupAddress.trim() ? { pickupAddress } : {}) } });
    }
    const result = { matchesCreated, productsCreated, shopEnabledByCommand: enableShop, v1 };
    await tx.auditLog.create({ data: { actorId: actor.id, action: 'APP_DEMO_SEEDED', entityId: 'app-demo-v1', details: result } });
    return result;
  }, { timeout: 30000 });
}
