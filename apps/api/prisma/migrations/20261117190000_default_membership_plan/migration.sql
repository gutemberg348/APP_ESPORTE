-- Initial catalog entry requested by the club. Later admin edits are preserved.
INSERT INTO "Plan" ("id", "name", "priceCents", "discountPercent", "active", "description", "durationDays")
VALUES ('8f439fb5-e155-42c5-8872-d62ec9d70836', 'Sócio Esporte', 4000, 0, true,
        'Fortaleça o Esporte e tenha sua carteirinha digital de sócio por 30 dias. Ativação após confirmação do Pix.', 30)
ON CONFLICT DO NOTHING;
