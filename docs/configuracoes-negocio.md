# Configurações de negócio

Revisão de 09/11/2026. O admin tem uma página **Configurações** com os prazos de compra, participação e recompensas, além de atalhos para os cadastros financeiros existentes. Não há uma segunda cópia dos formulários de preços ou percentuais.

| Valor | Onde editar | Como é usado |
| --- | --- | --- |
| Comissão da empresa, base bruta/líquida, taxa prevista percentual e fixa | Financeiro → Configurações | Política gravada na nova reserva de ingresso. A participação do time é o complemento da comissão da empresa. |
| Dia semanal, nome do beneficiário e chave Pix do time | Financeiro → Configurações | Organização dos repasses manuais. Envio e comprovantes ficam em Saques. |
| Taxa efetiva de recebimento manual | Vendas → Confirmar recebimento | Valor em reais comprovado daquele pagamento. |
| Tarifa real de um pagamento Asaas | Informada pelo gateway | Prevalece sobre a estimativa; não é um campo para inventar outro custo no admin. |
| Preço e capacidade dos ingressos | Jogos → Setores | Novas reservas, conferidas novamente pelo servidor. |
| Mensalidade e desconto da associação | Planos | Cadastro do plano e desconto das novas compras elegíveis. |
| Preços de venda, custo, preço anterior, produtos e variantes | Loja → Produtos | Novos pedidos; itens comprados mantêm os preços e custos registrados. |
| Estoque e alerta de reposição | Loja → Estoque / Produtos | Disponibilidade descontando reservas ainda válidas. Ajustes têm justificativa e histórico. |
| Frete base, adicional por kg, isenção, CEP e prazos | Loja → Frete | Regras locais ou cotação do Melhor Envio. A tarifa externa vem da cotação. |
| Retirada, endereço, loja interna/externa e orientações de pagamento da loja | Loja → Configurações | Operação da loja e opções de entrega. |
| Cashback e comissão do parceiro | Parceiros → Editar → Cashback e caixa | Percentuais das novas cobranças daquele parceiro. |
| Recebedor do split Asaas | Parceiros → Editar → Recebedor Asaas | Wallet ID separado para sandbox e produção; não é uma chave secreta de API. |
| Prazo da reserva do ingresso | Configurações → Reservas e participação | Inicialmente 15 minutos; também respeita o início do jogo e o fim das vendas. |
| Prazo de produtos, validade da cotação e limite de pedidos pendentes | Configurações → Reservas e participação | Inicialmente 30 minutos, 10 minutos e 3 pedidos por cliente. |
| Prazo da cobrança do parceiro | Configurações → Reservas e participação | Inicialmente 15 minutos, aplicado na criação da cobrança. |
| Pontos diários e pausa do check-in | Configurações → Reservas e participação | Inicialmente 30 pontos; a API consulta a configuração na transação do check-in. |
| Recompensas, custo em pontos, vagas, descrição e disponibilidade | Configurações → Recompensas de pontos | Resgate desconta pontos e uma vaga na mesma transação. |

Os valores iniciais são parâmetros de criação do cadastro. A aplicação lê a configuração persistida e não volta silenciosamente a 10% quando um cadastro financeiro não existe: inicializa a linha `FinancialSettings` e captura a política daquela venda.

## Histórico e concorrência

- Alterar configuração não muda valores, custo, tarifa conciliada, recebedor ou vencimento dos pedidos anteriores. Não recalcula extratos nem zera saldos.
- `Ticket.financialPolicy` guarda a política do ingresso; `PaymentCharge.paymentPolicy` guarda ambiente, recebedor e percentuais do parceiro; `GatewayIntent.snapshot` mantém o destino da cobrança já emitida.
- Trocar sandbox por produção não permite pagar uma cobrança criada no outro ambiente.
- Novas cobranças de parceiros sem recebedor configurado são recusadas antes da criação. Não se cria uma venda pendente impossível de pagar.
- Nos parceiros legados, um Wallet ID `NULL` mantém o mapa `ASAAS_MERCHANT_WALLETS` como compatibilidade. Após editar um campo pelo admin, o valor do banco prevalece; vazio desabilita aquele ambiente. Campos não editados são preservados, inclusive no outro ambiente. Cobranças legadas sem snapshot e sem intent ainda dependem do mapa antigo até serem concluídas ou substituídas.
- Configurações usam versão e transação serializável. Uma tela antiga recebe conflito, em vez de sobrescrever uma edição mais nova.
- Cada resgate incrementa a versão da recompensa. Um admin que abriu a edição antes de um resgate precisa atualizar antes de salvar as vagas. A mudança do custo não altera `Redemption.cost` de resgates anteriores.
- Alterações de configuração e recompensas têm auditoria com valores anteriores e posteriores. Alterações de ofertas e recebedores são auditadas no parceiro.

## Proteções e integração

Limites técnicos de valores, tamanho de carrinho/requisição, validação de CPF, autorização, expiração de JWT/QR, unicidade, idempotência e integridade contábil continuam protegidos no código e no banco. Saldos são resultado dos lançamentos, pagamentos e estornos; não são sobrescritos livremente como um preço de produto.

Segredos SMTP, chaves de gateway, tokens de frete, ambiente e parâmetros de conexão continuam no `.env` do servidor. O admin altera regras comerciais e cadastros; ele não altera o contrato tarifário do provedor. A comissão de ingressos não foi aplicada silenciosamente às vendas da loja.

O app recebe a pontuação do check-in na resposta de engajamento e o prazo da loja na cotação. A ajuda não promete mais prazos fixos, e o palpite real não anuncia um prêmio automático que o backend ainda não liquida.

## Estrutura e implantação

- Migration: `apps/api/prisma/migrations/20261109050000_business_configuration/migration.sql`.
- Tabela e colunas: `docs/banco/configuracoes.txt`.
- API: `GET/PUT /v1/admin/settings`, `GET/POST/PATCH /v1/admin/rewards`; acesso exclusivo de administrador.
- Implementação: `settings.controller.js` → `settings.service.js` → `settings.store.js`, com contratos em `packages/shared/settings.ts`.
- Interface: `AdminSettingsPanel.tsx`, reutilizando os controles, grades, avisos e modal administrativos existentes.
- Em outro ambiente: `npm run db:generate` e `npm run db:deploy` antes de executar a API atualizada. Não é necessário recriar o banco nem reiniciar o container PostgreSQL para aplicar a migration.
