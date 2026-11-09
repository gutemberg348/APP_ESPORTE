# Loja oficial: produtos, estoque, pedidos e frete

Implementação inicial em 06/11/2026. O menu **Loja** do administrador tem Produtos, Pedidos, Estoque, Frete e Configurações. O botão **Loja** do aplicativo abre o catálogo ou o link externo configurado. Em 09/11/2026, as migrations foram aplicadas ao banco local e foram cadastrados [cinco produtos demonstrativos com imagens](catalogo-esporte-teste.md). Não foi iniciado um servidor ou enviada cobrança real pelo agente.

## Ativar no seu ambiente

Com seu PostgreSQL disponível, execute na raiz:

```powershell
npm run db:generate
npm run db:deploy
```

A migration `20261106020000_shop` cria as tabelas da loja e adiciona um terceiro destino à intenção financeira Asaas. Não remove dados existentes. Depois, inicie/reinicie a API e o Expo pelos seus comandos habituais. A loja começa **fechada** e sem produtos fictícios.

1. No admin, entre em **Loja → Frete** e informe endereço para retirada. Pode desabilitar retirada se só trabalhar com entregas.
2. Em **Configurações**, escolha loja interna ou link externo HTTPS. No modo externo, as compras do outro site não são sincronizadas com este estoque ou painel.
3. Para loja interna, cadastre produtos e suas variações. Os campos principais são nome, preço, categoria, descrição, SKU e estoque inicial. Custo, preço anterior e embalagem ficam em uma seção adicional.
4. Revise peso e medidas reais de cada produto embalado antes de habilitar frete automático. Os valores iniciais do formulário são sugestões editáveis, não medições do produto.
5. Publique os produtos e abra a loja nas configurações.

As fotos são cadastradas por **URLs HTTPS de imagens já hospedadas**; podem ser reordenadas alterando os campos, e a primeira vira capa. Upload/armazenamento de arquivos não foi implementado. Não são necessárias novas dependências de interface: os campos, selects, botões, tabelas, modais e avisos reutilizam os componentes existentes.

O campo **SKU / referência** possui um botão pequeno vermelho **Gerar**. A API propõe uma referência aleatória `PRD-...`, consulta os SKUs existentes (inclusive de produtos arquivados e variações inativas) e evita os códigos já preenchidos no formulário. Ao digitar, a consulta automática informa se o código está disponível, pertence à própria variação ou já foi cadastrado. Referências repetidas no formulário também bloqueiam o envio. Gerar um SKU não cadastra nem reserva um produto; o cadastro é confirmado ao salvar, e a lista mostra a mensagem de sucesso. O índice UNIQUE e a transação impedem SKUs duplicados mesmo em salvamentos concorrentes.

Rotas exclusivas do administrador: POST `/v1/admin/shop/skus/generate` com `{excludeSkus: string[]}` e POST `/v1/admin/shop/skus/check` com `{items: [{sku, variantId?}]}`. Até 50 referências por consulta. Não há nova tabela ou migração para essa função. A grade dos formulários passa a empilhar os campos quando o espaço útil é menor que 520 px, mantendo os tamanhos naturais dos campos e eliminando as alturas extras causadas pelo `grow` dentro da grade.

## Frete automático: Melhor Envio

A integração da API é gratuita e exige uma conta/token. A compra de etiquetas e o transporte são pagos separadamente. A API direta de preços dos Correios exige contrato habilitado; por isso o projeto usa Melhor Envio para consultar esses serviços. [Introdução oficial do Melhor Envio](https://docs.melhorenvio.com.br/reference/introducao-api-melhor-envio) e [requisitos dos Correios](https://www.correios.com.br/atendimento/developers/manuais/manual-api-preco-1).

Campos já preparados em `apps/api/.env`, `.env.example`, ambiente Docker e script de setup:

```dotenv
MELHOR_ENVIO_ENVIRONMENT=sandbox
MELHOR_ENVIO_TOKEN=
MELHOR_ENVIO_CONTACT_EMAIL=
MELHOR_ENVIO_SERVICES=1,2
```

Preencha o token obtido na sua conta e um email de contato técnico. As credenciais de sandbox e produção são separadas. Não coloque o token em `EXPO_PUBLIC_*`, nos campos da loja, no app ou no Git. Se usar OAuth, a renovação do token é gerida por você; esta etapa não inclui autorização OAuth nem renovação automática. [Autenticação, ambientes e validade de tokens](https://docs.melhorenvio.com.br/reference/faq).

`1,2` restringe a cotação aos serviços correspondentes dos Correios. Deixe `MELHOR_ENVIO_SERVICES=` vazio para consultar os serviços habilitados na conta. No admin selecione **Frete → Cotação automática · Melhor Envio**, informe o CEP de origem e salve. Sem token/email, a API informa que a cotação não está configurada e impede ativar esse modo numa loja aberta.

O servidor envia CEPs e os produtos do próprio banco: dimensões em centímetros, peso convertido de gramas para quilogramas, valor unitário em reais e quantidade. Usa `custom_price` e `custom_delivery_time` quando retornados. Transportadoras indisponíveis ou respostas inválidas não viram opções de compra. A cotação é gravada por conta/carrinho/CEP, expira em **10 minutos** e precisa corresponder ao pedido. [Contrato oficial de cotação](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos).

Sandbox aparece como cotação de teste. Uma API em produção com Asaas de produção recusa checkout que use cotação de frete sandbox. A compra do frete/etiqueta, impressão e atualização automática do rastreio **não fazem parte desta etapa**. Gere a etiqueta no Melhor Envio, confira a embalagem e documentação fiscal, e informe código/link de rastreio no pedido. O valor da cotação não garante o preço de uma etiqueta comprada posteriormente com embalagem ou dados diferentes.

Alternativas disponíveis: retirada gratuita ou **tabela própria por faixa de CEP**, com preço base, adicional por kg iniciado, prazo mínimo/máximo e frete grátis a partir de um subtotal. Regras podem ser editadas ou pausadas. A tabela não é usada como substituição silenciosa quando o provedor está indisponível.

O botão de busca de endereço consulta ViaCEP com CEP de 8 dígitos; endereço completo, número e complemento continuam editáveis. Se a consulta falhar, o usuário pode preencher manualmente. Isso não valida a existência física do endereço. [Contrato ViaCEP](https://viacep.com.br/).

## Compra, estoque e recebimento

- O carrinho não reserva unidades. A cotação também não garante disponibilidade.
- Ao confirmar o pedido, a API recalcula preço, confere a cotação, verifica usuário ativo e estoque dentro de uma transação Serializable. Total e valor de frete enviados pelo app não substituem os dados do servidor.
- Há limite de 20 variações, 20 unidades por variação, 50 unidades por pedido e 3 pedidos pendentes não expirados por conta. O valor total máximo é R$ 1.000.000,00. Os limites de API por conta/minuto são 20 consultas compartilhadas entre cotação/CEP e 10 operações entre criação/cancelamento/Pix. São limites em memória por instância; múltiplas instâncias precisam de armazenamento compartilhado.
- O pedido reserva por **30 minutos**. Físico é o estoque em mãos; reservado soma pedidos PENDING não expirados; disponível é físico menos reservado. A expiração libera disponibilidade por consulta, sem depender de um cron para alterar status. `EXPIRED` é uma situação calculada para exibição.
- A chave de operação enviada pelo cliente torna repetição da mesma compra idempotente. Reutilizá-la com dados diferentes é recusado. Se a resposta se perder, a tela mantém a tentativa para repetir a mesma operação; ao fechar a tela/recarregar, confira Meus pedidos antes de começar outra compra. O carrinho e a tentativa ainda não são persistidos no dispositivo.
- Em `PAYMENT_MODE=asaas`, CPF/CNPJ, geração de Pix e consulta automática usam o componente `PixCheckout` e o mesmo webhook/fila já utilizado para ingressos. Cada pedido tem uma única intenção financeira por ambiente. Só `RECEIVED` pode efetivar o recebimento; `CONFIRMED` aguarda. A API confere o cliente pagador, referência, valor e modalidade consultando o provedor.
- Recebimento confirma `ShopPayment`, baixa as unidades físicas, cria movimentações `SALE`, marca PAID e grava auditoria na mesma transação. Repetição do webhook não baixa o estoque novamente. Pedido gratuito emite recibo FREE automaticamente.
- Sem Asaas, o cliente pode reservar e seguir as instruções da loja. O admin confirma manualmente somente após conferir o recebimento real, informando valor exato, referência única e motivo. Pix ativo impede confirmação manual concorrente.
- Pagamento tardio, cancelado ou sem estoque não é aproveitado para outra compra; solicita estorno e acompanha o resultado. O prazo bancário do Pix pode superar os 30 minutos da reserva.
- Ajustes de estoque exigem motivo, versão atual e chave única de operação. Uma baixa não pode deixar o saldo abaixo das reservas existentes. Dados antigos não sobrescrevem edições recentes.

Cada item guarda nome, SKU, variação, imagem e preço de venda/custo do momento da compra. Editar o catálogo não muda o histórico dos pedidos. Custo interno e dados técnicos da cotação não aparecem na API do torcedor. O número sequencial do pedido facilita atendimento, mas não concede acesso ao pedido de outra conta.

## Preparação, entrega e estorno

Os pedidos têm filtros por número/nome/email, situação e período, paginação, recebimento bruto, devoluções e total recebido menos devoluções. Este total ainda não desconta custos, tarifas ou impostos. A aba atualiza a cada 15 segundos; Meus pedidos no app consulta a cada 10 segundos enquanto está visível.

Fluxos autorizados:

```text
PENDING → PAID → PREPARING → SHIPPED → DELIVERED   (entrega)
PENDING → PAID → PREPARING → READY → DELIVERED     (retirada)
                    PAID → READY                  (retirada, atalho)
PENDING → CANCELED / EXPIRED
pedido pago → REFUND_REVIEW → REFUNDED
```

Postar exige código de rastreio. É possível informar link HTTPS e mensagem visível ao cliente. A ação exige versão atual, motivo e recebimento compatível; devolução pendente impede despacho. O registro de entregue/retirado é administrativo e não uma confirmação automática da transportadora.

Pedidos não pagos podem ser cancelados. Pedidos pagos usam **Pagamentos → Solicitar estorno** quando o recibo é Asaas. A preparação é bloqueada imediatamente, e a devolução financeira só é concluída após confirmação do gateway. Estorno integral antes da postagem/retirada devolve o estoque uma vez; estorno parcial bloqueia para conferência. Mercadoria já enviada/entregue **não volta ao estoque automaticamente**: confira o retorno físico e registre uma entrada com motivo em Estoque.

Recibos manuais não são devolvidos pelo gateway: o atendimento realiza a devolução pelo meio original e, nos detalhes do pedido, usa **Registrar devolução manual já realizada**. Exige valor integral exato, referência única, motivo e confirmação de que o comprovante foi conferido. O registro não transfere dinheiro; usa as mesmas regras de reposição de estoque e preserva o recibo original. Produtos são arquivados, preservando pedidos, recibos e movimentações. Não há exclusão física de vendas nem alteração do valor de um pedido já pago.

## Arquivos e validação

| Parte | Arquivos principais |
| --- | --- |
| Banco | `apps/api/prisma/schema.prisma`, migration `20261106020000_shop` |
| API | `controllers/shop.controller.js`, `services/shop.service.js`, `models/shop.store.js`, `validators/shop.js` |
| Estoque e recebimento | `apps/api/src/lib/shop-inventory.js` |
| Pix e webhook | `apps/api/src/models/asaas.store.js` |
| Melhor Envio / CEP | `apps/api/src/shipping/providers.js` |
| Admin | `apps/mobile/src/components/admin/shop/` |
| App | `screens/ShopScreen.tsx`, `components/shop/`, `services/shop.ts` |
| Contratos | `packages/shared/shop.ts` |
| Máscaras reutilizáveis | `packages/shared/forms.js`, `forms.d.ts`, `components/Typography.tsx`, `components/admin/AdminControls.tsx` |

As máscaras de CPF/CNPJ, telefone, CEP e moeda são compartilhadas. Campos em reais exibem separador brasileiro e são convertidos para centavos inteiros antes de enviar. As máscaras não substituem validação: a API confere documento nos pagamentos, telefone/endereço no checkout e valores/quantidades nos formulários. Contato que permite email ou telefone conserva texto de email. Cadastro de conta continua pedindo somente nome, email e uma senha; endereço/telefone são pedidos no checkout e CPF/CNPJ no primeiro Pix.

`npm run test:unit` cobre API/app e inclui estoque, idempotência, autorização das rotas reais, preço/frete adulterado, valores históricos, confirmação manual, Pix/webhook, pagamento tardio e estornos com/sem postagem. Esses cenários usam PostgreSQL descartável PGlite com migrations reais e provedores simulados; não usam suas credenciais nem o banco local. A exportação web/iOS e a verificação TypeScript são verificações de build, não inspeção visual em aparelho. É necessário testar a configuração autenticada no sandbox e o fluxo físico de expedição antes de operar.

Para limpar somente cotações vencidas há mais de 24 horas, execute ou agende no servidor:

```powershell
npm run shop:cleanup --workspace @nacional/api
```

Pedidos, pagamentos, estoque e auditoria são preservados. Cadastros/JWT e permissões continuam compartilhados; esta loja é da instância atual do clube, sem isolamento completo de vários clubes no mesmo banco.


## Endpoints da loja

Todas as rotas abaixo exigem login. As rotas `/admin/shop/*` exigem ADMIN ativo. A versão e a chave de operação são conferidas na API conforme a ação.

| Método | Rota | Acesso |
| --- | --- | --- |
| GET | `/v1/shop/settings` | Comprador |
| GET | `/v1/shop/products` | Comprador |
| GET | `/v1/shop/postal-code` | Comprador |
| POST | `/v1/shop/quote` | Comprador |
| POST | `/v1/shop/orders` | Comprador |
| GET | `/v1/shop/orders` | Comprador |
| POST | `/v1/shop/orders/cancel` | Comprador |
| POST | `/v1/shop/pix` | Comprador |
| GET | `/v1/shop/payment` | Comprador |
| GET | `/v1/admin/shop/settings` | ADMIN |
| PUT | `/v1/admin/shop/settings` | ADMIN |
| GET | `/v1/admin/shop/products` | ADMIN |
| POST | `/v1/admin/shop/products` | ADMIN |
| PATCH | `/v1/admin/shop/products` | ADMIN |
| DELETE | `/v1/admin/shop/products` | ADMIN |
| GET | `/v1/admin/shop/stock` | ADMIN |
| POST | `/v1/admin/shop/stock` | ADMIN |
| GET | `/v1/admin/shop/stock/movements` | ADMIN |
| GET | `/v1/admin/shop/shipping` | ADMIN |
| POST | `/v1/admin/shop/shipping` | ADMIN |
| PATCH | `/v1/admin/shop/shipping` | ADMIN |
| GET | `/v1/admin/shop/orders` | ADMIN |
| POST | `/v1/admin/shop/orders/cancel` | ADMIN |
| POST | `/v1/admin/shop/orders/confirm` | ADMIN |
| POST | `/v1/admin/shop/orders/refund-manual` | ADMIN |
| PATCH | `/v1/admin/shop/orders` | ADMIN |
