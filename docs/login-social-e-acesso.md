# Login, cadastro e acesso HTTPS

## Corrigir o 404 do Nginx na VPS existente

Em 15/11/2026, o domínio HTTPS da API respondeu HTML 404. O dump enviado confirmou os domínios Esporte no site `default`, usando o certificado `esporte-app`, mas sem `proxy_pass`. O site `escala-cicc.conf` atende outro projeto na porta 3000 e deve ser preservado.

Depois de enviar estas alterações ao servidor, confira o plano:

```bash
cd /var/www/esporte_app/APP_ESPORTE
sudo python3 scripts/configure-esporte-nginx.py
```

A execução acima é somente simulação. Para aplicar:

```bash
sudo python3 scripts/configure-esporte-nginx.py --apply
curl -fsS https://api-esporte.testes-techcode.shop/health
curl -fsS https://api-esporte.testes-techcode.shop/ready
```

O script mantém o certificado existente, cria `/etc/nginx/conf.d/esporte-app.conf` e remove somente os blocos `server` que atendem exclusivamente aos dois domínios Esporte dos arquivos ativos. Outros trechos do `default` continuam presentes. Recusa blocos compartilhados com outro domínio e arquivos de destino desconhecidos; não altera PM2, Docker, portas, firewall ou certificados. API aponta para `127.0.0.1:3333`; painel, para `127.0.0.1:8080`.

Antes de escrever, verifica os containers pelas portas locais e salva os arquivos envolvidos em `/var/backups/esporte-nginx/<data>/`, com `manifest.json`. Depois executa `nginx -t`, recarrega o Nginx e verifica HTTPS, identidade da API, envio JSON sem credenciais e frontend. Em falha, restaura os arquivos anteriores. Não reinstale o template HTTP antigo sobre o HTTPS após executar esse reparo. Não é necessário executar Certbot novamente; o certificado e a renovação existente são preservados.

O script não foi executado remotamente pelo agente. A correção da VPS depende do operador executar os comandos. Se o banco não responder em `/ready`, confira separadamente `sudo docker compose ps` e os logs da API.

## Login Google e Apple no aplicativo instalado

Os botões usam o navegador seguro do aparelho, retornam a `nacional://auth/social` e recebem a mesma sessão JWT/refresh do login tradicional. Funcionam pelo fluxo web dos provedores, inclusive Apple no Android. O login por e-mail continua disponível; os botões sociais não são exibidos no painel administrativo, na portaria exclusiva ou na versão web nesta etapa.

Preencha o `.env` **da raiz na VPS** (o Compose repassa somente à API). Para uma API executada diretamente por Node, use `apps/api/.env`:

```dotenv
SOCIAL_PUBLIC_API_URL=https://api-esporte.testes-techcode.shop
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
APPLE_SERVICE_ID=
APPLE_CLIENT_SECRET=
```

Nenhuma credencial privada deve usar prefixo `EXPO_PUBLIC_`, ir para o app ou ser enviada por chat. Os campos estão nos dois `.env.example`. Provedor sem configuração retorna uma mensagem de indisponibilidade, sem simular login. `SOCIAL_PUBLIC_API_URL` é a origem pública HTTPS, sem `/v1`.

### Google

No Google Cloud, configure o consentimento e crie um cliente OAuth do tipo **Aplicativo da Web**, pois quem troca o código é a API. Cadastre exatamente este URI de redirecionamento:

```text
https://api-esporte.testes-techcode.shop/v1/auth/social/google/callback
```

Preencha o Client ID e Client Secret no servidor. Durante o modo de testes do consentimento, inclua os e-mails autorizados como usuários de teste. Esta implementação não usa o SDK nativo Google Sign-In nem exige segredo no APK. Referência: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect).

### Apple

Configure Sign in with Apple em sua conta Apple Developer: App ID principal habilitado, Services ID associado, domínio e Return URL registrados. O campo `APPLE_SERVICE_ID` é esse **Services ID**, não o bundle ID do Android. Return URL:

```text
https://api-esporte.testes-techcode.shop/v1/auth/social/apple/callback
```

`APPLE_CLIENT_SECRET` é o JWT de cliente assinado com sua chave Apple (`.p8`), usando ES256, Key ID no `kid`, Team ID no `iss`, Services ID no `sub` e `https://appleid.apple.com` no `aud`. Ele tem validade limitada (máximo de seis meses); gere e substitua antes da expiração. A renovação desse segredo ainda é manual. O callback aceita o `form_post` da Apple e confere a identidade assinada. O e-mail de retransmissão privado Apple é aceito quando verificado. Referência: [autenticação com Apple](https://developer.apple.com/documentation/signinwithapple/authenticating-users-with-sign-in-with-apple).

### Atualizar a API e gerar o aplicativo

Há uma migration aditiva, `20261116010000_social_auth`, para `SocialIdentity` e `SocialAuthAttempt`. Ela não altera nem exclui usuários existentes. O entrypoint da imagem aplica migrations antes de iniciar a API. Na VPS, após atualizar os arquivos e o `.env`:

```bash
sudo docker compose up -d --build api web
sudo docker compose ps
```

Esse comando pode interromper brevemente a API Esporte enquanto recria seu container; não administra o projeto Escala ou PM2. Nunca use `down -v` para atualizar.

No computador, as alterações do teclado e navegador de autenticação incluem bibliotecas nativas compatíveis com o SDK 58, portanto exigem **novo APK**:

```powershell
npm install
npm run local:app
```

Instale o novo APK sobre a versão atual, usando a mesma chave guardada em `.secrets/android`. O APK que já estava em `dist/android` antes destas alterações continua sendo a versão anterior até você gerar novamente. O agente não iniciou prebuild nem Gradle nesta tarefa.

## Proteções e limites

- OAuth com código de autorização; Google usa PKCE no provedor. Ambos validam assinatura RS256 via JWKS oficial, issuer, audience, expiração, nonce e e-mail verificado.
- `state` aleatório, vinculado ao provedor, consumido uma vez no banco e com prazo de dez minutos. Token do provedor não é persistido nem entregue ao app.
- Retorno ao app leva um ticket de uso único com 60 segundos de validade, protegido por uma prova SHA-256 mantida em memória pelo app. Um link interceptado sozinho não autentica.
- Identidade usa o par provedor/subject. Um e-mail já cadastrado **não é vinculado automaticamente**; deve entrar com senha ou recuperação. Vincular Google/Apple a uma conta existente pelo perfil fica para outra etapa.
- Novas contas sociais são somente torcedores `USER`. Contas inativas ou promovidas a funcionário/admin precisam do login por e-mail. Regras de ingressos, compras e associação não mudam.
- O cadastro continua com uma senha e botão de visibilidade; rolagem acompanha o campo focado, inclusive senha, com rótulos e validação por campo. Biblioteca: [KeyboardAwareScrollView](https://kirillzyusko.github.io/react-native-keyboard-controller/docs/api/components/keyboard-aware-scroll-view).

Os testes usam identidades assinadas fictícias e banco descartável, sem contas reais nos provedores. Login real e comportamento do teclado no aparelho precisam ser conferidos no APK novo, com a API corrigida e as credenciais configuradas.


Passo a passo do Google Cloud e diagnóstico sem expor chaves: [testes do app, loja e Google](testes-app-loja-google.md).
