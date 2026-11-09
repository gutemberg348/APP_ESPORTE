# App de clubes • Esporte de Patos

Identidade inicial: **Esporte Clube de Patos**, em vermelho/vinho e com escudo transparente no cabeçalho. A apresentação fica centralizada em `packages/shared/brands.json`, com perfis `esporte` e `nacional`; o app seleciona por `EXPO_PUBLIC_CLUB`. [Configuração por clube e limites desta base](docs/identidade-clubes.md).

App React Native/Expo com TypeScript, API JavaScript com **Express 5**, Prisma 7 e PostgreSQL 17 em Docker. O padrão é **login e dados reais**, com administração de jogos, setores, planos, associações e ingressos.

O app usa **Expo SDK 58** (`expo ~58.0.22`), React Native 0.88.1 e React 19.3.0, com os módulos nativos alinhados ao Expo Go 58. Se um Metro iniciado antes da atualização ainda mostrar SDK 57, encerre esse terminal e rode `npm run dev:mobile:clear` na raiz; depois abra o novo QR pelo Expo Go. O comando inicia o app somente quando você o executar.

Autenticação com JWT de 15 minutos, refresh rotativo de sessão, logout com revogação, saída de todos os dispositivos e troca de senha. O app renova os tokens e oferece **Perfil → Segurança**. Após aplicar a nova migration, sessões antigas exigem login novamente. [Contrato e configuração de autenticação](docs/authentication.md).

O visual atual usa a referência vermelha do Esporte, com escudo PNG de fundo externo transparente, DM Sans/Manrope, temas, cinco abas, carteirinha e Show da Torcida. A base anterior [naca-digital](naca-digital/README.md) e `base.js` foram preservados, e o perfil visual Nacional segue disponível por configuração. A adaptação visual ainda precisa de revisão em aparelho.

## Preparar e executar

Use Node 22.13+ da linha 22 ou 24.3+, npm e Docker Desktop para PostgreSQL. Na raiz, execute por sua conta:

```powershell
npm install
npm run setup
npm run db:up
npm run db:prepare
```

`setup` mantém os `.env` existentes e gera uma senha administrativa local quando necessário. `db:prepare` gera Prisma, aplica migrations e cria o administrador, a instituição e o plano inicial. **Não cria contas de torcedores nem jogos fictícios.** Não inicia app/API/Docker.

Primeiro login administrativo: `ADMIN_EMAIL` e `ADMIN_PASSWORD` de [apps/api/.env](apps/api/.env). O e-mail local inicial é `admin@nacional.local`; a senha local foi gerada aleatoriamente. Torcedores criam suas contas pela tela **Quero me cadastrar**. O cadastro público nunca cria um administrador.

Em terminais separados:

```powershell
npm run dev:api
```

```powershell
npm run dev:mobile
```

Ou use `npm run web` para o app/painel no navegador. A API usa `http://localhost:3333`, e o PostgreSQL usa `localhost:55432`. `GET /health` verifica a API; `GET /ready` também verifica o banco.

O login ADMIN abre o painel na versão web. Se o Expo já estiver usando 8081, a versão web pode abrir em 8082; as duas origens locais estão previstas no `CORS_ORIGINS`. Ao usar outro IP/porta, inclua a origem exata na configuração da API e recarregue-a.

No navegador, `/` e `/admin` abrem o novo login administrativo; `/app` abre o acesso do torcedor e da portaria. A sessão web é preservada ao atualizar a página e restaurada pela API. [Login administrativo e persistência da sessão](docs/admin-login.md).

O admin tem identidade própria com fonte Inter, paleta neutra, detalhes na cor do clube (vermelho no Esporte) e temas claro/escuro independentes. No PC, a partir de 1024 px, ocupa a largura da janela e usa menu lateral recolhível, visão geral e tabelas. No celular, o menu abre pela lateral e as consultas usam cartões. Os formulários se adaptam à largura disponível. [Organização do painel administrativo](docs/admin-desktop.md).

Em `apps/mobile/.env`:

```dotenv
EXPO_PUBLIC_DEMO_MODE=false
EXPO_PUBLIC_API_URL=http://localhost:3333/v1
EXPO_PUBLIC_API_HOST_MODE=local
```

Mantenha `http://localhost:3333/v1` durante o desenvolvimento para não fixar o IP atribuído pelo Wi-Fi. No Expo Go nativo, localhost é resolvido automaticamente para o host atual do Expo. Na web em desenvolvimento, usa o endereço pelo qual o navegador abriu o painel: localhost no próprio PC ou o IP atual no outro aparelho. Com `EXPO_PUBLIC_API_HOST_MODE=local`, um IP privado antigo também acompanha o host atual do Expo/navegador. Para uma API em outra máquina ou um emulador com `http://10.0.2.2:3333/v1`, use `EXPO_PUBLIC_API_HOST_MODE=configured` para preservar exatamente o endereço. O modo `auto` adapta somente localhost; APIs públicas remotas e builds de produção são preservados em todos os modos. A API em `NODE_ENV=development` aceita os IPs atuais do próprio computador nas mesmas portas web já autorizadas para localhost; em produção, só vale `CORS_ORIGINS` explícito. Para builds instalados, configure o endereço acessível da API.

Se a tela mostrar um IP antigo, recarregue com **Ctrl+F5**. Se o Expo ainda entregar a configuração antiga, pare apenas o Expo e execute `npm run web:clear`. Use `npm run api:check` para verificar IPs atuais, `/health` e `/ready` sem iniciar ou reiniciar serviços. `/health` e `/ready` respondendo 200 indicam que API e banco estão acessíveis pelo endereço local; um endereço antigo no cliente deve ser corrigido no app/cache, sem reiniciar o PostgreSQL por esse motivo. Prefira abrir o painel neste PC em `http://localhost:8081/admin`.

**Estado desta máquina — 03/11/2026:** com API e PostgreSQL já iniciados pelo responsável, `npm run db:prepare` aplicou as seis migrations pendentes (sete no total) e configurou o administrador. Cadastro, perfil autenticado, login e rejeição de e-mail duplicado foram verificados pela API na rede local; somente a conta temporária dessa verificação foi removida. O agente não iniciou serviços. As verificações anteriores de 14/10 e 30/10 encontraram o banco indisponível; essa pendência foi resolvida.

## Operação de ingressos

A portaria agora exige partida e setor selecionados e QR assinado de até 45 segundos, renovado no app. Cada entrada invalida as versões anteriores do QR; consultas e repetições não autorizam novas entradas. Controle de horário, confirmação financeira, titular ativo, consumo e auditoria são conferidos no servidor. [Funcionamento, validações e limites reais](docs/ticket-security.md).

**Funcionários:** ADMIN → **Funcionários** → cadastrar conta → definir escala por jogo/setor. O porteiro usa o login comum e abre automaticamente a portaria, lê pela câmera ou digita o código de 10 caracteres mostrado junto ao QR do titular. Os dois caminhos compartilham validade e consumo; desativação/redefinição de senha revoga sessões. A migration de funcionários e códigos foi aplicada em 03/11/2026. A operação de portaria ainda precisa de validação em aparelho. [Operação e API de portaria](docs/gate-staff.md).

**Compra no app:** **Central de ingressos → Comprar** reúne catálogo com busca e filtro de vendas abertas, setores/vagas, quantidade e revisão de preço/desconto pela API. **Meus ingressos** acompanha reserva, confirmação, prazo, cancelamento não pago e QR/código na portaria. O checkout compara o total revisado antes de reservar; pagamento continua por conferência externa do clube enquanto o gateway não é escolhido. [Fluxo de compra e contrato da revisão](docs/ticket-purchase-app.md).

Administrador: login → **Jogos** → criar rascunho → cadastrar setores/preços/capacidade → publicar. Também pode pausar vendas, conferir recebimentos em **Vendas**, gerenciar contas/associações/planos e registrar acessos em **Portaria**. As ações administrativas têm auditoria.

Em **Vendas**, pode editar setor/quantidade e excluir vendas, inclusive pagas e utilizadas, com motivo e auditoria. Nas pagas, o valor recebido é preservado; depois de uma entrada, o setor é mantido e a quantidade não pode ficar abaixo do uso. A exclusão invalida o ingresso e preserva pagamento e portaria no filtro **Excluídas**, sem estorno automático. [Regras de edição e exclusão](docs/admin-sales.md).

Torcedor: cadastro/login → **Perfil → Meus ingressos** → escolher jogo/setor/quantidade → reservar → seguir as instruções do clube. A compra permanece pendente até o administrador confirmar o recebimento externo. Após confirmação, o QR de ingresso aparece para o titular. A portaria consome as entradas informadas e bloqueia reutilização acima da quantidade comprada.

Ingressos gratuitos são emitidos automaticamente. Reservas pagas têm até 15 minutos, estoque conferido na transação e total calculado no servidor. Cancelamento de reserva não paga libera os lugares. Pagamento automático via gateway, reembolso de pedido pago e compra com cashback ainda exigem integração. Configure `TICKET_PAYMENT_INSTRUCTIONS` com as orientações reais do clube.

Detalhes de uso e limites: [contas e ingressos](docs/real-accounts-ticketing.md).

## Cashback/Pix

Carteira em reais separada dos pontos Zezito. O modelo B gera a venda no caixa e vincula o torcedor por código da carteira ou QR da venda. O modelo A com QR fixo usa o mesmo motor e começa desativado por loja.

O gateway ainda não foi escolhido. Não há Pix pagável ou movimentação de dinheiro real no módulo de cashback. A simulação de API exige `PAYMENT_MODE=demo`, apenas fora de produção e com conta autorizada de caixa. [Fluxo e contrato de integração](docs/cashback-pix.md).

## Estrutura

```text
apps/api/
  prisma/          schema, migrations, bootstrap e seed opcional
  src/config/      ambiente e conexão Prisma
  src/http/        aplicação Express, Router, middlewares e transporte HTTP
  src/controllers/ validação de entrada e resposta
  src/services/    regras e autorização
  src/models/      persistência e transações
  src/validators/  schemas Zod
  src/lib/         regras, criptografia e serialização
  src/payments/    contrato do adaptador financeiro
  test/            testes isolados e integração
apps/mobile/src/
  screens/         app, administração, ingressos e caixa
  components/      UI, formulários, leitor QR e sheets
  providers/       sessão, clube e pagamentos
  services/        cliente HTTP e armazenamento
  theme/           temas persistidos
packages/shared/   contratos TypeScript e fixtures opcionais
docs/              operação, arquitetura e endpoints
docker-compose.yml PostgreSQL e perfil opcional da API
```

## Comandos

```powershell
npm run check               # Sintaxe da API e tipos mobile
npm run test:unit           # Regras isoladas, sem abrir portas ou usar PostgreSQL
npm test                    # API e HTTP em memória; testes de banco ficam ignorados sem RUN_DB_TESTS
npm run test:integration    # Desenvolvimento: API/DB, limpa só seus registros de teste
npm run db:prepare          # Generate, deploy e bootstrap do administrador
npm run db:bootstrap        # Criar administrador e configurações iniciais
npm run db:seed             # Opcional: cria fixtures de demonstração fora de produção
npm run db:migrate          # Desenvolver novas migrations
npm run db:studio           # Consultar dados localmente
npm run db:down             # Parar PostgreSQL, preservando volume
```

Para revisar a referência sem API, altere explicitamente `EXPO_PUBLIC_DEMO_MODE=true`. Dados desse modo ficam na sessão; o tema fica no dispositivo. `db:seed` é opcional e não substitui o bootstrap do administrador.

Bundles: `npm run export --workspace @nacional/mobile`. APK/IPA e validação em aparelho são etapas separadas. A câmera requer permissão; esquema de links `nacional://` requer app/build com o esquema registrado.

O perfil Docker completo usa `docker compose --profile full up --build -d`. A API aplica migrations antes de iniciar e roda sem root. O bootstrap administrativo usa os campos `ADMIN_*` no servidor; o container não copia os `.env` locais. Configure credenciais e segredos do ambiente antes de operação pública.

Documentação: [API](docs/api.md), [arquitetura](docs/architecture.md), [validação](docs/validation.md) e [etapas restantes](docs/roadmap.md).

Administração: [gestão de vendas por partida, receita, disponibilidade e histórico de portaria com protocolos](docs/admin-reports.md).

Interface administrativa: [componentes reutilizáveis, calendário, selects e organização das páginas](docs/admin-design.md).

Pagamento Pix automático: [configuração Asaas, webhook, emissão de ingresso e conciliação/estorno](docs/asaas.md). O processamento começa junto da API em modo Asaas. Configure o sandbox em `apps/api/.env` antes de habilitar; o webhook público é `/v1/payments/webhook`.

Loja oficial: [produtos, variações, estoque, pedidos, checkout, Pix, Melhor Envio e modo de loja externa](docs/loja.md). Aplique a migration `20261106020000_shop` com `npm run db:deploy` e configure **Loja** no admin. CPF/CNPJ, telefone, CEP e valores em reais usam máscaras compartilhadas em `packages/shared/forms.js`.

Catálogo do Esporte: [cinco produtos de teste, imagens hospedadas na API e seed idempotente](docs/catalogo-esporte-teste.md).

Financeiro dos ingressos: [empresa 10%, time 90%, tarifas do gateway e repasse semanal manual](docs/financeiro-ingressos.md). Configure em **Admin → Financeiro → Configurações**; registre transferências já realizadas em **Repasses**. Registros não enviam dinheiro e não apagam o histórico.

Banco de dados: [TXT completo de tabelas, campos, relações, chaves e índices](docs/banco/estrutura-completa.txt), conferido com o schema Prisma e os metadados do PostgreSQL.

Camada HTTP migrada para Express 5.3.0, mantendo os endpoints e o contrato do app: [estrutura e verificação](docs/express-migration.md). `createApp` monta a aplicação sem abrir porta; `createHttpServer` prepara o servidor e seus timeouts, e somente `src/server.js` inicia a escuta quando executado.

Recuperação por email, parceiros, ofertas e equipe: [configuração e uso no admin](docs/recuperacao-parceiros.md).

Saques, pedidos de repasse e comprovantes privados: [operação e instalação](docs/saques.md).

Configurações de valores, taxas, prazos, pontos e recompensas: [mapa do admin e regras de histórico](docs/configuracoes-negocio.md).

No erro de conexão do login, **Verificar conexão** consulta os endpoints públicos de API/banco sem enviar credenciais. O modo de desenvolvimento web também oferece **Atualizar página** para descartar uma tela já carregada com configuração antiga. Não há repetição automática de login em outro endereço.
