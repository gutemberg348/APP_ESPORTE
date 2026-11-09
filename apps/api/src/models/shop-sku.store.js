import { randomBytes } from "node:crypto";
import { AppError } from "../lib/errors.js";
export function createShopSkuStore(
  db,
  {
    candidate = () => `PRD-${randomBytes(8).toString("hex").toUpperCase()}`,
  } = {},
) {
  return {
    async generate(excludeSkus = []) {
      const excluded = new Set(excludeSkus.map((v) => v.trim().toUpperCase()));
      for (let attempt = 0; attempt < 10; attempt++) {
        const sku = candidate();
        if (excluded.has(sku)) continue;
        // Archived products and inactive variants retain their references too.
        if (
          !(await db.productVariant.findFirst({
            where: { sku: { equals: sku, mode: "insensitive" } },
            select: { id: true },
          }))
        )
          return { sku };
      }
      throw new AppError(
        503,
        "SHOP_SKU_GENERATION_FAILED",
        "Não foi possível gerar uma referência livre. Tente novamente.",
      );
    },
    async check(items) {
      const rows = await db.productVariant.findMany({
        where: {
          OR: items.map(({ sku }) => ({
            sku: { equals: sku, mode: "insensitive" },
          })),
        },
        select: { id: true, sku: true },
      });
      return items.map(({ sku, variantId }) => {
        const existing = rows.find((v) => v.sku.toUpperCase() === sku);
        return {
          sku,
          status: !existing
            ? "AVAILABLE"
            : existing.id === variantId
              ? "CURRENT"
              : "USED",
        };
      });
    },
  };
}
