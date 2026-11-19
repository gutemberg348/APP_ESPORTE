BEGIN;
ALTER TABLE "Match" ADD COLUMN "partidaV1Id" uuid UNIQUE REFERENCES ingresso_v1_partidas(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sector" ADD COLUMN "alocacaoV1Id" uuid UNIQUE REFERENCES ingresso_v1_alocacoes_setor_partida(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep existing ticket and prediction IDs. The app sells the standard lot in
-- unnumbered sectors. Assigned seats continue to use the seat-aware checkout.
CREATE FUNCTION sync_app_sector(allocation_id uuid) RETURNS void LANGUAGE sql AS $$
  UPDATE "Sector" s SET
    name = v.nome,
    "priceCents" = coalesce(l."precoCentavos", 0),
    capacity = greatest(0, least(a."capacidadeLiberada" - a."quantidadeVendida" - a."quantidadeReservada",
                                 coalesce(l."quantidadeMaxima" - l."quantidadeVendida" - l."quantidadeReservada", 0))),
    "salesEnabled" = v.ativo AND NOT v.numerado AND l.id IS NOT NULL
  FROM ingresso_v1_alocacoes_setor_partida a
  JOIN ingresso_v1_setores_estadio v ON v.id = a."setorId"
  LEFT JOIN LATERAL (
    SELECT * FROM ingresso_v1_lotes WHERE "alocacaoId" = a.id AND ativo AND "tipoCategoria" = 'INTEIRA'
    ORDER BY "criadoEm", id LIMIT 1
  ) l ON true
  WHERE s."alocacaoV1Id" = a.id AND a.id = allocation_id;
$$;

CREATE FUNCTION sync_app_match(game_id uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE game record; app_id uuid; allocation record;
BEGIN
  SELECT p.*, coalesce(nullif(e."nomePopular", ''), e.nome) AS stadium, e.ativo AND t.active AS enabled
  INTO STRICT game FROM ingresso_v1_partidas p JOIN ingresso_v1_estadios e ON e.id = p."estadioId"
  JOIN "Tenant" t ON t.id = e."tenantId" WHERE p.id = game_id;
  INSERT INTO "Match" (id, "partidaV1Id", slug, "homeTeam", "awayTeam", "startsAt", stadium, competition, "isHome",
    published, "salesEnabled", "salesOpenAt", "salesCloseAt", "entryEnabled", "gateOpenAt", "gateCloseAt")
  VALUES (gen_random_uuid(), game.id, 'v1-' || game.id, game."timeMandante", game."timeVisitante", game."dataPartida",
    game.stadium, '', true, game.enabled AND game.status IN ('PUBLICADA','ESGOTADA'),
    game."vendasAtivas" AND game.status = 'PUBLICADA', game."inicioVendas", game."fimVendas",
    game.enabled AND game."portariaAtiva" AND game.status IN ('PUBLICADA','ESGOTADA'), game."portariaAbreEm", game."portariaFechaEm")
  ON CONFLICT ("partidaV1Id") DO UPDATE SET
    "homeTeam" = excluded."homeTeam", "awayTeam" = excluded."awayTeam", "startsAt" = excluded."startsAt",
    stadium = excluded.stadium, published = excluded.published, "salesEnabled" = excluded."salesEnabled",
    "salesOpenAt" = excluded."salesOpenAt", "salesCloseAt" = excluded."salesCloseAt",
    "entryEnabled" = excluded."entryEnabled", "gateOpenAt" = excluded."gateOpenAt", "gateCloseAt" = excluded."gateCloseAt"
  RETURNING id INTO app_id;
  FOR allocation IN SELECT a.id, v.nome FROM ingresso_v1_alocacoes_setor_partida a
    JOIN ingresso_v1_setores_estadio v ON v.id = a."setorId" WHERE a."partidaId" = game_id LOOP
    INSERT INTO "Sector" (id, "alocacaoV1Id", "matchId", name, "priceCents", capacity, "salesEnabled")
    VALUES (gen_random_uuid(), allocation.id, app_id, allocation.nome, 0, 0, false)
    ON CONFLICT ("alocacaoV1Id") DO NOTHING;
    PERFORM sync_app_sector(allocation.id);
  END LOOP;
END;
$$;

-- Stock changes and refunds update the app's sellable capacity in the
-- originating transaction. Its existing reservation checks then subtract app sales.
CREATE FUNCTION refresh_app_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'ingresso_v1_lotes' THEN
    IF TG_OP = 'DELETE' THEN PERFORM sync_app_sector(OLD."alocacaoId");
    ELSE PERFORM sync_app_sector(NEW."alocacaoId"); END IF;
  ELSE PERFORM sync_app_sector(NEW.id); END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER app_allocation_stock AFTER UPDATE ON ingresso_v1_alocacoes_setor_partida
FOR EACH ROW EXECUTE FUNCTION refresh_app_stock();
CREATE TRIGGER app_lot_stock AFTER INSERT OR UPDATE OR DELETE ON ingresso_v1_lotes
FOR EACH ROW EXECUTE FUNCTION refresh_app_stock();

CREATE FUNCTION refresh_linked_games() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE game_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'ingresso_v1_setores_estadio' THEN
    FOR game_id IN SELECT id FROM ingresso_v1_alocacoes_setor_partida WHERE "setorId" = NEW.id LOOP
      PERFORM sync_app_sector(game_id);
    END LOOP;
  ELSE
    FOR game_id IN SELECT p.id FROM ingresso_v1_partidas p JOIN "Match" m ON m."partidaV1Id" = p.id
      JOIN ingresso_v1_estadios e ON e.id = p."estadioId"
      WHERE (TG_TABLE_NAME = 'Tenant' AND e."tenantId" = NEW.id) OR (TG_TABLE_NAME = 'ingresso_v1_estadios' AND e.id = NEW.id) LOOP
      PERFORM sync_app_match(game_id);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER app_stadium AFTER UPDATE OF nome, "nomePopular", ativo ON ingresso_v1_estadios FOR EACH ROW EXECUTE FUNCTION refresh_linked_games();
CREATE TRIGGER app_stadium_sector AFTER UPDATE OF nome, ativo, numerado ON ingresso_v1_setores_estadio FOR EACH ROW EXECUTE FUNCTION refresh_linked_games();
CREATE TRIGGER app_club AFTER UPDATE OF active ON "Tenant" FOR EACH ROW EXECUTE FUNCTION refresh_linked_games();

-- Only join fixtures identifiable by the seed's slug and tenant-derived UUID.
-- A coincident opponent or kickoff time does not identify a historical game.
DO $$
DECLARE pair record;
BEGIN
  FOR pair IN
    WITH hashes AS (
      SELECT t.id AS tenant_id, i, encode(sha256(convert_to('app-demo-v1:' || t.id || ':match-' || i, 'UTF8')), 'hex') AS h
      FROM "Tenant" t CROSS JOIN generate_series(0,5) i
    ), candidates AS (
      SELECT m.id AS app_id, p.id, count(*) OVER (PARTITION BY m.id) AS possible
      FROM hashes JOIN "Match" m ON m.slug = 'app-teste-jogo-' || (i+1)
      JOIN ingresso_v1_partidas p ON p.id = (left(h,12) || '4' || substr(h,14,3) || 'a' || substr(h,18,15))::uuid
      JOIN ingresso_v1_estadios e ON e.id = p."estadioId" AND e."tenantId" = tenant_id
    ) SELECT * FROM candidates WHERE possible = 1
  LOOP
    -- Leave customized/unrecognizable legacy seating for explicit review.
    IF EXISTS (SELECT 1 FROM "Sector" WHERE "matchId" = pair.app_id AND name NOT IN ('Arquibancada · TESTE','Cadeiras · TESTE')) THEN CONTINUE; END IF;
    UPDATE "Sector" s SET "alocacaoV1Id" = a.id FROM ingresso_v1_alocacoes_setor_partida a
      JOIN ingresso_v1_setores_estadio v ON v.id = a."setorId"
      WHERE a."partidaId" = pair.id AND s."matchId" = pair.app_id AND
       ((s.name = 'Arquibancada · TESTE' AND v.nome = '[TESTE APP] Arquibancada') OR
        (s.name = 'Cadeiras · TESTE' AND v.nome = '[TESTE APP] Cadeiras numeradas'));
    IF EXISTS (SELECT 1 FROM "Sector" WHERE "matchId" = pair.app_id AND "alocacaoV1Id" IS NULL) THEN
      UPDATE "Sector" SET "alocacaoV1Id" = NULL WHERE "matchId" = pair.app_id;
      CONTINUE;
    END IF;
    UPDATE "Match" SET "partidaV1Id" = pair.id WHERE id = pair.app_id;
    PERFORM sync_app_match(pair.id);
  END LOOP;
END;
$$;
COMMIT;
