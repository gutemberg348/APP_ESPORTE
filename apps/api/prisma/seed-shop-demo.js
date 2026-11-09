import { readFile } from "node:fs/promises";
import { db } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { createShopStore } from "../src/models/shop.store.js";
import { productSchema } from "../src/validators/shop.js";
if (env.NODE_ENV === "production")
  throw new Error(
    "Produtos demonstrativos não podem ser cadastrados em produção.",
  );
const images = JSON.parse(
  await readFile(new URL("./shop-demo-images.json", import.meta.url), "utf8"),
);
const fixtures = [
  {
    key: "camisa-torcedor",
    name: "Camisa Torcedor · Alvirrubra",
    category: "Camisas",
    priceCents: 14990,
    compareAtCents: 17990,
    costCents: 6500,
    weightGrams: 300,
    labels: ["P", "M", "G", "GG"],
    stock: 12,
  },
  {
    key: "camisa-treino",
    name: "Camisa Treino · Vermelha",
    category: "Camisas",
    priceCents: 9990,
    compareAtCents: 11990,
    costCents: 4000,
    weightGrams: 250,
    labels: ["P", "M", "G", "GG"],
    stock: 10,
  },
  {
    key: "bone",
    name: "Boné ECP · Bordado",
    category: "Acessórios",
    priceCents: 5990,
    compareAtCents: null,
    costCents: 2200,
    weightGrams: 180,
    labels: ["Ajustável"],
    stock: 20,
  },
  {
    key: "caneca",
    name: "Caneca ECP · Vermelha e branca",
    category: "Casa & presentes",
    priceCents: 3990,
    compareAtCents: null,
    costCents: 1500,
    weightGrams: 450,
    labels: ["325 ml"],
    stock: 18,
  },
  {
    key: "cachecol",
    name: "Cachecol da Torcida · ECP",
    category: "Acessórios",
    priceCents: 6990,
    compareAtCents: 7990,
    costCents: 2600,
    weightGrams: 220,
    labels: ["Único"],
    stock: 15,
  },
];
try {
  const actor = await db.user.findFirst({
    where: { role: "ADMIN", active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!actor)
    throw new Error(
      "Cadastre um administrador antes de executar shop:seed-demo.",
    );
  const store = createShopStore(db, { settings: env });
  let created = 0,
    skipped = 0;
  for (const [index, fixture] of fixtures.entries()) {
    const prefix = `DEMO-ECP-${index + 1}`;
    if (
      await db.productVariant.findFirst({
        where: { sku: { startsWith: `${prefix}-` } },
      })
    ) {
      skipped++;
      continue;
    }
    await store.saveProduct(
      actor.id,
      productSchema.parse({
        name: fixture.name,
        category: fixture.category,
        description:
          "PRODUTO DE TESTE — imagem conceitual criada para demonstração do aplicativo. Não representa um produto oficial à venda. Preço e estoque são fictícios. Use apenas para validar catálogo, carrinho e pedidos.",
        images: [images[fixture.key]],
        priceCents: fixture.priceCents,
        compareAtCents: fixture.compareAtCents,
        costCents: fixture.costCents,
        weightGrams: fixture.weightGrams,
        widthCm: fixture.key === "caneca" ? 14 : 22,
        heightCm: fixture.key === "caneca" ? 14 : 8,
        lengthCm: 26,
        active: true,
        featured: index === 0,
        variants: fixture.labels.map((label, position) => ({
          sku: `${prefix}-${position + 1}`,
          label,
          initialStock: fixture.stock,
          lowStock: 3,
          active: true,
        })),
      }),
    );
    created++;
  }
  await db.shopSettings.upsert({
    where: { id: "main" },
    create: {
      id: "main",
      name: "Loja do Esporte",
      enabled: true,
      mode: "INTERNAL",
      pickupEnabled: true,
      pickupAddress:
        "Retirada demonstrativa — local e horário a combinar com atendimento. Ambiente de testes.",
      paymentInstructions:
        "Catálogo demonstrativo. Não envie dinheiro real para pedidos destes produtos de teste.",
    },
    update: { name: "Loja do Esporte", enabled: true, mode: "INTERNAL" },
  });
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      action: "SHOP_DEMO_CATALOG_CREATED",
      entityId: "main",
      details: { created, skipped },
    },
  });
  console.log(
    JSON.stringify({
      created,
      skipped,
      products: await db.product.count({
        where: { variants: { some: { sku: { startsWith: "DEMO-ECP-" } } } },
      }),
    }),
  );
} catch (error) {
  console.error(error.code || error.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
