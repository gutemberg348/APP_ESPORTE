# Edição e exclusão de vendas de ingressos

Em **Administração → Vendas**, cada reserva não paga oferece **Editar venda**, **Cancelar reserva** e **Excluir venda**. Os controles aparecem na tabela do PC e nos cartões do celular.

**Editar venda** permite escolher outro setor do mesmo jogo e quantidade de 1 a 4. Informe o motivo, clique em **Conferir novo total e disponibilidade**, revise o preço e salve. A API consulta o preço e a associação atuais do titular, recalcula o desconto e confere vagas. A reserva que está sendo editada não é contada duas vezes no estoque. Mudar campos exige outra conferência; a revisão exibida expira em até 60 segundos.

O prazo original da reserva nunca é estendido. O titular deve estar ativo e as vendas devem estar abertas. Reservas expiradas e canceladas não podem ser editadas. Se o total passar a zero, a API emite uma cortesia e registra o pagamento gratuito na mesma transação.

**Excluir venda** pede motivo e confirmação e remove uma reserva não paga, pendente, expirada ou cancelada. O pedido deixa de aparecer na conta do torcedor e no painel, e os lugares reservados são liberados. A auditoria preserva o identificador do pedido, autor, motivo, titular, jogo, setor, quantidade, valor, situação e datas. **Cancelar reserva** mantém o pedido no histórico.

Vendas com pagamento registrado, ingresso emitido, uso parcial ou entradas registradas ficam protegidas contra edição e exclusão. Devolução de ingressos pagos permanece uma funcionalidade futura. Essas ações não trocam o titular, o jogo ou o valor recebido e não permitem informar um preço arbitrário.

## Contrato da API

Todas as rotas abaixo exigem ADMIN ativo. As listagens administrativas retornam `revision`, uma impressão da versão atual da venda. Envie essa versão nas alterações; uma versão desatualizada retorna `409 SALE_CHANGED`. Isso também protege contra uma reserva cancelada que foi reaproveitada pelo checkout.

| Método | Rota em `/v1` | JSON |
| --- | --- | --- |
| POST | `/admin/tickets/quote` | `ticketId`, `revision`, `sectorId`, `quantity` |
| PATCH | `/admin/tickets` | Campos da revisão, `expectedTotalCents` e `reason` |
| DELETE | `/admin/tickets` | `ticketId`, `revision`, `reason` |

`reason` tem de 5 a 500 caracteres. O total esperado serve para detectar preço ou desconto alterado desde a conferência; o servidor calcula o valor efetivo. Campos desconhecidos são rejeitados. DELETE retorna `{ data: { ticketId, deleted: true } }` e aceita JSON no corpo. O transporte e o CORS incluem DELETE.

As operações de estoque, pagamento gratuito, exclusão e auditoria usam transação Serializable. Edição invalida códigos antigos e incrementa a versão do ingresso. Disputas com confirmação de pagamento são resolvidas pela transação e pela verificação da versão, sem apagar pagamento confirmado ou alterar ingresso pago.

Não há alteração de schema ou migration nesta etapa. Implementação em `apps/api/src/models/admin-ticket.store.js`, validação em `validators/admin.js` e formulário do painel em `apps/mobile/src/components/admin/AdminSaleForm.tsx`.

## Verificação

Passaram os 83 testes unitários da API, incluindo 11 novos testes de vendas; os 15 testes existentes do app; TypeScript do app; verificação de sintaxe da API; e exportação web em `.artifacts/admin-sales-web`.

O teste `admin-sales-integration.test.js` passou no PostgreSQL de desenvolvimento já em execução, sem iniciar serviços. Verificou edição, estoque, manutenção do prazo, auditoria após exclusão, cortesia e disputas reais de edição/pagamento e exclusão/pagamento. Os registros temporários desse teste foram removidos pelo próprio teste. A revisão visual interativa do formulário permanece pendente.
