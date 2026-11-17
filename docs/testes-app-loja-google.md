# Preparar o app para testes na VPS

Execute na pasta `/var/www/esporte_app/APP_ESPORTE`, depois de enviar estas alterações ao Git e atualizar a VPS. Nenhum comando abaixo administra o projeto Escala, PM2 ou Nginx.

## Atualização e dados de teste

```bash
git pull
sudo docker compose up -d --build api web
sudo docker compose ps
sudo docker compose exec -T api node prisma/seed-app-demo.js --confirm-test-data --enable-shop
```

O entrypoint aplica as migrations de estrutura. Os exemplos ficam em um **seed explícito**, separado das migrations, para não publicar jogos fictícios em toda atualização de produção.

O seed cria:

- Seis jogos de teste, em 3, 6, 9, 12, 15 e 18 dias a partir da primeira execução, às 19h de Patos. Arquibancada R$ 1,00 / 100 lugares e cadeiras R$ 2,00 / 30 lugares. Publicados com venda aberta até uma hora antes do jogo.
- Cinco camisas de teste, com imagens conceituais já servidas pela API, preços de R$ 1,00 a R$ 5,00, tamanhos P/M/G/GG e dez unidades por tamanho. Editáveis em Loja → Produtos e Estoque.
- Movimentos de estoque e registro de auditoria. Não cria contas, pagamentos ou ingressos emitidos.

`--enable-shop` habilita a loja interna. Omita essa opção se quiser preservar uma loja fechada ou externa. Ela mantém telefone, endereço, regras de frete e configurações financeiras existentes; revise o endereço de retirada no painel. Em uma loja nova, cria retirada de teste. Nenhuma tarifa de transportadora é inventada.

Repetir o seed não duplica produtos/jogos, repõe estoque, reativa produtos arquivados ou altera datas/preços editados. Para reagendar jogos antigos, edite as partidas no painel; o comando não move partidas com vendas existentes. O cadastro inteiro é transacional e bloqueia execuções simultâneas.

**Em Sicredi de produção, mesmo os valores de teste geram cobranças e pagamentos reais.** Os registros ficam identificados como TESTE. Depois de validar, encerre as vendas desses jogos e arquive os produtos pelo painel; preserve pedidos e histórico.

Os jogos são criados em `Match`/`Sector`, catálogo atualmente consultado pela compra no app. Não são duplicados em Partidas V1: esse módulo tem modelos próprios e a integração do checkout V1 com o app/Pix ainda precisa ser feita. Este seed não é teste da portaria V1.

## Google: configurar uma vez

1. Abra [Google Cloud / Google Auth Platform](https://console.cloud.google.com/auth/overview) e selecione ou crie o projeto do Sócio Esporte.
2. Configure a marca e o consentimento: nome do app, e-mail de suporte, contato do desenvolvedor e domínio. Para testes, autorize os e-mails que usarão o login. Antes de liberar para todos, publique a configuração e cumpra as solicitações do Google.
3. Em Clientes, crie um cliente OAuth do tipo **Aplicativo da Web**. O navegador abre o Google; quem recebe e troca o código é a API.
4. Cadastre exatamente o URI de redirecionamento:

```text
https://api-esporte.testes-techcode.shop/v1/auth/social/google/callback
```

5. No `.env` da VPS, preencha:

```dotenv
SOCIAL_PUBLIC_API_URL=https://api-esporte.testes-techcode.shop
GOOGLE_CLIENT_ID=COLE_O_CLIENT_ID
GOOGLE_CLIENT_SECRET=COLE_O_CLIENT_SECRET
```

Não coloque chaves em `EXPO_PUBLIC_*`, no APK ou no Git. Não é a senha da conta Google. Nesta integração por navegador/API, não se cadastra `nacional://` como callback no Google: a API retorna ao app após validar a identidade. Detalhes e proteções: [login social](login-social-e-acesso.md) e [documentação oficial Google](https://developers.google.com/identity/openid-connect/openid-connect).

6. Recrie somente a API Esporte para carregar o `.env` atualizado e confira:

```bash
sudo docker compose up -d --no-deps --force-recreate api
sudo docker compose exec -T api node scripts/google-login-check.mjs
```

O diagnóstico mostra presença/formato dos campos, callback e se a API pública anuncia Google habilitado, sem mostrar as credenciais. `ok: true` não prova que o consentimento/redirect foi autorizado: conclua um login no aparelho.

Erros comuns: `redirect_uri_mismatch` significa URI diferente no Google; `access_denied` pode indicar usuário fora da lista de teste ou cancelamento. E-mail já cadastrado com senha deve entrar com senha/recuperação: a vinculação automática por e-mail não é permitida. Funcionários e administradores usam login com senha.

## App, loja e pontos

No computador, gere o APK atualizado quando quiser:

```powershell
npm run local:app
```

Não houve geração de APK ou reinício de serviços pelo agente.

Valide no aparelho: Google → voltar ao app; loja na página inicial → tamanho/quantidade → carrinho → retirada ou entrega → CEP → frete → confirmar → Pix → Meus pedidos. CEP completo consulta automaticamente o backend/ViaCEP, com alternativa de digitação manual. CPF/CNPJ é solicitado com máscara quando necessário para gerar Pix; telefone e CEP têm máscaras e os valores são exibidos em reais.

Consulta de CEP só encontra o endereço; frete depende das faixas configuradas no painel ou de Melhor Envio habilitado. Referência: [ViaCEP](https://viacep.com.br/).

Fan Zone → Missões usa o check-in real, com limite diário e pontuação configurada no admin. Mostra progresso para o prêmio disponível de menor custo, desconta os pontos no resgate e registra o extrato. Não promete pontos por quiz/palpite nem descontos automáticos na loja. Sem prêmios publicados, informa isso e preserva o saldo. O admin precisa cadastrar os prêmios e o estoque que realmente poderá entregar.

O último diagnóstico Sicredi enviado pelo operador não tinha webhook registrado. Credenciais válidas não comprovam notificação de pagamento: conclua a configuração e teste de entrega descritos em [testes Sicredi](testes-sicredi-vps.md).
