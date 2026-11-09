ALTER TABLE "ingresso_v1_estadios"
  ADD CONSTRAINT "ingresso_v1_estadios_capacidade_check"
  CHECK ("capacidadeMaxima" > 0);

ALTER TABLE "ingresso_v1_setores_estadio"
  ADD CONSTRAINT "ingresso_v1_setores_estadio_capacidade_check"
  CHECK ("capacidadeFisica" > 0);

ALTER TABLE "ingresso_v1_regras_setor_template"
  ADD CONSTRAINT "ingresso_v1_regras_setor_template_capacidade_check"
  CHECK ("capacidadeLiberadaPadrao" > 0 AND "precoBaseCentavos" >= 0);

ALTER TABLE "ingresso_v1_categorias_template"
  ADD CONSTRAINT "ingresso_v1_categorias_template_desconto_check"
  CHECK ("percentualDesconto" BETWEEN 0 AND 10000);

ALTER TABLE "ingresso_v1_alocacoes_setor_partida"
  ADD CONSTRAINT "ingresso_v1_alocacoes_setor_partida_quantidades_check"
  CHECK (
    "capacidadeLiberada" > 0
    AND "quantidadeVendida" >= 0
    AND "quantidadeReservada" >= 0
    AND "quantidadeVendida" + "quantidadeReservada" <= "capacidadeLiberada"
  );

ALTER TABLE "ingresso_v1_lotes"
  ADD CONSTRAINT "ingresso_v1_lotes_quantidades_preco_check"
  CHECK (
    "precoCentavos" >= 0
    AND "quantidadeMaxima" > 0
    AND "quantidadeVendida" >= 0
    AND "quantidadeVendida" <= "quantidadeMaxima"
  );
