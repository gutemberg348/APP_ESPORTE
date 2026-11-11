# VPS Ubuntu: três containers e Nginx existente

A implantação escolhida usa **PostgreSQL + API + frontend em três containers separados**. O Nginx já instalado no Ubuntu termina o HTTPS e encaminha aos dois serviços web. O PM2 e os outros projetos da VPS não são alterados por estes arquivos.

| Serviço | Container Compose | Acesso no host |
| --- | --- | --- |
| Banco PostgreSQL 17 | `postgres` | `127.0.0.1:55432` → porta interna 5432 |
| Backend Node/Express | `api` | `127.0.0.1:3333` |
| Frontend web estático | `web` | `127.0.0.1:8080` → porta interna 80 |

Os nomes normalmente recebem o prefixo `nacional`, definido no Compose. O volume `postgres_data` existente é preservado. A API fala com `postgres:5432` pela rede privada; a conexão externa do frontend usa a URL HTTPS pública da API. O container do frontend usa Nginx apenas para servir os arquivos estáticos exportados pelo Expo, sem servidor de desenvolvimento e sem PM2.

Domínios autorizados:

- Painel/app web: `https://esporte.testes-techcode.shop` (`/admin`, `/app`, `/portaria` e `/reset-password`).
- API: `https://api-esporte.testes-techcode.shop` (as rotas de aplicação usam `/v1`).

## Preparação

Execute os comandos na raiz do repositório, na VPS, como usuário `server`.

```bash
docker --version
docker compose version
```

Se Docker/Compose ainda não estiverem instalados, siga a [instalação oficial para Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Não há necessidade de trocar o Node usado pelo outro processo do PM2: as imagens deste projeto já definem a versão do Node.

```bash
node scripts/setup.mjs
```

Esse comando prepara os ambientes e gera somente segredos que estão vazios. Não inicia containers, não aplica migrations nem altera contas no banco. Na raiz, ele preenche `API_UID`/`API_GID` com o usuário que executou o setup; execute como `server`, o dono dos certificados. Confira que esses números coincidem com `id -u server` e `id -g server`, principalmente se copiou um `.env` gerado em outro computador. A API usa esse UID/GID no container para ler a pasta com modo `700`.

**Nesta implantação, configure o `.env` da raiz.** `apps/api/.env` continua sendo o ambiente para Node executado fora do Docker. O Compose passa os dados privados diretamente ao backend, sem copiar o `.env` para a imagem.

Confira/preencha no `.env` da raiz:

```dotenv
API_PORT=3333
WEB_PORT=8080
DOCKER_NETWORK_SUBNET=172.30.77.0/24
DOCKER_NETWORK_GATEWAY=172.30.77.1
CORS_ORIGINS=https://esporte.testes-techcode.shop
EXPO_PUBLIC_API_URL=https://api-esporte.testes-techcode.shop/v1
EXPO_PUBLIC_CLUB=esporte
PASSWORD_RESET_PUBLIC_URL=https://esporte.testes-techcode.shop/reset-password
SICREDI_CERTS_DIRECTORY=/etc/nacional/certificados
SICREDI_PIX_WEBHOOK_URL=https://api-esporte.testes-techcode.shop/v1/payments/webhooks/sicredi
```

Mantenha os segredos existentes se já houver dados. Se copiou o `.env` antigo de desenvolvimento com senha padrão, configure uma senha de banco própria **antes da primeira criação do banco na VPS**. Para um banco existente, trocar a variável do Compose não altera a senha armazenada pelo PostgreSQL.

Credenciais Pix ficam em `SICREDI_PIX_CLIENT_ID`, `SICREDI_PIX_CLIENT_SECRET`, `SICREDI_PIX_RECEIVING_KEY` e, quando necessária, `SICREDI_PIX_CERT_PASSPHRASE`. Mantenha `PAYMENT_MODE=disabled` enquanto esses dados não estiverem completos; para operar cobranças reais, configure `PAYMENT_MODE=sicredi`.

Certificados já enviados:

```text
/etc/nacional/certificados/sicredi-multipag.cer
/etc/nacional/certificados/sicredi-multipag.key
/etc/nacional/certificados/sicredi-multipag-chain.cer
```

Essa pasta é montada somente na API, em `/run/sicredi`, para leitura. Não é montada no frontend. A imagem não contém certificados, chaves ou arquivos de ambiente. O frontend recebe somente os argumentos públicos `EXPO_PUBLIC_*` durante a compilação.

A rede privada tem gateway explícito para a API confiar somente nesse IP de proxy, sem aceitar headers de IP enviados diretamente por outros clientes/containers. Se a faixa de rede já estiver em uso, altere subnet e gateway juntos. Não remova volumes para resolver conflito de rede.

## Subir os três serviços

Confira se as portas 3333 e 8080 estão livres ou ajuste `API_PORT`/`WEB_PORT` e os destinos no arquivo do Nginx. Se o usuário `server` ainda não tiver acesso ao Docker, use `sudo` nos comandos Docker abaixo.

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

A ordem é banco saudável → API saudável → frontend. A API aplica `prisma migrate deploy` antes de iniciar o servidor. Não usa `migrate dev`, reset ou seed demonstrativo. Os workers Pix/email ficam dentro do backend e não exigem um quarto container.

Para cadastrar a conta administrativa inicial, confira `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` no `.env` da raiz e execute explicitamente:

```bash
docker compose exec api node prisma/bootstrap.js
```

O bootstrap preserva uma conta administrativa existente e não cria jogos/produtos de teste. Uma nova instalação precisa desse passo; iniciar a API sozinho não cria o administrador.

## DNS e Nginx da VPS

Na zona `testes-techcode.shop`, configure os registros A para a VPS informada:

| Nome | IPv4 |
| --- | --- |
| `esporte` | `170.79.179.234` |
| `api-esporte` | `170.79.179.234` |

Na consulta feita durante esta preparação, ambos retornaram `ENOTFOUND`; a propagação precisa ser conferida antes de emitir certificado.

```bash
getent ahostsv4 esporte.testes-techcode.shop
getent ahostsv4 api-esporte.testes-techcode.shop
```

O arquivo `deploy/nginx/nacional.conf` contém os dois virtual hosts HTTP iniciais. Ele encaminha API para `127.0.0.1:3333` e frontend para `127.0.0.1:8080`. O Nginx do container do frontend trata as rotas SPA, para atualizar `/admin` e `/portaria` sem erro 404.

Se esses domínios já tiverem configurações no Nginx existente, ajuste os blocos correspondentes em vez de criar nomes duplicados. Para a instalação inicial de um arquivo dedicado:

```bash
sudo install -m 644 deploy/nginx/nacional.conf /etc/nginx/sites-available/nacional
sudo ln -s /etc/nginx/sites-available/nacional /etc/nginx/sites-enabled/nacional
sudo nginx -t
sudo systemctl reload nginx
```

O teste deve passar antes do reload. Não substitua `nginx.conf` nem apague os sites do outro projeto. O template não contém certificados públicos inexistentes; assim o Nginx pode responder em HTTP antes de emitir HTTPS.

Com DNS e acesso público às portas 80/443 corretos, e Certbot/plugin Nginx disponíveis, configure HTTPS para os dois domínios:

```bash
sudo certbot --nginx --redirect -d esporte.testes-techcode.shop -d api-esporte.testes-techcode.shop
sudo nginx -t
```

Use as [instruções oficiais Certbot/Nginx](https://eff-certbot.readthedocs.io/en/stable/using.html#nginx) se o cliente ainda não estiver instalado. Não copie novamente o template HTTP sobre a configuração após o Certbot configurar TLS; preserve os blocos HTTPS existentes nas atualizações.

O certificado público dos domínios e o certificado de cliente Sicredi são materiais diferentes. A imagem de frontend não recebe nenhum deles; o HTTPS público fica no Nginx da VPS. Validação mTLS de entrada exigida pela cooperativa para o webhook deve ser configurada com a cadeia apropriada antes do cadastro bancário; não reutilize automaticamente o certificado de cliente da API para isso.

## Conferência e operação

```bash
curl -fsS http://127.0.0.1:3333/health
curl -fsS http://127.0.0.1:3333/ready
curl -I http://127.0.0.1:8080
curl -fsS https://api-esporte.testes-techcode.shop/ready
curl -I https://esporte.testes-techcode.shop/admin
docker compose exec api node scripts/sicredi-pix.mjs diagnostico
```

O diagnóstico de certificado não cria cobrança nem autentica no banco. O teste de token e o cadastro do webhook são passos explícitos posteriores, descritos em [Pix Sicredi](sicredi-pix.md). O comando de webhook preserva um cadastro pertencente ao outro projeto, se a mesma chave Pix já o utiliza.

Logs somente dos nossos serviços:

```bash
docker compose logs --tail=100 api
docker compose logs --tail=100 web
docker compose logs --tail=100 postgres
```

A API e o acesso HTTP do Nginx mascaram o token do webhook nos caminhos registrados. Logs de erro do proxy podem registrar URIs em falhas; trate os logs como privados e revise sua política antes de publicar o webhook.

Para atualizar somente nosso projeto, depois de atualizar os arquivos:

```bash
docker compose up -d --build
```

Isso não executa ações no PM2 nem altera os outros sites. Alterar `EXPO_PUBLIC_API_URL` ou a identidade visual exige reconstruir o frontend; não basta reiniciar o container, pois esses valores entram no bundle. Não use remoção de volumes para atualizar: o banco permanece no volume `postgres_data`.

## Verificação desta preparação

O Compose foi validado sem iniciar containers. O teste de proxy confere IP real e limite independente por cliente, aceitando somente o gateway configurado; conexões de outras origens não conseguem burlar o limite por `X-Forwarded-For`. O setup foi testado em diretório temporário, incluindo geração e preservação de senhas/segredos e UID/GID. A configuração Nginx precisa de `nginx -t` na VPS e o build das imagens precisa de validação no Docker do servidor. Nenhum container, processo PM2, Nginx ou serviço da VPS foi iniciado/reiniciado pelo agente.
