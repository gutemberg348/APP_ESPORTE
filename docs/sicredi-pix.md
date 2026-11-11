# Pix Sicredi — recebimentos, webhook e devolução

A Sicredi está integrada ao checkout Pix existente de ingressos (`Ticket`) e pedidos da loja. Selecione `PAYMENT_MODE=sicredi`. O app mantém geração de QR local, copia e cola e acompanhamento automático; o painel mantém conciliação e solicitação de devolução. Sicredi é a única integração bancária ativa. Os modos disponíveis são `disabled`, `demo` (local) e `sicredi`. Não há opção de ativar Asaas.

O guia de outro projeto foi adaptado à estrutura deste repositório, conferindo os contratos de mTLS/OAuth/COB na [documentação oficial Sicredi](https://developers.sicredi.com.br/public/docs/getting-started-pix) e no [schema Pix do Banco Central](https://github.com/bacen/pix-api/blob/master/openapi.yaml). Certificados, credenciais e nomes de arquivos do outro projeto não foram copiados.

## Preparar o ambiente

O bloco `SICREDI_PIX_*` já está em `apps/api/.env` com campos privados vazios e um token de webhook aleatório. O modo de pagamento existente não foi ativado/trocado automaticamente sem as credenciais. O modelo versionado fica em `apps/api/.env.example`.

Na VPS, a pasta definida é **`/etc/nacional/certificados`**, criada com proprietário `server` e modo `700`. Os arquivos enviados à VPS foram identificados com os nomes `sicredi-multipag.cer`, `sicredi-multipag.key` e `sicredi-multipag-chain.cer`; ajuste o nome no caminho se os arquivos enviados tiverem outros nomes:

```dotenv
PAYMENT_MODE=sicredi
SICREDI_PIX_ENV=production
SICREDI_PIX_API_URL=https://api-pix.sicredi.com.br/api/v2
SICREDI_PIX_AUTH_URL=https://api-pix.sicredi.com.br/oauth/token
SICREDI_PIX_CLIENT_ID=PREENCHER
SICREDI_PIX_CLIENT_SECRET=PREENCHER
SICREDI_PIX_RECEIVING_KEY=PREENCHER
SICREDI_PIX_CERT_PATH=/etc/nacional/certificados/sicredi-multipag.cer
SICREDI_PIX_KEY_PATH=/etc/nacional/certificados/sicredi-multipag.key
SICREDI_PIX_CHAIN_PATH=/etc/nacional/certificados/sicredi-multipag-chain.cer
SICREDI_PIX_CERT_PASSPHRASE=
SICREDI_PIX_TXID_PREFIX=ESP
SICREDI_PIX_TIMEOUT_MS=10000
SICREDI_PIX_WEBHOOK_TOKEN=MANTER_O_TOKEN_PRIVADO_GERADO
SICREDI_PIX_WEBHOOK_URL=https://sua-api.com.br/v1/payments/webhooks/sicredi
```

Para executar o Node diretamente na VPS, use esses caminhos absolutos e o usuário `server`, que é o dono da pasta. O modo `700` permite acesso somente a esse usuário. Para testes no PC, ajuste os caminhos para os arquivos locais (por exemplo `../../.secrets/sicredi/sicredi-multipag.cer`). Caminhos relativos são resolvidos a partir de `apps/api`, independentemente do terminal. Certificado do cliente aceita PEM/DER; a cadeia deve estar em PEM. A chave precisa corresponder ao certificado assinado; CSR não é certificado. Senha de chave criptografada é configurada em `SICREDI_PIX_CERT_PASSPHRASE`. Nenhum certificado/chave vai ao app ou ao Git. A pasta `.secrets` e as extensões de chaves/certificados foram excluídas também do contexto Docker.

Para homologação, use `SICREDI_PIX_ENV=sandbox` e as duas URLs fornecidas pela equipe Sicredi. O host de homologação do outro projeto não foi presumido válido. Não use URLs de produção com a expectativa de simulação: autenticação e operações financeiras serão reais quando o ambiente for configurado.

Com seu PostgreSQL ligado, execute na raiz:

```powershell
npm run db:generate
npm run db:deploy
npm run sicredi:diagnostic
npm run sicredi:token
```

`diagnostic` somente confere certificado, chave e validade; `token` somente autentica com `cob.read`, sem exibir o token e sem criar cobrança. Outros escopos podem ser conferidos com `npm run sicredi:token --workspace @nacional/api -- cob.write`, `pix.read` e `pix.write`. O teste autenticado exige a configuração real; não foi executado nesta implementação. Depois de configurar, reinicie a API que você mantém aberta, para carregar o ambiente e o worker. Renovações de certificado também exigem reinício do processo para recarregar o material mTLS.

A migration `20261111020000_sicredi_pix` está preparada e passou em PostgreSQL descartável. **Não foi aplicada ao banco local nesta revisão:** a conexão em `localhost:55432` retornou `ECONNREFUSED`. Nenhum container ou serviço foi iniciado/reiniciado. Existem 30 diretórios de migrations; não confunda isso com confirmação de que seu banco já executou todos.

## Docker na VPS

A implantação atual usa três containers separados, conforme o [guia da VPS](vps-docker.md). Configure os dados no `.env` da raiz; os comandos de diagnóstico na VPS devem rodar dentro do serviço `api`.

Configure as variáveis do `.env` da raiz, usando `.env.example`. `SICREDI_CERTS_DIRECTORY=/etc/nacional/certificados` aponta à pasta da VPS no `.env` da raiz. O Compose monta essa pasta em `/run/sicredi` somente para leitura, com os nomes `sicredi-multipag.cer`, `sicredi-multipag.key` e `sicredi-multipag-chain.cer`. Credenciais e senha ficam nas variáveis do backend. A imagem não recebe cópias desses arquivos. O Compose executa a API com `API_UID`/`API_GID`, preenchidos pelo setup conforme o usuário `server`. Com a pasta `700`, esses números precisam coincidir com o proprietário dos certificados (consulte `id -u server` na VPS). O bind mount somente para leitura não concede permissões adicionais. Nenhum comando Docker foi executado nesta alteração.

## Webhook sem quebrar o outro projeto

A base de `SICREDI_PIX_WEBHOOK_URL` termina em `/v1/payments/webhooks/sicredi`, sem token ou query. O comando abaixo acrescenta o segredo privado ao caminho ao registrar o endereço (na VPS em Docker, use `docker compose exec api node scripts/sicredi-pix.mjs webhook`):

```powershell
npm run payments:webhook
```

O backend atende POST tanto em `/v1/payments/webhooks/sicredi/:token` como em `/v1/payments/webhooks/sicredi/:token/pix`, cobrindo a entrega com sufixo `/pix`. Os logs internos ocultam o token desse caminho. A publicação exige HTTPS e a configuração do proxy/mTLS de entrada requerida pela cooperativa; proteja também os logs do proxy, que não usam o sanitizador do Express.

O comando consulta o cadastro antes de escrever. **Se a chave Pix já estiver apontada para outro projeto, não sobrescreve o webhook.** Nesse caso, mantenha o receptor central existente encaminhando notificações por TXID ou use o polling já incluído aqui. O worker consulta automaticamente as cobranças conhecidas mesmo sem webhook. A assinatura/segredo de webhook do Asaas não é reutilizada na Sicredi.

A notificação tem limite de tamanho/lote e segredo no caminho. Ela somente acorda cobranças conhecidas. Valor, nome e status recebidos no webhook não creditam saldo, não emitem ingresso e não consomem estoque. A API consulta o banco autenticada antes de qualquer lançamento.

## Cobrança e confirmação

1. A API grava um `GatewayIntent` com provedor, ambiente, valor em centavos, reserva e TXID criptograficamente aleatório antes do banco. O prefixo do projeto (1–3 caracteres) + 32 hexadecimais mantém TXIDs de 33–35 caracteres e unicidade no banco.
2. O worker consulta o mesmo TXID e só cria uma COB quando não existe e a criação não está ambígua. A cobrança usa `PUT /cob/{txid}`, valor decimal com duas casas e `modalidadeAlteracao=0`.
3. A imagem QR é gerada localmente pelo app a partir de `pixCopiaECola` bancário. Criar cobrança não confirma pagamento. Se a consulta omitir o copia e cola já recebido na criação, o conteúdo bancário anterior é preservado até o fechamento/expiração.
4. Para confirmar, a API confere status `CONCLUIDA`, TXID, chave recebedora, valor exato e um recebimento. Consulta também `GET /pix/{e2eid}` e confere novamente TXID, E2E, valor e horário válido.
5. A transação Serializable emite o ingresso ou confirma o pedido/baixa estoque, registra financeiro/auditoria e associa um E2E único. Repetição, polling e webhook não duplicam pagamento ou estoque.

Timeout/500 não criam novo TXID. A referência continua em conciliação. Falhas definitivas de autenticação/rejeição permitem retomar com o mesmo TXID após corrigir o acesso. Leituras divergentes ou regressão de pagamento não liberam ingresso. Processos possuem lease, token de posse e gravações condicionais; um worker substituído não pode concluir o lançamento.

Se o pagamento chegar após a reserva expirar, o estoque não estiver disponível, a venda tiver sido cancelada ou a geração da reserva mudar, a operação entra em devolução sem emitir ingresso indevido. Cobranças removidas/expiradas continuam sujeitas à consulta para detectar recebimentos tardios.

## Devoluções e financeiro

O administrador solicita a devolução pelo painel **Pagamentos**, com motivo. O acesso/preparação do pedido é bloqueado imediatamente. O ID e o valor da devolução são persistidos antes de `PUT /pix/{e2eid}/devolucao/{id}`. Timeout conserva esse ID; uma consulta acompanha a mesma operação. A devolução só é concluída localmente quando o banco confirma `DEVOLVIDO`. `NAO_REALIZADO` exige conferência. Devoluções externas/parciais também invalidam o ingresso e aparecem como parciais; não são ocultadas por um status antigo.

A comissão da empresa, percentual do clube e base de cálculo continuam usando a política capturada na compra em **Financeiro → Configurações**, sem alterar recebimentos antigos. A API Pix utilizada não fornece o líquido/tarifa efetiva nos retornos de cobrança e recebimento: a tarifa permanece `ESTIMATED` conforme a configuração financeira, até conferência do extrato/tarifa contratada. Não é tratada como taxa efetiva zero. Custos de devoluções sem emissão de ingresso precisam de conferência financeira; não se inventa uma tarifa bancária retornada pela API.

Repasse semanal e saques existentes permanecem manuais, com registro/comprovante no painel. Esta API Pix recebe e devolve o recebimento original; não executa transferência genérica ou split de parceiros. **Cashback com split está bloqueado em modo Sicredi**, incluindo criação pelo caixa. Não há split fictício nem crédito baseado somente em um webhook. Envio automatizado de repasses exigiria outra integração, como Multipag.

## Histórico e V1

O painel identifica o provedor dos registros históricos e opera novos pagamentos somente pela Sicredi. Os pagamentos anteriores ficam para consulta, sem ações remotas. Uma cobrança existente não é renomeada para o novo provedor. Reservas com cobrança de outro provedor/ambiente precisam ser conciliadas originalmente antes de uma nova emissão; a interface não exibe QR pagável de provedor inativo. A opção de ativar Asaas foi retirada. Seus serviços, controller e comando de cadastro de webhook não fazem parte da operação atual. Registros anteriores permanecem somente para consulta.

Esta troca do gateway atende ao **checkout existente de `Ticket` e da loja**. Não transforma automaticamente o checkout anterior em `PedidoIngressoV1`/`IngressoV1`. A emissão administrativa V1 permanece separada, conforme [documentação da portaria V1](ingresso-v1.md). Nenhum ingresso antigo foi convertido ou reativado.

## Estrutura

- `src/payments/sicredi/transport.js`: mTLS, certificados e transporte HTTPS sem redirecionamento ou desativação de validação TLS.
- `src/payments/sicredi/client.js`: OAuth com cache por escopo, cobrança, consulta, remoção, Pix, devolução e webhook.
- `src/models/sicredi.store.js`: operações persistidas, conciliação, estoque, financeiro, devolução e idempotência.
- `src/services/pix.service.js`: seleção de provedor, worker e leitura autorizada de histórico.
- `src/controllers/pix.controller.js`: rotas existentes de Pix e webhook Sicredi.
- `src/payments/pix-contract.js`: contrato público e geração da reserva, compartilhados sem duplicar as telas de checkout.
- [Dicionário do banco](banco/sicredi.txt).

Os testes usam banco descartável e banco simulado; mTLS foi conferido contra um servidor HTTPS local com certificado de teste. Nenhuma cobrança, devolução, autenticação bancária real ou alteração do webhook da sua conta foi executada.


## Retirada das configurações do provedor anterior

As variáveis `ASAAS_*` foram removidas dos arquivos `.env`, dos modelos, do Compose e da geração de configurações pelo setup. Configurações privadas anteriores foram preservadas somente em `.secrets/legacy/asaas-api.env` e `.secrets/legacy/asaas-docker.env`, ignoradas pelo Git/Docker e não carregadas pela aplicação. Isso conserva os segredos usados em documentos históricos criptografados, sem manter o gateway ativo. O formulário de parceiros não solicita mais wallets Asaas. Os adaptadores antigos permanecem isolados para regressão de dados históricos; não são importados pelo servidor.
