# Edição e exclusão de vendas de ingressos

Em **Administração → Vendas**, vendas pagas, cortesias e reservas oferecem **Editar venda** e **Excluir venda**. Reservas não pagas também podem ser canceladas. Os controles aparecem na tabela do PC e nos cartões do celular. O filtro **Excluídas** consulta as vendas removidas da operação ativa.

**Editar venda** permite escolher outro setor do mesmo jogo e quantidade de 1 a 4. Informe o motivo, confira o total e a disponibilidade e salve. Mudar campos exige outra conferência; a revisão exibida expira em até 60 segundos. A própria venda não é contada duas vezes no estoque.

Nas vendas pagas, o total recebido e o registro de pagamento são mantidos. A alteração administrativa não cria cobrança, estorno ou troca de titular. Pode ser feita mesmo com as vendas encerradas ou pausadas. O ingresso permanece emitido, ou utilizado quando a quantidade coincide com o uso registrado. O QR e o código anteriores são invalidados por incremento da versão; o titular obtém um novo código no app.

Depois de uma entrada, o setor deve ser mantido para preservar o local histórico da portaria. A quantidade pode ser ajustada, mas nunca abaixo das entradas já realizadas. Se um ingresso totalmente utilizado ganhar quantidade adicional, volta a emitido apenas com o saldo autorizado, mantendo as entradas anteriores. A portaria continua exigindo horário, setor, titular ativo e pagamento válido.

Nas reservas não pagas, a API consulta preço e associação atuais, recalcula o desconto e confere as vendas abertas. O prazo original nunca é estendido. O titular deve estar ativo; reservas expiradas e canceladas não podem ser editadas. Se o total passar a zero, a API emite uma cortesia e registra o pagamento gratuito na mesma transação.

**Excluir venda** pede motivo e confirmação e aceita também pagamento confirmado, cortesia e uso parcial ou total. A exclusão é lógica: registra `deletedAt`, cancela o ingresso e invalida seus códigos. O pedido sai da carteira e da lista ativa, mas permanece no filtro **Excluídas**, com pagamento, entradas e auditoria. O histórico informa autor, motivo, titular, jogo, setor, quantidade e valor. **Cancelar reserva** mantém a reserva na operação consultável sem marcar exclusão.

Somente os lugares ainda não utilizados são liberados. `voidedQuantity` registra esse total; entradas já realizadas continuam ocupando a capacidade do setor, mesmo após exclusão, e nunca são apagadas. **Excluir uma venda paga não devolve dinheiro automaticamente.** O acerto financeiro externo continua a cargo do clube enquanto não houver integração de estorno.

## Contrato da API

Todas as rotas abaixo exigem ADMIN ativo. As listagens administrativas retornam `revision`, uma impressão da versão atual da venda. Envie essa versão nas alterações; uma versão desatualizada retorna `409 SALE_CHANGED`. Isso também protege contra uma reserva cancelada que foi reaproveitada pelo checkout.

| Método | Rota em `/v1` | JSON |
| --- | --- | --- |
| POST | `/admin/tickets/quote` | `ticketId`, `revision`, `sectorId`, `quantity` |
| PATCH | `/admin/tickets` | Campos da revisão, `expectedTotalCents` e `reason` |
| DELETE | `/admin/tickets` | `ticketId`, `revision`, `reason` |

`reason` tem de 5 a 500 caracteres. O total esperado detecta mudança desde a conferência. O servidor calcula o valor de reservas não pagas e mantém o total das pagas. A revisão retorna `priceLocked: true` para venda paga; nesse caso `unitPriceCents` é null, pois o pagamento histórico não é redistribuído como preço unitário novo. Campos desconhecidos são rejeitados. DELETE aceita JSON e retorna `ticketId`, `deleted`, `paid` e `voidedQuantity` dentro de `data`.

GET `/admin/tickets` aceita `deleted=exclude` (padrão), `only` ou `all`. Vendas já excluídas não podem ser editadas, reemitidas, novamente excluídas ou confirmadas como pagamento novo; retornam `SALE_DELETED`. A carteira do titular oculta essas vendas. Uma nova compra cria outro pedido e preserva o antigo, sem duplicar uma venda ativa da mesma conta/partida.

As operações de estoque, pagamento gratuito, exclusão e auditoria usam transação Serializable. A revisão inclui versão de entrada e exclusão, evitando que uma leitura da portaria ocorra junto de uma edição ou exclusão desatualizada. Não há exclusão física de Ticket, TicketPayment ou TicketAdmission nesse fluxo.

A migration `20261103010000_paid_sale_management` adiciona `Ticket.deletedAt` e `voidedQuantity`, dois CHECKs de integridade e o índice UNIQUE parcial de conta/partida ativa. Foi aplicada no banco local já em execução, e o cliente Prisma foi regenerado. A unicidade parcial é definida no SQL da migration; o índice comum correspondente aparece no schema Prisma. O dicionário em `docs/banco/estrutura-completa.txt` foi atualizado pelos metadados reais.

Implementação em `apps/api/src/models/admin-ticket.store.js`, validação em `validators/admin.js` e formulário em `apps/mobile/src/components/admin/AdminSaleForm.tsx`.

## Verificação

Passaram 87 testes unitários da API, incluindo edição/exclusão paga, manutenção do recibo, quantidade usada, bloqueio de setor após entrada, invalidação de acesso e rollback da auditoria; os 22 testes do app; TypeScript e verificação de sintaxe da API. A exportação web/iOS também passou, com artefatos em `.artifacts/paid-sales`.

O teste `admin-sales-integration.test.js` passou no PostgreSQL já em execução. Verificou edição paga, uso parcial na portaria, conservação do pagamento e entradas, estoque após exclusão, nova compra do mesmo titular e disputas reais de edição/pagamento, exclusão/pagamento e exclusão/entrada. Os registros temporários foram removidos pelo próprio teste. A revisão visual interativa do formulário permanece pendente.
