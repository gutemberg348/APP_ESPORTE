-- Test catalogue prices requested for the two initial membership plans.
-- Existing payment orders retain the price captured at checkout.
UPDATE "Plan"
SET "priceCents" = CASE "name"
    WHEN 'Sócio Canário' THEN 11
    WHEN 'Sócio Esporte' THEN 15
END
WHERE "name" IN ('Sócio Canário', 'Sócio Esporte');
