# Compra de ingressos no app

Atualiza??o de 06/11/2026: Pix autom?tico Asaas, webhook, concilia??o e solicita??o de estorno est?o implementados. Consulte [configura??o e contrato atuais](asaas.md); as descri??es do recebimento manual abaixo continuam aplic?veis em `PAYMENT_MODE=disabled`.

A **Central de ingressos** fica na tela inicial. O botão **Ingressos** do próximo jogo abre o catálogo. Em **Perfil → Meus ingressos**, o app abre diretamente os pedidos da conta. O visual mantém a paleta verde/dourada, fontes e escudo do projeto.

## Catálogo e compra

1. Na aba **Comprar**, o torcedor vê os próximos jogos publicados, adversários, competição, data, horário de Patos e estádio. Pode buscar por adversário, competição ou estádio e filtrar **Vendas abertas**.
2. Cada cartão mostra os setores, preços e lugares disponíveis, além do estado de venda: aberta, em breve, pausada, encerrada ou esgotada. O preço inicial considera somente setores à venda com vagas; os preços da lista são os preços base antes do desconto de associação.
3. Em **Escolher meus ingressos**, seleciona um setor e de 1 a 4 pessoas. Setores pausados, esgotados ou sem disponibilidade confirmada não podem ser escolhidos. O app não inventa quantidade usando a capacidade do setor.
4. **Revisar compra** consulta a API. A revisão mostra titular, setor, quantidade, valor por ingresso, subtotal, desconto de sócio, total e orientações de pagamento. O preço estimado do celular não define o preço cobrado.
5. A revisão dura até 60 segundos, limitada também ao encerramento das vendas/início do jogo e à expiração do desconto. Consultar não reserva vagas. Na confirmação, a API consulta novamente estoque, janela e associação em transação Serializable. Se preço/desconto mudar, bloqueia com `TICKET_PRICE_CHANGED` e exige nova revisão.
6. Gratuitos são emitidos imediatamente com registro FREE. Pedidos pagos ficam reservados por até 15 minutos, limitados ao fechamento das vendas/início do jogo, e aparecem em **Meus ingressos**.

O gateway segue pendente de escolha. O fluxo pago usa as instruções de `TICKET_PAYMENT_INSTRUCTIONS` e confirmação do recebimento pelo administrador. Não há cobrança bancária Pix/cartão no checkout atual. Tocar em **Já paguei · consultar confirmação** só atualiza a conta; não marca o pedido como pago.

## Pedidos e entrada

**Meus ingressos** tem filtros **Ativos**, **Histórico** e **Todos**. Os cartões mostram número copiável do pedido, partida, setor, quantidade, total, estado e prazo de reserva. O app consulta atualizações aproximadamente a cada 15 segundos enquanto a tela está aberta e ativa; também atualiza ao retornar ao primeiro plano ou ao puxar a tela.

Reservas sem pagamento confirmado podem ser canceladas após uma confirmação explícita. Cancelar libera vagas. Um ingresso emitido não pode ser cancelado por esse caminho e exige atendimento para eventual devolução. Uma conta tem apenas um pedido ativo/emitido por partida; alterar quantidade ou setor de uma reserva não paga exige cancelá-la primeiro. Reservas expiradas ou canceladas sem pagamento podem ser substituídas; o sistema reutiliza o registro do pedido, sem manter um histórico independente de cada tentativa anterior.

Após a emissão, o cartão mostra os acessos restantes e usados. Com a portaria habilitada e no horário, o titular abre o QR e o código digitável. Apenas um QR fica aberto por vez. O funcionamento de validade curta, confirmação, consumo parcial e equipe de portaria está em [segurança dos ingressos](ticket-security.md) e [funcionários](gate-staff.md).

Os prazos da central usam `serverTime` da API e tempo monotônico do aparelho para não depender de ajustes no relógio local. A API continua sendo a autoridade para prazo, pagamento, disponibilidade e entrada.

## Resposta perdida

Se a confirmação falhar por conexão/erro sem resultado conhecido, o checkout consulta os pedidos da própria conta. Encontrando um pedido ativo, mostra o registro recebido do servidor. Se a resposta continuar indefinida, impede outra confirmação nessa janela e oferece consulta ou acesso a **Meus ingressos**. Não confirma pagamento ou emissão a partir de um erro de rede. A restrição única conta/partida e a transação continuam impedindo duplicar reservas mesmo se o usuário reabrir a tela.

## API

Nova rota autenticada: **POST `/v1/tickets/quote`**.

```json
{ "matchId": "<UUID>", "sectorId": "<UUID>", "quantity": 2 }
```

Resposta: `match`, `sector`, `quantity`, `available`, `unitPriceCents`, `subtotalCents`, `discountPercent`, `discountCents`, `totalCents`, `serverTime`, `expiresAt`, `paymentInstructions`. A consulta não cria pedido nem pagamento e não garante o estoque até a confirmação.

O app confirma em **POST `/v1/tickets`** com:

```json
{ "matchId": "<UUID>", "sectorId": "<UUID>", "quantity": 2, "expectedTotalCents": 8000 }
```

`expectedTotalCents` é uma comparação com o total revisado, não uma fonte de preço. A API calcula o total e recusa divergência. É opcional para compatibilidade com os clientes anteriores; o checkout novo sempre envia. `priceCents`, desconto, role e estado não são aceitos do cliente. Reserva/cortesia e auditoria são gravadas juntas; falha de auditoria desfaz a operação.

## Validação desta etapa

Passaram 59 testes isolados da API e 9 do mobile (68 no total). Cobrem cálculo/limites, revisão sem retenção de estoque, alteração de preço, lotação após revisão, vencimento de associação/janela durante espera, gratuidade, duplicidade e rollback de auditoria. O mobile verifica estados do catálogo, valores iniciais e expiração/seleção de pedidos.

O teste HTTP administrativo foi atualizado para revisão e comparação do total. Integração com PostgreSQL, navegação visual e execução em aparelho ainda precisam ser verificadas pelo responsável; não foram iniciados app, API, Docker ou prévia pelo agente. Esta etapa reutiliza as tabelas já preparadas e não acrescenta migration. As migrations anteriores continuam dependendo do banco preparado com `npm run db:prepare`.
