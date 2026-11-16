# Testes Pix Sicredi separados na VPS

## Comece aqui: credenciais e certificados já colocados

Depois de atualizar os arquivos do projeto na VPS, execute no Ubuntu:

```bash
cd /var/www/esporte_app/APP_ESPORTE
sudo docker compose build api
curl -fsS https://api-esporte.testes-techcode.shop/health
curl -fsS https://api-esporte.testes-techcode.shop/ready
sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs certificado
sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs diagnostico
```

`health`/`ready` verificam o acesso público à aplicação e ao banco de dados; não testam o banco Sicredi. O comando `certificado` verifica os arquivos no container. `diagnostico` faz mTLS/OAuth com o Sicredi em cinco escopos (`cob.read`, `cob.write`, `pix.read`, `webhook.read`, `webhook.write`) e consulta o webhook. Ele solicita tokens inclusive para os escopos de escrita, mas **não realiza nenhuma escrita financeira nem altera o cadastro do webhook**.

O build atualiza a imagem para os testes, sem substituir o container em execução. O container temporário lê as credenciais atuais do `.env` da raiz, pelo Compose. Isso não confirma que a API já em execução recebeu as mesmas variáveis; se o `.env` foi alterado depois que ela iniciou, a aplicação precisa ser recriada pelo operador no momento de ativar a integração. Não troque `PAYMENT_MODE` somente para rodar estes testes.

Como ler o relatório:

| Resultado | Significado |
| --- | --- |
| `step: certificate`, `ok: true` | Arquivos legíveis, validade e correspondência certificado/chave passaram. |
| `step: oauth:cob.write`, `ok: true` | Sicredi retornou token ao solicitar esse escopo; criar a cobrança ainda precisa de teste separado. |
| `readyForPaymentTest: true` | Autenticações solicitadas para cobrança e consulta Pix passaram. Não significa pagamento realizado. |
| `webhookConfigured: true` | O endereço cadastrado coincide com base/token deste projeto. Não comprova entrega de eventos. |
| `WEBHOOK_NOT_REGISTERED` | A chave não tem webhook cadastrado. O diagnóstico não registra automaticamente. |
| `WEBHOOK_DIFFERENT_URL` | Existe outro endereço. Não substitua antes de conferir a qual sistema pertence. |
| `WEBHOOK_NOT_COMPARED` | Não foi possível comparar: falta cadastro ou base/token esperados. |
| `ok: false` no resumo | Pelo menos uma etapa falhou; confira seu `step`, `code` e `message`. Saída do processo: 1. |

O relatório não inclui senhas, tokens, chave Pix, URL privada do webhook ou respostas bancárias brutas. Pode enviar a saída do comando **diagnostico** para investigar uma falha; não envie `.env`, certificado/chave privada nem o copia e cola de uma cobrança paga. Mesmo com `ok: true`, os campos `paymentTested` e `webhookDeliveryTested` permanecem `false`: pagamento e entrega real precisam das etapas seguintes.

Para guardar o diagnóstico em arquivo (Bash):

```bash
mkdir -p .artifacts
set -o pipefail
sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs diagnostico 2>&1 | tee .artifacts/sicredi-diagnostico.log
```

Os comandos abaixo detalham criação opcional, consulta, pagamento manual e conferência. A cobrança de teste é isolada das vendas e não gera ingresso ou pedido.

O runner usa o cliente Pix real do projeto com mTLS/OAuth, sem iniciar a API, conectar ao PostgreSQL, emitir ingresso/pedido ou alterar saldos. O padrão confere certificado, autenticação de leitura e cadastro do webhook. Criação e remoção de cobrança são comandos separados. O agente executou somente testes com mocks; as chamadas reais abaixo são executadas por você.

## Credenciais e imagem

Na VPS, edite o `.env` **da raiz**:

```bash
cd /var/www/esporte_app/APP_ESPORTE
nano .env
```

Use os campos que já existem:

```dotenv
# Os testes funcionam mesmo com o provedor desabilitado nas vendas.
# Preserve o modo atual se a API já estiver recebendo pagamentos.
PAYMENT_MODE=disabled
SICREDI_PIX_ENV=production
SICREDI_PIX_API_URL=https://api-pix.sicredi.com.br/api/v2
SICREDI_PIX_AUTH_URL=https://api-pix.sicredi.com.br/oauth/token
SICREDI_PIX_CLIENT_ID=SEU_CLIENT_ID
SICREDI_PIX_CLIENT_SECRET=SEU_CLIENT_SECRET
SICREDI_PIX_RECEIVING_KEY=SUA_CHAVE_PIX
SICREDI_PIX_CERT_PASSPHRASE=
SICREDI_CERTS_DIRECTORY=/etc/nacional/certificados
SICREDI_PIX_TIMEOUT_MS=10000
SICREDI_PIX_WEBHOOK_URL=https://api-esporte.testes-techcode.shop/v1/payments/webhooks/sicredi
# Preserve o SICREDI_PIX_WEBHOOK_TOKEN privado já gerado.
```

Para homologação, use `SICREDI_PIX_ENV=sandbox` e **as duas URLs/credenciais fornecidas pelo Sicredi**. Trocar apenas a palavra production por sandbox não simula uma conta: o runner rejeita sandbox apontado ao host de produção. O contrato está descrito na [documentação oficial Sicredi](https://developers.sicredi.com.br/public/docs/getting-started-pix).

Os arquivos na pasta privada continuam `sicredi-multipag.cer`, `sicredi-multipag.key` e `sicredi-multipag-chain.cer`. O Compose monta `/etc/nacional/certificados` em `/run/sicredi` somente para leitura. Confira `API_UID`/`API_GID` e permissões do usuário `server`. Certificado e credenciais precisam estar habilitados para **API Pix** na cooperativa; o nome dos arquivos não comprova essa habilitação.

Depois de enviar os novos arquivos ao GitHub e atualizar o checkout da VPS:

```bash
sudo docker compose build api
```

Os comandos abaixo criam um container temporário com a imagem da API, substituindo seu comando de inicialização pelo teste. `--no-deps` evita iniciar dependências, `run` não publica as portas do serviço, e `--rm` remove o container ao terminar. O servidor em execução permanece como estava. O teste lê o `.env` atual do Compose, sem precisar recriar a API para carregar as novas credenciais.

## Certificado, OAuth e leitura do webhook

Somente certificado/chave/cadeia/validade, sem chamada ao banco:

```bash
sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs certificado
```

Teste padrão: certificado, OAuth `cob.read`, `pix.read`, `webhook.read` e consulta do webhook:

```bash
sudo docker compose run --rm --no-deps -T api npm run test:sicredi
```

Um escopo específico, sem criar cobrança mesmo com `cob.write`:

```bash
sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs auth --scope cob.write
```

Somente consulta de webhook:

```bash
sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs webhook
```

`webhookRegistered=false` indica ausência de cadastro; `matchesConfigured=false` indica outro endereço. O teste não cadastra/substitui nada e não imprime a URL privada ou o token. Conexão bem-sucedida comprova mTLS/OAuth/leitura, mas não comprova entrega de webhook ou permissão de escrita.

## Cobrança e pagamento manual

**Em produção, esta etapa cria uma cobrança real.** Quem pagar o copia e cola enviará dinheiro à conta recebedora. O teste não paga automaticamente, não faz devolução/transferência e não emite ingresso. Confira qualquer pagamento no extrato.

Gere e guarde uma referência de teste. Use o mesmo terminal nas próximas linhas:

```bash
TXID=$(sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs referencia)
printf '%s\n' "$TXID"
```

O prefixo `TST` separa os testes das vendas. Os comandos de cobrança só aceitam `TST` + 32 caracteres hexadecimais. Referências comuns de ingressos/pedidos são recusadas.

Exemplo de R$ 1,00 com expiração em 5 minutos; o valor é escolhido por você:

```bash
sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs criar --txid "$TXID" --valor 1,00 --expiracao 300
```

O retorno inclui TXID, situação, valor e `pixCopiaECola` quando fornecido pelo banco. Use esse payload no aplicativo pagador para pagar manualmente. Guarde a saída privadamente: o copia e cola contém informações da cobrança.

Antes de criar, o runner consulta o mesmo TXID. Se existir com os dados esperados, reutiliza; se valor/chave divergirem, interrompe. Após timeout, consulte **o mesmo TXID**. Não execute `referencia` de novo para resolver uma chamada ambígua.

## Consulta e acompanhamento

```bash
sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs consultar --txid "$TXID" --valor 1,00
```

Até 12 consultas com intervalo de 5 segundos:

```bash
sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs acompanhar --txid "$TXID" --valor 1,00 --tentativas 12 --intervalo 5
```

`paymentConfirmed=true` exige COB `CONCLUIDA`, chave/valor corretos, recebimento único e consulta adicional a `/pix/{endToEndId}` confirmando TXID, E2E, valor e horário. Devoluções bancárias aparecem em `refundedCents`/`refundPending`. Isso é somente relatório: não credita o sistema.

Saídas: `0` = operação concluída; `1` = erro de configuração/conexão/contrato; `2` = acompanhamento terminou sem confirmar pagamento. Limite de tentativas não simula sucesso. Em outro terminal, atribua `TXID='referencia-real-que-voce-guardou'` com o valor verdadeiro gerado anteriormente.

## Remover somente cobrança não paga

```bash
sudo docker compose run --rm --no-deps -T api node scripts/sicredi-tests.mjs cancelar --txid "$TXID"
```

O teste consulta antes/depois e recusa remoção de cobrança concluída ou com recebimento. Não devolve Pix pago. Pagamentos concorrentes/tardios ainda exigem conferência no banco, mesmo após solicitar remoção.

## PC e próximos passos

No PC, configure caminhos locais do certificado em `apps/api/.env`:

```powershell
npm run test:sicredi -- --help
npm run test:sicredi -- certificado
npm run test:sicredi
```

Os testes unitários comuns usam mocks e não chamam sua conta. O runner não imprime access token, Client Secret, chave privada, passphrase ou resposta bruta do banco.

Depois de validar, habilite `PAYMENT_MODE=sicredi` quando quiser ativar o gateway nas vendas e aplique as variáveis ao servidor. Para validar a emissão, reserve pelo app e pague **a cobrança daquela reserva**: o checkout mantém as próprias transações, reservas e conciliação. A COB `TST` deste runner fica separada e não será vinculada a ingresso/pedido existente.

O teste de webhook aqui é só leitura do cadastro. HTTPS/mTLS de entrada e registro de webhook seguem [Pix Sicredi](sicredi-pix.md); o comando existente preserva um cadastro pertencente a outro projeto.
