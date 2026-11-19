-- One-time catalogue price. Every size uses its parent product's price.
UPDATE "Product"
SET "priceCents" = 10,
    "compareAtCents" = CASE WHEN "compareAtCents" > 10 THEN "compareAtCents" END,
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "archivedAt" IS NULL
  AND "priceCents" <> 10
  AND (
    lower(btrim("category")) IN ('camisa', 'camisas', 'camiseta', 'camisetas')
    OR btrim("name") ~* '^(\[teste\][[:space:]]*)?(camisas?|camisetas?)\M'
  );
