# Asaas: Pix, webhook e atualização automática

Integração implementada para ingressos e compras com cashback. API e app usam o mesmo banco e processam o pagamento sem conferência manual quando `PAYMENT_MODE=asaas`. Os testes executados usam um provedor controlado e PostgreSQL descartável; o teste autenticado no sandbox precisa das credenciais da conta.

## Configurar no desenvolvimento

Em `apps/api/.env`:

```dotenv
PAYMENT_MODE=asaas
ASAAS_ENVIRONMENT=sandbox
ASAAS_API_KEY='cole_a_chave_sandbox_aqui'
ASAAS_WEBHOOK_TOKEN=token_exclusivo_do_webhook
ASAAS_DATA_SECRET=segredo_aleatorio_de_64_ou_mais_caracteres
ASAAS_MERCHANT_WALLETS={}
```

`npm run setup` prepara os campos e gera os dois segredos locais sem mostrar seus valores. Ele mantém credenciais existentes. Configure `PAYMENT_MODE=asaas` e a chave **depois** do setup. Use aspas simples ao colar uma chave que contenha `$` no dotenv. Não coloque chaves em `EXPO_PUBLIC_*`: o app nunca recebe credenciais do gateway. Guarde `ASAAS_DATA_SECRET` com o backup do banco; trocar esse segredo sem recriptografar os documentos impede recuperar os cadastros existentes.

Com seu PostgreSQL em execução, aplique a migration e gere o cliente:

```powershell
npm run db:generate
npm run db:deploy
```

Inicie a API pelo seu comando habitual (`npm run dev:api`). O processamento financeiro começa junto da API, apenas em modo Asaas. Não é necessário iniciar outro processo de worker. O app continua com a URL pública/LAN correta em `apps/mobile/.env`.

Para Docker `--profile full`, configure os mesmos campos no `.env` da raiz. O compose encaminha as variáveis à API e o container aplica as migrations ao iniciar. `NODE_ENV=production` pode utilizar **sandbox** para validar uma implantação hospedada. Modo demo continua proibido em produção. Para operar ao vivo, use credencial de produção, `ASAAS_ENVIRONMENT=production` e um banco de produção separado dos testes; a mudança de ambiente não converte ingressos ou saldos já emitidos no banco sandbox em operações financeiras reais.

## Webhook no painel Asaas

Cadastre um webhook no **mesmo ambiente da chave** com a URL HTTPS pública final:

```text
https://SEU-DOMINIO/v1/payments/webhook
```

Use em **Auth Token** exatamente o valor de `ASAAS_WEBHOOK_TOKEN`. Esse token é próprio do webhook; não use a API key. O Asaas o envia no header `asaas-access-token`. Configure o envio habilitado, fila não interrompida e email de acompanhamento. O endpoint persiste a notificação e responde HTTP **200**, inclusive em repetição válida. [Autenticação, reenvios e confirmação de entrega](https://docs.asaas.com/docs/webhooks-faq).

Para cadastrar pelo projeto, preencha também `ASAAS_WEBHOOK_URL` (a URL HTTPS completa acima) e `ASAAS_WEBHOOK_EMAIL`, então execute `npm run payments:webhook` na raiz. O comando cria ou atualiza a configuração do app e seleciona os eventos abaixo, sem mostrar token/API key. Ele preserva webhooks de outras aplicações. Não reativa silenciosamente uma fila interrompida; nesse caso, confira e resolva os erros no painel antes de reativar. Essa configuração remota só é enviada quando você executa o comando. [Provisionamento pela API](https://docs.asaas.com/reference/criar-novo-webhook).

Selecione os eventos:

```text
PAYMENT_CREATED
PAYMENT_UPDATED
PAYMENT_CONFIRMED
PAYMENT_RECEIVED
PAYMENT_OVERDUE
PAYMENT_DELETED
PAYMENT_RESTORED
PAYMENT_REFUNDED
PAYMENT_PARTIALLY_REFUNDED
PAYMENT_REFUND_IN_PROGRESS
PAYMENT_REFUND_DENIED
PAYMENT_SPLIT_DONE
PAYMENT_SPLIT_CANCELLED
PAYMENT_SPLIT_DIVERGENCE_BLOCK
PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED
PAYMENT_CHARGEBACK_REQUESTED
PAYMENT_CHARGEBACK_DISPUTE
PAYMENT_AWAITING_CHARGEBACK_REVERSAL
```

Novos atributos no JSON são tolerados. Eventos de outros objetos ou cobranças externas ao app são reconhecidos sem alterar pedidos. Uma notificação serve para acordar a conciliação: valores e situação são consultados novamente na API Asaas antes de atualizar o banco. `PAYMENT_CONFIRMED` não emite ingresso: para Pix, aguardamos a disponibilidade efetiva `RECEIVED`. [Eventos oficiais de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas).

`localhost` e IP privado não recebem webhook do Asaas. Para testar localmente, exponha sua API com uma URL HTTPS de túnel configurada por você e cadastre essa URL no sandbox. Sem webhook, a conciliação periódica ainda consulta cobranças pendentes, mas não substitui o teste da entrega pública. Confira o log de webhooks no Asaas; se a fila for pausada por falhas, corrija a configuração e reative a fila.

## Como o ingresso é emitido

1. O torcedor reserva setor/quantidade. A reserva e o estoque continuam transacionais.
2. No pedido, informa CPF/CNPJ no primeiro pagamento. O servidor valida os dígitos verificadores e grava o documento criptografado AES-256-GCM. Apenas o final do documento volta ao app. O Asaas exige o cadastro do cliente para criar a cobrança. [Cadastro de pagador](https://docs.asaas.com/reference/criar-novo-cliente).
3. **Gerar Pix para pagar** grava uma intenção única para aquela versão do pedido. O processamento cria/reutiliza o cliente, cria a cobrança PIX e obtém o QR/Copia e Cola. O app mostra o QR pagável separado do QR de portaria.
4. Depois do pagamento, o webhook acorda a fila. A API consulta a cobrança por ID e verifica referência local, cliente pagador cadastrado naquele ambiente, forma de pagamento, valor e estado. A mesma conferência ocorre antes de mutações remotas, como cancelamento, split e estorno. Dados incompatíveis ficam em REVIEW e não autorizam a operação.
5. Com recebimento `RECEIVED`, reserva válida e estoque coerente, uma transação grava `TicketPayment(method=ASAAS)`, emite o ingresso e registra auditoria. O prazo é conferido novamente depois da consulta ao estoque; uma espera no banco não prolonga a reserva. Repetições não criam outro recibo ou outro ingresso.
6. A tela Pix consulta seu estado a cada 4 segundos enquanto aberta/em primeiro plano. Ao confirmar, atualiza a conta automaticamente. **Vendas** atualiza a cada 15 segundos; **Pagamentos** do admin, a cada 10 segundos. Isso é consulta automática, sem WebSocket ou push em segundo plano. A emissão no servidor independe de o app estar aberto.

Pendentes são conciliadas periodicamente mesmo sem webhook. Após recebimento, a frequência diminui; eventos de estorno voltam a acordar a cobrança imediatamente. Uma rodada lê até 100 notificações e 20 intenções. O intervalo entre rodadas é `PAYMENT_WORKER_INTERVAL_MS` (padrão 3000). O tempo total depende da fila e da disponibilidade do Asaas.

## Expiração, cancelamento e devolução

O prazo de reserva do app continua de até 15 minutos. O vencimento nativo do QR Asaas é diferente e pode continuar pagável por mais tempo; por isso, a aplicação cancela cobranças não pagas ao detectar reserva encerrada e oculta o QR. Uma corrida com pagamento ou uma confirmação após o vencimento **não emite ingresso**: solicita devolução integral e acompanha a confirmação. [Validade do QR Pix do Asaas](https://docs.asaas.com/docs/cobrancas-via-pix).

Uma reserva com Pix ativo não pode ser editada nem receber confirmação manual concorrente. Pode ser cancelada/excluída; o processador cancela a cobrança remota e trata eventual recebimento tardio. O webhook sempre confere a versão da reserva para não emitir uma compra nova a partir de um pagamento antigo.

Workers usam travas com token e prazo. Os marcadores anteriores à criação de cliente, cobrança e estorno são gravados com comparação do token vigente e do prazo da trava. Escritas de um worker substituído são recusadas. Isso complementa os marcadores de resultado ambíguo; não transforma a API externa e o banco local em uma única transação.

Excluir uma **venda já paga** mantém o comportamento administrativo anterior: invalida o ingresso e preserva o recibo, sem iniciar devolução automática. Para devolver, abra **Pagamentos → Solicitar estorno**, informe o motivo e confirme o saldo. O ingresso é bloqueado imediatamente. A devolução financeira só aparece concluída após confirmação do Asaas. Lugares já utilizados e registros de portaria são preservados.

Estornos parciais recebidos do provedor também são registrados e bloqueiam o ingresso para conferência. A interface solicita devolução do saldo integral restante, sem distribuição automática de quantidades de ingressos em um estorno parcial. Uma resposta inconclusiva a POST de cobrança/estorno não é repetida cegamente: a fila procura a operação já existente. Se não consegue comprovar o resultado, deixa **em conciliação** para evitar cobrança/devolução duplicada. **Conciliar agora** faz uma nova consulta; não ignora essa proteção nem cria novamente uma operação ambígua.

## Cashback e split

O caixa gera a venda; o torcedor vincula sua conta, cadastra o documento e gera o Pix. A API key pertence à conta emissora da plataforma. Cadastre previamente as contas Asaas recebedoras das lojas e configure o mapa por ID da loja local:

```dotenv
ASAAS_MERCHANT_WALLETS='{"UUID-DA-MERCHANT":"WALLET-ID-ASAAS-DA-LOJA"}'
```

Use UUIDs reais, do mesmo ambiente, e uma conta recebedora diferente da emissora. Sem mapeamento, a aplicação impede gerar Pix para essa loja. O app/caixa não escolhe recebedores financeiros.

Cashback e comissão contratados continuam calculados sobre o valor bruto. A criação consulta `netValue`, desconta a tarifa efetiva do repasse da loja e configura **um split fixo** do valor restante. A plataforma emissora retém cashback + comissão. Só expõe o Pix depois de configurar o split. Não usa percentual sobre bruto porque o percentual do Asaas incide no líquido. [Regras e liquidação do split](https://docs.asaas.com/docs/split-faq).

O crédito de cashback exige pagamento recebido **e split da loja com status DONE**, carteira vinculada e valores corretos. Split pendente/divergente mantém a operação em conciliação e não credita saldo. Estorno total reverte o cashback; estorno parcial reverte proporcionalmente, conservando centavos e evitando repetição. O extrato mantém um lançamento acumulado de reversão por venda.

A carteira representa saldo interno devido ao torcedor, respaldado pela retenção na conta emissora. Cadastro/KYC de subcontas, saques/transferências para o torcedor e gastar esse saldo em novas compras são fluxos separados e não foram adicionados nesta entrega. A disponibilidade dessas operações depende do contrato da conta Asaas.

## Rotas e arquivos

Todas em `/v1`:

| Método / rota | Acesso e conteúdo |
| --- | --- |
| GET `/payments/billing-profile` | Conta: habilitação, ambiente e final do documento |
| PUT `/payments/billing-profile` | Conta: `{ document }` |
| POST `/tickets/pix` | Titular: `{ ticketId }` |
| GET `/tickets/payment?ticketId=...` | Titular: última intenção do ingresso |
| POST `/payments/pix` | Titular da venda vinculada: `{ chargeId }` |
| GET `/payments/intent?id=...` | Titular: estado/QR seguro |
| POST `/payments/webhook` | Auth Token Asaas, sem JWT de usuário |
| GET `/admin/payments?limit=25&offset=0` | ADMIN: consulta paginada |
| POST `/admin/payments/reconcile` | ADMIN: `{ id }` |
| POST `/admin/payments/refund` | ADMIN: `{ id, reason }`, motivo 5–500 caracteres |

Código: `src/payments/asaas-client.js`, `src/models/asaas.store.js`, `src/services/asaas.service.js`, `src/controllers/asaas.controller.js` na API; `PixCheckout.tsx`, `AdminPaymentsPanel.tsx` e `services/pix.ts` no app. A migration `20261106010000_asaas_payments` adiciona cliente de cobrança, intenções, inbox e valores estornados do recibo; detalhes em `docs/banco/asaas.txt`.

## Validar antes de publicar a operação financeira

Testes automatizados: validação de documentos e valores, criptografia, autenticação HTTP, duplicidade de webhook, emissão idempotente, confirmação intermediária sem emissão, valores divergentes, expiração/cancelamento, timeout de criação e estorno, lease de processamento e crédito/reversão de cashback. `asaas-flow.test.js` aplica todas as migrations em PostgreSQL WASM descartável e usa Prisma e o fluxo HTTP em memória com o provedor controlado. Isso não consulta o sandbox real nem altera o banco local.

Após preencher as chaves, faça uma reserva de teste, gere o Pix e utilize o recurso do sandbox Asaas para confirmar o recebimento. Confira no log a entrega HTTP 200, o ingresso emitido sem clique administrativo, a atualização da tela e uma solicitação de estorno. Teste uma loja com walletId de sandbox para conferir o evento de split. Nenhuma chamada autenticada ao Asaas foi executada pelo agente sem suas chaves.

Verifica??o desta entrega: 110 testes da API (incluindo os cen?rios PostgreSQL isolados) e 24 do app passaram, al?m de TypeScript, sintaxe JavaScript, valida??o Prisma, configura??o Docker Compose e exporta??o web/iOS em `.artifacts/asaas-app`. A migration n?o foi aplicada no PostgreSQL local porque ele estava desligado. A inspe??o visual em aparelho e a execu??o autenticada no sandbox permanecem pendentes.
