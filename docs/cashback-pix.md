# Cashback e Pix — modelo B primeiro

A decisão desta etapa é iniciar pelo QR gerado pelo caixa (B). O QR fixo da loja (A) usa o mesmo motor, mas fica desativado por parceria até ser habilitado. O gateway ainda não foi escolhido. Nenhuma cobrança, transferência ou custódia de dinheiro real foi habilitada.

## Jornada do caixa e do torcedor

1. O operador entra em sua conta de caixa e escolhe a loja/instituição autorizada.
2. Informa o valor. Pode informar o **código da carteira do torcedor**, que está no app. O CPF não foi coletado nesta etapa.
3. Se não houver identificação prévia, o caixa mostra um **QR da venda do Naça**. O torcedor o lê no app, revisa loja/valor/cashback e vincula a compra à própria conta.
4. Com a conta vinculada e o gateway integrado, será disponibilizado o **QR Pix de pagamento**. O cliente o lê no aplicativo do banco dele, ou copia o Pix do Naça e cola no banco. Ler o QR da venda não movimenta dinheiro.
5. O gateway confirma pagamento e liquidação correta do split. Caixa e carteira consultam o estado atualizado. Somente então o cashback entra no extrato.

Se o código do torcedor já foi informado no caixa, a leitura pelo Naça é dispensável: o cliente pode pagar o QR Pix diretamente pelo banco. QR de venda e QR Pix têm funções distintas. Não há abertura universal e automática de aplicativos bancários, nem integração Open Finance nesta etapa.

A especificação do Pix prevê iniciação por QR e Pix Copia e Cola no aplicativo da instituição. O contrato de um gateway pode oferecer split nativo e eventos assíncronos. Retorno visual ao app e comprovante informado pelo cliente não confirmam liquidação. Fontes: [Banco Central — sobre o Pix](https://bcb.gov.br/estabilidadefinanceira/pix-sobre), [Asaas — eventos de cobrança](https://docs.asaas.com/docs/webhook-para-cobrancas), [Asaas — FAQ do checkout](https://docs.asaas.com/docs/faq-do-asaas-checkout).

## Divisão e carteira

Exemplo demonstrativo acordado na parceria:

| Destino | R$ 100 de compra |
| --- | --- |
| Loja | R$ 88 |
| Obrigação de cashback ao torcedor | R$ 10 |
| Comissão da plataforma | R$ 2 |
| Tarifa do gateway | R$ 0 na simulação |

Taxas são armazenadas em basis points: `1000` = 10%, `200` = 2%. O servidor calcula tudo em centavos e guarda a divisão na cobrança. Alterar a parceria não muda a divisão de vendas antigas. A tarifa efetiva do provedor precisará ser conhecida na criação/reconciliação; neste modelo ela reduz o repasse da loja. Condições comerciais e destinatários reais ainda precisam ser definidos.

O cashback em reais fica em `CashWallet`/`CashEntry`. Pontos Zezito continuam em `User.points`/`PointEntry`. Não há conversão implícita entre esses saldos. O valor de cashback representa uma obrigação com o torcedor; não é contabilizado automaticamente como comissão. O uso em ingressos/planos/produtos, saque e expiração de saldo não estão habilitados.

O estudo anexado é uma proposta comercial, não uma definição tributária ou de custódia. Rendimento de saldo, breakage, tratamento fiscal e proteção contra bloqueios não foram assumidos como receita ou garantia do produto. Esses pontos precisam ser definidos com o provedor e os responsáveis jurídicos/contábeis antes da operação financeira.

## Dados e limites desta etapa

- `Merchant`: loja compartilhada entre instituições, vinculável a um parceiro visual já existente.
- `Tenant`: instituição beneficiária, por exemplo Nacional de Patos.
- `MerchantOffer`: regras específicas da loja para cada instituição e habilitação do modelo A.
- `MerchantOperator`: autorização de caixa por conta/loja. O torcedor não recebe essa permissão.
- `CashWallet`: carteira por instituição/usuário, com código aleatório de identificação.
- `PaymentCharge`: venda, identificação opcional do torcedor, validade, divisão e referência de gateway.
- `PaymentEvent`: eventos únicos do provedor, com fingerprint para impedir reutilização de IDs para outra venda.
- `CashEntry`: créditos e estornos, uma movimentação por tipo/venda. A API somente adiciona lançamentos.

O isolamento por instituição foi implementado na camada de cashback. Jogos, planos e identidade visual do restante do app ainda usam a base Nacional; a conversão completa do produto para white-label é uma etapa posterior.

Crédito/estorno, lançamento e estado da venda são atualizados na mesma transação Serializable, com repetição limitada. A devolução total desconta o cashback uma vez. Eventos de pagamento recebidos após um estorno não recriam saldo. Devoluções parciais ainda exigem implementação. Pagamento efetuado fora da validade e divergência de valores são bloqueados para conciliação; uma integração real precisará de fila de revisão e alertas para esses casos.

O saldo disponível nunca é apresentado abaixo de zero. Se no futuro houver gasto seguido de estorno, o saldo líquido negativo vira `debtCents`, separado do disponível. Ainda não existe endpoint de gasto. Não há endpoint público para escrever saldo, divisão, conta bancária, estado pago ou destinatário do split.

## Testar a demonstração local do app

Com `EXPO_PUBLIC_DEMO_MODE=true`, o fluxo não precisa de API:

1. Perfil → **Caixa demonstrativo**.
2. Informe `100,00` e toque em **Usar meu código demo**, ou gere sem código para explorar a vinculação pelo QR.
3. Gere a venda. Confira repasse, cashback e comissão.
4. **Simular confirmação de pagamento** registra R$ 10 na carteira demonstrativa. Abra Perfil → Meu cashback ou Vantagens → Cashback disponível.
5. No caixa, selecione a venda e **Simular estorno total**. O crédito é compensado por um lançamento de estorno.

Para testar sem código prévio: **Abrir esta venda como torcedor** → vincular cashback. Depois volte ao caixa e selecione a venda na lista para simular a confirmação. Também é possível copiar o link e colá-lo no leitor de QR.

Essa simulação permanece na sessão. Nenhum QR demonstrativo é Pix pagável. A câmera requer permissão; no navegador, localhost ou HTTPS. O esquema `nacional://` exige app/build com o esquema registrado para abrir a partir de outro aplicativo; o leitor interno e a colagem do link também funcionam.

## Testar a API quando você iniciar o ambiente

A migration `20261014020000_cashback_payments` foi gerada por comparação de schemas, **sem conexão ao banco**. Não foi aplicada nesta revisão.

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
```

Em `apps/api/.env`, habilite `PAYMENT_MODE=demo` para simular cobranças fora de produção. O padrão é `disabled`; produção rejeita o modo demo na inicialização. Em `apps/mobile/.env`, configure `EXPO_PUBLIC_DEMO_MODE=false` e a URL da API.

Conta torcedor: `rafael@demo.nacional.local`. Conta caixa: `caixa@demo.nacional.local`. A senha inicial de ambas vem de `SEED_DEMO_PASSWORD`. O seed preserva contas existentes. A conta caixa tem permissão apenas para a loja demonstrativa. Para testar caixa e consumidor simultaneamente, use dois dispositivos/sessões de app. A tela do caixa também pode ser usada na versão Expo web.

`npm run test:integration` inclui o teste financeiro no PostgreSQL de desenvolvimento: acesso do operador, carteira por instituição, QR fixo desativado/ativado, disputa pela vinculação, eventos concorrentes, duplicidade e estornos. Esse comando abre o servidor temporário do teste original e consulta o banco. **Não foi executado**, respeitando a orientação de deixar a execução do ambiente com o usuário.

## Contrato para o gateway escolhido

O ponto de extensão é `apps/api/src/payments/gateway.js`. Hoje ele fornece somente cobrança demonstrativa e rejeita webhooks reais. O endpoint `/payments/webhook` retorna 503 enquanto não houver integração autenticada.

Antes de habilitar um adaptador real:

1. Provisionar e validar contas recebedoras/KYC; armazenar referências de gateway no servidor. Não aceitar chaves ou contas financeiras do app/caixa.
2. Criar cobrança Pix com split nativo, destino autorizado e chave de idempotência igual ao ID interno da venda.
3. Separar chamada externa de transação SQL por outbox/estado de criação e recuperação. O adaptador demo atual não faz IO; não substitua simplesmente por uma chamada de rede dentro da transação.
4. Adiar o Pix pagável enquanto o torcedor não estiver vinculado, ou exigir seu código no caixa. Evitar pagamento sem beneficiário de cashback identificado.
5. Autenticar o webhook conforme o provedor, consultar/reconciliar cobrança e split, verificar moeda/valor/tarifas/destinatários. Só então produzir um evento normalizado `SETTLED` ou `REFUNDED` para o model.
6. Implementar revisão de divergências, atualização fora de ordem, devolução parcial, indisponibilidade do gateway e reconciliação periódica.
7. Validar liquidação e estorno em sandbox; habilitar dinheiro real apenas após fechar os contratos de operação e recebimento.

Não foi adotado Asaas, Pagar.me ou outro provedor. As referências do Asaas apenas esclarecem confirmação assíncrona e split; não representam uma integração ativa nem garantia universal de prazo/tarifas.
