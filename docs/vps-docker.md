# VPS Ubuntu: três containers e Nginx existente

Se os domínios Esporte já têm o certificado `esporte-app`, mas a API retorna HTML 404 porque o Certbot os colocou no site `default`, use o [reparo isolado dos hosts Esporte](login-social-e-acesso.md#corrigir-o-404-do-nginx-na-vps-existente). Ele preserva os hosts Escala e faz backup antes de alterar blocos exclusivos do Esporte.

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

Se o setup apresentar `EACCES` ao criar o `.env`, corrija o dono **somente da pasta deste projeto** e execute novamente como `server`, sem `sudo node`:

```bash
sudo chown -R server:server /var/www/esporte_app/APP_ESPORTE
cd /var/www/esporte_app/APP_ESPORTE
node scripts/setup.mjs
```

```bash
docker --version
docker compose version
```

Se Docker/Compose ainda não estiverem instalados, siga a [instalação oficial para Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Não há necessidade de trocar o Node usado pelo outro processo do PM2: as imagens deste projeto já definem a versão do Node.

Para uma VPS sem Docker instalado, adicione o repositório oficial e instale o Engine com o plugin Compose:

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker compose version
```

Use `sudo docker compose` nos próximos passos se o usuário não tiver acesso ao daemon. A instalação não exige trocar configurações do Nginx ou do PM2.

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

## Compatibilidade do processador e fotos da loja

Os binários Linux x64 pré-compilados do `sharp` exigem x86-64-v2. Uma VPS que não exponha essas instruções pode apresentar `Unsupported CPU` e `Wasm SIMD unsupported`, impedindo a inicialização da API mesmo com as migrations aplicadas.

A imagem da API compila o `sharp` 0.35.5 e o libvips 8.18.7 a partir do código-fonte, sem exigir x86-64-v2. O download do libvips é conferido por SHA-256; compiladores e headers ficam na etapa de build. As bibliotecas WebP de leitura e escrita ficam na imagem final. O teste `scripts/check-image-runtime.mjs --require-local-build` carrega explicitamente o módulo compilado e converte JPEG, PNG e WebP usando o fluxo real de upload nas etapas de build e runtime, sem banco ou credenciais. Também verifica orientação e remoção de EXIF. A compilação usa dois jobs para limitar o consumo de memória; o primeiro build pode demorar mais.

Com os arquivos atualizados na VPS, reconstrua somente a imagem da API e suba os serviços:

```bash
sudo docker compose build api
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs --no-color --tail=60 api
```

Não é necessário remover o volume do banco ou repetir o seed para corrigir essa incompatibilidade. Se o build falhar, corrija esse erro antes de recriar a API.

## Subir os três serviços

Confira se as portas 3333 e 8080 estão livres ou ajuste `API_PORT`/`WEB_PORT` e os destinos no arquivo do Nginx. Se o usuário `server` ainda não tiver acesso ao Docker, use `sudo` nos comandos Docker abaixo.

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
```

A ordem é banco saudável → API saudável → frontend. A API aplica `prisma migrate deploy` antes de iniciar o servidor. Não usa `migrate dev`, reset ou seed demonstrativo. Os workers Pix/email ficam dentro do backend e não exigem um quarto container.

Para provisionar a conta master da empresa (`OWNER`) em `/acesso/`, confira `ADMIN_EMAIL`, `ADMIN_NAME` e `ADMIN_PASSWORD` no `.env` da raiz e execute explicitamente:

```bash
docker compose exec api node prisma/bootstrap.js
```

O bootstrap cria o master ou converte o ADMIN ativo do e-mail configurado. Para preservar o acesso que o clube usa, escolha um e-mail exclusivo da empresa. O comando preserva a senha de um OWNER existente. Cadastre a equipe no painel.

## DNS e Nginx da VPS

Na zona `testes-techcode.shop`, configure os registros A para a VPS informada:

| Nome | IPv4 |
| --- | --- |
| `esporte` | `170.79.179.234` |
| `api-esporte` | `170.79.179.234` |

Na consulta feita em 13/11/2026, o resolvedor local do PC retornou `ENOTFOUND`, mas a verificação independente pelo DNS público do Google confirmou os dois registros A em `170.79.179.234`. Confira também a resolução na VPS antes de emitir certificado. Registros AAAA devem apontar para um IPv6 realmente configurado nessa VPS; um IPv6 incorreto pode direcionar a validação para outro servidor.

```bash
getent ahostsv4 esporte.testes-techcode.shop
getent ahostsv4 api-esporte.testes-techcode.shop
```

O arquivo `deploy/nginx/nacional.conf` contém os dois virtual hosts HTTP iniciais. Ele encaminha API para `127.0.0.1:3333` e frontend para `127.0.0.1:8080`. O Nginx do container do frontend trata as rotas SPA, para atualizar `/admin` e `/portaria` sem erro 404.

Como os três containers já foram iniciados, não é necessário reinstalar Docker nem recriar o volume. No Ubuntu da VPS, instale Nginx e Certbot com o plugin Nginx:

```bash
cd /var/www/esporte_app/APP_ESPORTE
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
sudo docker compose ps
curl -fsS http://127.0.0.1:3333/ready
curl -I http://127.0.0.1:8080
```

Esses acessos locais devem responder antes de configurar o proxy. As portas públicas 80/TCP e 443/TCP devem estar liberadas no firewall da VPS/provedor para Nginx e validação HTTP do Let's Encrypt. As portas 3333, 8080 e 55432 permanecem publicadas somente em loopback. Não é necessário ativar ou reinicializar o firewall existente.

Se usa UFW e ele está ativo, acrescente somente as regras web:

```bash
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Não execute `ufw enable`/reset para este deploy: preserve as regras do SSH na porta 22570 e dos outros projetos.

Se esses domínios já tiverem configurações no Nginx existente, ajuste os blocos correspondentes em vez de criar nomes duplicados. Para a instalação inicial de um arquivo dedicado:

```bash
sudo grep -R -n -E 'server_name.*(api-esporte|esporte)\.testes-techcode\.shop' /etc/nginx/sites-enabled /etc/nginx/conf.d
```

Se a busca já encontrar esses domínios em outro arquivo, use aquele site e não crie virtual hosts duplicados. Para um primeiro cadastro dedicado, os comandos abaixo preservam um arquivo já existente, inclusive se o Certbot já o tiver convertido para HTTPS:

```bash
if ! sudo test -e /etc/nginx/sites-available/nacional && ! sudo test -L /etc/nginx/sites-available/nacional; then
  sudo install -m 644 deploy/nginx/nacional.conf /etc/nginx/sites-available/nacional
fi
if ! sudo test -e /etc/nginx/sites-enabled/nacional && ! sudo test -L /etc/nginx/sites-enabled/nacional; then
  sudo ln -s /etc/nginx/sites-available/nacional /etc/nginx/sites-enabled/nacional
fi
sudo nginx -t && sudo systemctl reload nginx
```

Confira a seleção de cada host HTTP antes de emitir certificado:

```bash
curl -fsS --resolve api-esporte.testes-techcode.shop:80:127.0.0.1 http://api-esporte.testes-techcode.shop/ready
curl -I --resolve esporte.testes-techcode.shop:80:127.0.0.1 http://esporte.testes-techcode.shop/admin
```

O teste deve passar antes do reload. Não substitua `nginx.conf` nem apague os sites do outro projeto. O template não contém certificados públicos inexistentes; assim o Nginx pode responder em HTTP antes de emitir HTTPS.

Com DNS e acesso público às portas 80/443 corretos, e Certbot/plugin Nginx disponíveis, configure HTTPS para os dois domínios:

```bash
sudo certbot --nginx --redirect --cert-name esporte-app -d esporte.testes-techcode.shop -d api-esporte.testes-techcode.shop
sudo nginx -t && sudo systemctl reload nginx
```

O Certbot solicitará um e-mail de contato e a aceitação dos termos do Let's Encrypt. O comando solicita um certificado com os dois nomes e instala o redirecionamento HTTP → HTTPS nos hosts correspondentes. Os arquivos ficam em `/etc/letsencrypt/live/esporte-app/`, administrados pelo Certbot. Não copie chaves/certificados HTTPS para dentro das imagens Docker.

Ative a rotina de renovação do pacote Ubuntu e teste somente este certificado:

```bash
sudo systemctl enable --now certbot.timer
sudo certbot renew --cert-name esporte-app --dry-run
sudo systemctl list-timers --all certbot.timer
```

O timer faz as verificações periódicas e a configuração de renovação do plugin Nginx mantém a instalação do certificado. `--dry-run` testa a renovação no ambiente de testes do Let's Encrypt, sem substituir o certificado público pelo de testes. Se já usa outra instalação do Certbot (por exemplo, Snap) para os demais sites, mantenha a instalação e o agendador existentes e confira a renovação com esse mesmo cliente.

Use as [instruções oficiais Certbot/Nginx](https://eff-certbot.readthedocs.io/en/stable/using.html#nginx) se o cliente ainda não estiver instalado. Não copie novamente o template HTTP sobre a configuração após o Certbot configurar TLS; preserve os blocos HTTPS existentes nas atualizações.

Os valores públicos correspondentes no `.env` da raiz são:

```dotenv
CORS_ORIGINS=https://esporte.testes-techcode.shop
EXPO_PUBLIC_API_URL=https://api-esporte.testes-techcode.shop/v1
PASSWORD_RESET_PUBLIC_URL=https://esporte.testes-techcode.shop/reset-password
SICREDI_PIX_WEBHOOK_URL=https://api-esporte.testes-techcode.shop/v1/payments/webhooks/sicredi
```

Se alterar esses valores, aplique `sudo docker compose up -d --build`. A URL pública compilada no frontend e no APK só muda com um novo build. Esse comando aplica somente este projeto e mantém o volume do PostgreSQL.

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
