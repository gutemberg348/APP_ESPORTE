# Ingressos: comissão, taxa e repasse manual

Implementado em 09/11/2026. Menu **Admin → Financeiro**, com Repasses, Por pagamento e Configurações. A implementação faz a apuração dos ingressos desta instância; a loja e as compras com cashback continuam com seus relatórios próprios.

## Regra inicial aprovada

- Empresa: **10%**; time: **90%**.
- Base inicial: **líquido após taxa do gateway**. O admin também pode escolher comissão sobre o bruto; nesse modo a tarifa reduz a parte do time.
- Dia inicial do repasse: **sexta-feira**, editável nas configurações.
- Envio ao time: **manual**. Nenhuma rota cria Pix de transferência, saque ou split automático para o clube.
- Taxa prevista: percentual e valor fixo configuráveis. Não foi inventada uma tarifa contratual: os campos começam em zero até você informar o contrato.

Exemplo com recebimento de R$ 100,00 e taxa efetiva de R$ 1,00:

| Campo | Valor |
| --- | --- |
| Recebido do comprador | R$ 100,00 |
| Gateway | R$ 1,00 |
| Líquido para dividir | R$ 99,00 |
| Empresa, 10% do líquido | R$ 9,90 |
| Time, 90% do líquido | R$ 89,10 |

Todos os cálculos usam centavos inteiros; percentuais são armazenados em pontos-base (1000 = 10%). Arredondamento ocorre na comissão e o restante fica na parte do time. A identidade conferida no código e em CHECKs do PostgreSQL é:

```text
bruto - devoluções = tarifa do gateway + empresa + time
saldo pendente do time = parte acumulada do time - repasses confirmados
```

## Taxa prevista e efetiva

A taxa fixa é por cobrança, não multiplicada pela quantidade de ingressos do pedido. O app não adiciona uma cobrança extra ao preço visto pelo torcedor: nesta etapa a tarifa e a comissão são deduções internas.

No Asaas, o processador consulta a cobrança autenticada, confere identidade/cliente/valor e usa `value - netValue` como tarifa da cobrança. A emissão continua dependendo de `RECEIVED`; `CONFIRMED` não disponibiliza os valores. [Dados e eventos oficiais](https://docs.asaas.com/docs/webhook-para-cobrancas).

Enquanto a tarifa não puder ser conciliada, o recebimento fica com origem **ESTIMATED** e sua parte não é liberada para repasse. Quando chegar a tarifa efetiva, a apuração é corrigida por um lançamento de diferença, sem duplicar a venda. Em recebimento manual, a tela pede a taxa efetivamente paga; deixe zero para caixa ou transferência sem tarifa.

As configurações são capturadas ao reservar. Alterar o percentual hoje não muda a regra guardada em uma reserva ou venda anterior. Uma nova geração de reserva cancelada/expirada recebe a regra atual. Cortesias de valor zero não geram saldo financeiro.

## Como registrar o envio semanal

1. Confira o **valor liberado** em Financeiro → Repasses, o favorecido e a chave de conferência configurada.
2. Faça a transferência pelo banco ou meio que vocês utilizam.
3. Clique em **Registrar repasse já enviado**. Informe valor, favorecido, data/hora e referência única do comprovante.
4. Marque que já enviou o dinheiro e conferiu o comprovante; confirme o registro.

Se o valor enviado for todo o saldo liberado, esse saldo fica **zerado**. Se for parcial, o restante continua pendente. A comissão acumulada da empresa e o histórico das vendas não são apagados. Esse número da empresa é apuração operacional acumulada, não consulta do saldo bancário ou controle de saques da empresa.

O painel avisa quando há saldo disponível e destaca o vencimento semanal. É um aviso dentro do admin enquanto aberto, com atualização periódica; não há push, email ou execução automática no dia do repasse. Você pode registrar um envio antes do dia configurado.

A API confere o saldo novamente em transação Serializable. Repetir a mesma chave de operação retorna o registro já feito. Duas pessoas não podem baixar o mesmo saldo integral; valor desatualizado, referência duplicada, envio futuro ou valor maior que o liberado são recusados.

Um lançamento incorreto pode ser **anulado com motivo**, preservando o registro, responsável e auditoria. Isso reabre o saldo contábil; não desfaz a transferência real. Use somente para erro de registro, não para fingir que um dinheiro efetivamente enviado voltou.

## Estornos, bloqueios e diferenças

Pedido de estorno ou evento de reversão bloqueia o recebimento para novos repasses. A empresa e o time são recalculados conforme a devolução confirmada. As tarifas retidas continuam sendo custo. O Asaas informa que taxas da cobrança não são devolvidas no estorno; elas podem exigir saldo adicional para devolver o bruto ao comprador. [Contrato de estorno](https://docs.asaas.com/reference/estornar-cobranca).

Em devolução integral, a comissão fica zero; eventual tarifa retida é debitada da parte do time. Se o time já recebeu, o saldo pode ficar negativo. O painel mostra a diferença para compensar nas próximas vendas, sem apagar ou alterar o envio anterior. Essa regra de custos é operacional da implementação e precisa corresponder ao acordo com o clube.

Uma cobrança paga depois do prazo pode ser estornada sem emitir ingresso. Nesse caso não existe recibo `TicketPayment`, mas a tarifa continua existindo: `TicketRefundCost` registra recebido, devolvido e custo retido uma vez por intenção financeira. O custo é incluído nos totais e reduz o saldo do time; a aba Por pagamento mostra essas operações separadamente. Não são gerados ingressos para “fechar” artificialmente essa conta.

Comissão, gross/net, devoluções e variações de tarifa geram lançamentos com revisão única em `TicketFinancialEntry`. Reprocessar webhook ou conciliação não repete o mesmo saldo. Exclusão lógica administrativa de uma venda paga não apaga sua receita nem inicia um estorno bancário.

Recebimentos antigos sem regra registrada aparecem como **históricos para conferência**, fora do saldo liberado. O admin pode adotar explicitamente a regra atual em lotes de até 100 recebimentos, com motivo e auditoria. Não foi aplicada automaticamente comissão retroativa ao único recibo histórico encontrado no banco local.

## Configuração e banco

As migrations `20261109010000_ticket_finance` e `20261109020000_unissued_ticket_refund_cost` adicionam:

| Estrutura | Função |
| --- | --- |
| `FinancialSettings` | Percentual, base, taxa prevista, dia e dados do favorecido |
| `Ticket.financialPolicy` | Regra capturada na criação da reserva |
| `TicketFinancial` | Apuração atual do recibo e origem da tarifa |
| `TicketFinancialEntry` | Histórico de diferenças com revisão única |
| `ClubPayout` | Envio manual, responsável, comprovante e eventual anulação |
| `TicketRefundCost` | Custo de cobrança devolvida sem emitir ingresso |

As migrations foram aplicadas ao PostgreSQL local em 09/11/2026, junto das migrations de Asaas e Loja que estavam pendentes. A configuração local foi inicializada com 10%/90%, base líquida e sexta-feira. Nenhuma transferência ou cobrança real foi enviada por esta implementação.

Arquivos principais: `apps/api/src/lib/ticket-finance.js`, `models/finance.store.js`, `controllers/finance.controller.js`, `validators/finance.js` e `apps/mobile/src/components/admin/AdminFinancePanel.tsx`. Dicionário estrutural em [banco/financeiro.txt](banco/financeiro.txt).

## Validação e limites

Os testes usam código de produção, migrations reais e PostgreSQL descartável PGlite, sem usar credenciais reais de gateway. Cobrem arredondamento, mudança de regra, tarifa estimada/efetiva, concorrência no repasse, repetição, anulação, estorno depois de repassar e tarifa de pagamento tardio sem emissão. A integração Asaas existente também verifica os campos financeiros nas confirmações e devoluções simuladas.

Esses registros não substituem a conciliação do extrato bancário. Movimentos fora das cobranças — mensalidades, saques, tributos, tarifas de transferência e lançamentos adicionais de notificação — não são importados automaticamente. Não foi executada uma transação autenticada com dinheiro ou sandbox da conta do clube. A conferência fiscal e bancária e o contrato de divisão continuam sendo responsabilidade da operação.

Verificação desta entrega: suíte API/app e cenário adicional somam 180 testes aprovados; `npm run check` passou e a exportação Expo web/iOS foi concluída. A tela no aparelho físico e a conta real do gateway não foram exercitadas.
