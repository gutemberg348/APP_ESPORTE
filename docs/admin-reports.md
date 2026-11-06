# Gestão de vendas e histórico de portaria

Atualiza??o de 06/11/2026: Pix autom?tico Asaas, webhook, concilia??o e solicita??o de estorno est?o implementados. Consulte [configura??o e contrato atuais](asaas.md); as descri??es do recebimento manual abaixo continuam aplic?veis em `PAYMENT_MODE=disabled`.

O painel administrativo, no navegador e no app, tem **Vendas** e **Histórico de portaria**. Ambos usam a mesma API e exigem ADMIN ativo. As consultas são feitas no PostgreSQL, com paginação de 25 registros na interface. Os totais consideram todos os resultados do filtro, inclusive os que estão nas próximas páginas.

## Vendas

Filtros: partida, setor, nome/e-mail do comprador ou UUID completo do pedido, situação do ingresso, pagamento, exclusão e período de criação do pedido. A busca por nome/e-mail ignora maiúsculas e minúsculas. Clique em **Aplicar filtros**; **Limpar** volta à consulta geral. Os filtros podem ser combinados.

- **Pedidos**: quantidade de pedidos no recorte, não de pessoas.
- **Ingressos vendidos**: quantidade atual de ingressos ativos com recebimento manual confirmado; cortesias são informadas separadamente. Vendas excluídas não entram nessa quantidade.
- **Reservados**: quantidade em reservas pendentes ainda válidas.
- **Receita confirmada**: soma de `TicketPayment.amountCents` dos pedidos filtrados; a tela informa também quanto desse total pertence a pedidos excluídos. A exclusão não implica devolução do dinheiro. O padrão inclui ativos e excluídos; escolher somente ativos também restringe a receita aos ativos.
- **Disponibilidade**: capacidade menos ingressos emitidos, reservas válidas e lugares já utilizados de vendas excluídas. Considera apenas a seleção de partida/setor. Busca de comprador, período e situação não reduzem a capacidade física. Sem partida selecionada, soma a capacidade de todas as partidas, inclusive antigas e rascunhos.

Selecionar uma partida mostra confirmados (incluindo cortesias), reservas, entradas realizadas e vagas livres por setor. Vaga física não significa venda aberta: a publicação, o prazo da partida e a habilitação de vendas continuam definidos em **Jogos**. Edição, exclusão, cancelamento e conferência de recebimento permanecem disponíveis na tabela do PC e nos cartões do celular.

O período de vendas usa **criação do pedido**, mesmo quando seu pagamento é confirmado depois. Não é um extrato financeiro por data de recebimento, nem uma conciliação com gateway.

## Histórico de portaria

**Entradas confirmadas** lista os registros de `TicketAdmission`. Filtros: partida, setor, funcionário, período da entrada, titular/pedido e protocolo completo. Os cartões de resumo mostram operações e pessoas admitidas. Repetições idempotentes da mesma operação não criam outra entrada. O protocolo é o UUID da entrada que já aparece na confirmação da portaria.

**Ver protocolo** consulta novamente o servidor e mostra titular, partida, estádio, setor, quantidade, horário e funcionário. Um administrador pode consultar protocolos de outros operadores. A consulta de recuperação usada pela conta de portaria continua restrita às próprias operações. Consultar um protocolo não libera novo acesso.

Entradas de vendas excluídas e de funcionários desativados continuam disponíveis. O histórico lê a partida/setor ligados ao ingresso; a edição administrativa já impede trocar o setor após a primeira entrada. Nomes de pessoas, jogos e setores são os atuais do cadastro, não cópias imutáveis desses textos na data da operação.

**Tentativas recusadas** consulta os eventos `TICKET_VALIDATION_DENIED` da auditoria, com motivo, partida, setor, funcionário, etapa e protocolo do evento. A etapa distingue consulta (`INSPECT`) de tentativa de entrada (`ADMIT`). Os filtros são partida, setor, funcionário, protocolo e período. Não há vínculo de comprador para um código inválido. A recusa não conta como pessoa admitida.

Novas recusas registram setor e etapa. Eventos antigos sem esses campos aparecem com essa indicação; ao filtrar por setor, só aparecem eventos que de fato registraram esse setor. O histórico registra recusas de domínio após autenticação/validação do pedido; falhas de login, JSON inválido e indisponibilidade de rede/banco não representam uma validação de ingresso registrada. Consultas bem-sucedidas de titular não são contadas como entrada.

Os formulários usam `AAAA-MM-DD HH:mm`, no fuso de Patos (`America/Fortaleza`, UTC−3). O minuto final é inclusivo até `:59.999`. A API recebe ISO 8601 com fuso e compara instantes; datas inválidas e períodos invertidos retornam 422.

## API

Todas as rotas estão em `/v1`, usam GET e exigem Bearer de ADMIN ativo.

| Rota | Resposta em `data` |
| --- | --- |
| `/admin/sales` | `items`, `pagination`, `summary`, `inventory`, `serverTime` |
| `/admin/admissions` | `items`, `pagination`, `summary` |
| `/admin/admissions/protocol?protocol=<UUID>` | Um protocolo de entrada; 404 se não existe |
| `/admin/gate-denials` | `items`, `pagination` |
| `/admin/gate-operators` | Funcionários e administradores que operaram, incluindo desativados |

Paginação dos relatórios: `limit=1..100` (padrão 25), `offset=0..1000000000`. `pagination` contém `total`, `limit`, `offset`, `hasMore`. Ordenação decrescente por data e UUID desempata registros do mesmo instante. Listagens e agregados usam uma transação de leitura RepeatableRead para refletir o mesmo snapshot.

`/admin/sales` aceita `matchId`, `sectorId`, `search` (até 100 caracteres), `status=PENDING|ISSUED|USED|CANCELED|EXPIRED`, `payment=PAID|FREE|UNPAID`, `deleted=all|exclude|only` (padrão `all`), `from` e `to`. `PAID` seleciona recibos manuais; `FREE`, cortesias. `EXPIRED` é calculado a partir do vencimento do PENDING.

`/admin/admissions` aceita `matchId`, `sectorId`, `actorId`, `search`, `protocol`, `from`, `to`. `/admin/gate-denials` aceita os mesmos filtros, exceto `search`. IDs devem ser UUIDs válidos. Campos desconhecidos são rejeitados. Protocolos são consultáveis apenas após autenticação; o ID não funciona como credencial de entrada. As respostas omitem senhas, tokens, códigos de acesso, `requestKey`, `scanId`, versões internas do QR e hashes de códigos recusados.

Exemplos:

```text
GET /v1/admin/sales?matchId=<UUID>&status=PENDING&limit=25&offset=0
GET /v1/admin/admissions?matchId=<UUID>&actorId=<UUID>&from=2026-11-04T18:00:00Z
GET /v1/admin/admissions/protocol?protocol=<UUID-da-entrada>
GET /v1/admin/gate-denials?matchId=<UUID>&sectorId=<UUID>
```

## Código e banco

- Consultas: `apps/api/src/models/admin-reports.store.js`.
- Rotas/controller/service: `routes/index.js`, `controllers/admin.controller.js`, `services/admin.service.js`.
- Validação: `apps/api/src/validators/admin.js`.
- Vendas: `apps/mobile/src/components/admin/AdminSalesReport.tsx`.
- Portaria: `apps/mobile/src/components/admin/AdminGateHistory.tsx`.
- Filtros e paginação: `AdminReportControls.tsx`; conversão de período em `src/utils/admin.ts`.
- Tipos compartilhados: `packages/shared/types.ts`.

Esta etapa reutiliza `Ticket`, `TicketPayment`, `TicketAdmission`, `AuditLog`, `Match`, `Sector` e `User`; não adiciona tabelas ou migrations. A migration de gestão de vendas pagas da etapa anterior continua necessária em instalações ainda desatualizadas. O fluxo de confirmação de pagamento continua manual, sem gateway ou estorno automático.

## Verificação

Testes unitários de validação, acesso ADMIN e filtros; teste de integração no PostgreSQL com paginação, totais completos, filtros combinados, expiração, receita excluída, estoque parcialmente utilizado, protocolos, funcionários desativados e recusas antigas/novas. Os registros temporários são removidos pelo teste. Testes do app verificam o fuso, o minuto final inclusivo e a rejeição de períodos inválidos. Exportações web/iOS verificam a compilação; a inspeção visual em navegador/aparelho é uma etapa separada.

Verificados nesta entrega: 90 testes unitários da API, 24 testes unitários do app e 1 teste de integração de relatórios no PostgreSQL (115 no total), sintaxe da API, TypeScript e exportação web/iOS em `.artifacts/admin-reports`.
