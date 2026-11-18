BEGIN;

-- Reprice only the original arquibancada fixtures from db:seed:test.
-- Reservations, issued tickets and payment intents retain their snapshots.
UPDATE "Sector" s
SET "priceCents" = 10
FROM "Match" m
WHERE m.id = s."matchId" AND m.slug ~ '^app-teste-jogo-[1-6]$'
  AND m.competition = 'TESTE — sem evento real'
  AND s.name = 'Arquibancada · TESTE' AND s."priceCents" = 100;

UPDATE ingresso_v1_lotes l
SET "precoCentavos" = CASE l."tipoCategoria" WHEN 'INTEIRA' THEN 10 ELSE 5 END
FROM ingresso_v1_alocacoes_setor_partida a
JOIN ingresso_v1_partidas p ON p.id = a."partidaId"
JOIN ingresso_v1_setores_estadio s ON s.id = a."setorId"
JOIN ingresso_v1_templates_venda t ON t.id = p."templateVendaId" AND t."estadioId" = s."estadioId"
WHERE l."alocacaoId" = a.id AND t.nome = '[TESTE APP] Venda Esporte'
  AND p."timeMandante" = '[TESTE] Esporte' AND p."timeVisitante" ~ '^Adversário teste [1-6]$'
  AND s.nome = '[TESTE APP] Arquibancada' AND (
    (l."tipoCategoria" = 'INTEIRA' AND l.nome = 'Inteira TESTE' AND l."precoCentavos" = 100) OR
    (l."tipoCategoria" = 'MEIA' AND l.nome = 'Meia TESTE' AND l."precoCentavos" = 50)
  );

UPDATE ingresso_v1_regras_setor_template r
SET "precoBaseCentavos" = 10
FROM ingresso_v1_templates_venda t, ingresso_v1_setores_estadio s
WHERE r."templateId" = t.id AND r."setorId" = s.id AND t."estadioId" = s."estadioId"
  AND t.nome = '[TESTE APP] Venda Esporte' AND s.nome = '[TESTE APP] Arquibancada'
  AND r."precoBaseCentavos" = 100;

COMMIT;
