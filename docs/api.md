# API v1

Loja oficial: catálogo, variações, estoque, checkout e frete estão descritos no [guia da loja](loja.md). A migration `20261106020000_shop` precisa ser aplicada antes de utilizar essas rotas.

Pix automático e webhook Asaas: veja [rotas financeiras e configuração](asaas.md). O endpoint `/payments/webhook` está ativo quando `PAYMENT_MODE=asaas`, com autenticação por `asaas-access-token`, inbox persistente e conciliação assíncrona. O modo desabilitado continua usando recebimento manual.

Base local: `http://localhost:3333/v1`.

Sucesso: `{ "data": ... }`. Logout retorna 204 sem corpo. Erro: `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Validação também inclui `details` com caminho e mensagem. Rotas privadas exigem `Authorization: Bearer <token>`.

| Método | Endpoint | Sessão | Finalidade |
| --- | --- | --- | --- |
| POST | `/auth/register` | Não | Cadastro sem associação ativa |
| POST | `/auth/login` | Não | Criar sessão |
| POST | `/auth/logout` | Sim | Revogar a sessão atual |
| POST | `/auth/refresh` | Não | Consumir refresh e retornar novo par |
| POST | `/auth/logout-all` | Sim | Revogar todas as sessões da própria conta |
| GET | `/auth/sessions` | Sim | Listar sessões ativas da conta |
| PUT | `/auth/password` | Sim | Trocar senha e encerrar todas as sessões |
| GET | `/me` | Sim | Perfil e associação |
| PATCH | `/me` | Sim | Atualizar nome, cidade e contato |
| PATCH | `/me/preferences` | Sim | Salvar as quatro preferências |
| PUT | `/me/school-interest` | Sim | Registrar/remover interesse na escolinha |
| GET | `/engagement` | Sim | Check-in, extrato, experiências e ranking |
| GET | `/me/points?limit=50&offset=0` | Sim | Extrato paginado da conta |
| POST | `/check-ins` | Sim | Check-in diário, sem corpo JSON |
| POST | `/redemptions` | Sim | Resgatar experiência com pontos |
| GET | `/me/card-token` | Sim | QR temporário para associação ativa |
| GET | `/dashboard` | Sim | Perfil, jogos publicados, próximo jogo, parceiros, ingressos, engagement e palpites |
| GET | `/matches` | Não | Até 50 jogos futuros com setores |
| GET | `/partners?category=Farmácia&search=Bem` | Não | Parceiros ativos; filtros opcionais e paginação |
| GET | `/tickets` | Sim | Até 100 pedidos/ingressos da conta |
| POST | `/tickets/quote` | Sim | Conferir setor, quantidade, preço, desconto e vagas sem reservar |
| POST | `/tickets` | Sim | Reservar de 1 a 4 lugares por até 15 minutos; aceita `expectedTotalCents` para comparar com o total revisado |
| POST | `/predictions` | Sim | Registrar palpite |
| POST | `/referrals` | Sim | Registrar indicação |
| GET | `/referrals?limit=50&offset=0` | Sim | Consultar indicações da própria conta |

Fora do prefixo `/v1`: `GET /health` e `GET /ready`.

## Contas, administração e portaria

Contas começam como `USER` ativa, sem associação. O retorno de login/perfil inclui `role` e `active`; estes campos não são aceitos no cadastro público ou na atualização do próprio perfil. Administração exige sessão de `ADMIN` ativa. Desativação de conta revoga sessões, e a API rejeita login/autenticação da conta desativada.

| Método | Endpoint | Finalidade |
| --- | --- | --- |
| GET | `/tickets/payment-instructions` | Orientações do clube para pagamento externo |
| POST | `/tickets/cancel` | Cancelar reserva não paga da própria conta |
| GET | `/admin/overview` | Quantidades de contas, jogos, ingressos e reservas abertas |
| GET/POST/PATCH | `/admin/matches` | Listar, criar rascunho e editar/publicar jogos |
| POST/PATCH | `/admin/sectors` | Criar/editar preço, capacidade e habilitação do setor |
| GET | `/admin/tickets?matchId=<UUID>&status=PENDING&limit=100` | Consultar compras/reservas |
| POST | `/admin/tickets/quote` | Revisar edição de setor/quantidade; total recebido fica preservado em vendas pagas |
| PATCH | `/admin/tickets` | Editar reserva válida ou venda paga, com motivo, versão e total esperado |
| DELETE | `/admin/tickets` | Excluir logicamente venda, inclusive paga/utilizada; manter pagamento, entradas e auditoria |
| POST | `/admin/tickets/confirm-payment` | Conferir recebimento externo e emitir ingresso |
| POST | `/admin/tickets/cancel` | Cancelar reserva não paga |
| POST | `/admin/tickets/inspect` | Consultar QR de ingresso na portaria |
| POST | `/admin/tickets/admit` | Consumir entradas com idempotência |
| GET | `/admin/users?search=nome&limit=100` | Buscar contas, com plano/perfil/estado |
| PATCH | `/admin/users/status` | Desativar/reativar conta |
| GET/POST/PATCH | `/admin/plans` | Listar/criar/editar planos |
| PUT | `/admin/memberships` | Definir plano, status e validade de associação |
| GET | `/admin/audit?limit=100&offset=0` | Trilha administrativa paginada |

Criar jogo (começa como rascunho, `published=false`; horários com timezone obrigatório):

```json
{ "homeTeam": "NACIONAL", "awayTeam": "ADVERSÁRIO", "startsAt": "2026-10-24T16:00:00-03:00", "stadium": "José Cavalcanti", "competition": "Campeonato", "salesEnabled": true }
```

Criar setor:

```json
{ "matchId": "<UUID>", "name": "Arquibancada Sol", "priceCents": 4000, "capacity": 500, "salesEnabled": true }
```

Publicar jogo: `{ "id": "<UUID>", "published": true }` em PATCH `/admin/matches`. É necessário ao menos um setor habilitado com capacidade positiva. PATCH de setor recebe `id` e apenas os campos alterados. Jogo pode ter `salesOpenAt`/`salesCloseAt` (ISO ou null); a janela deve respeitar o início da partida. `/matches` e o dashboard mostram apenas jogos publicados futuros e disponibilidade calculada por setor, usando ingressos emitidos/usados e reservas válidas.

Cancelar reserva: `{ "ticketId": "<UUID>" }`. Confirmar recebimento:

```json
{ "ticketId": "<UUID>", "receivedCents": 8000, "reference": "RECIBO-2026-001", "paymentVerified": true }
```

O total deve ser exato, a reserva deve estar pendente e válida, e a referência de recebimento é única. Essa API registra a conferência do administrador, não faz transferência financeira. Repetir a mesma referência/valor para o pedido confirmado é idempotente. Gratuitos são emitidos na reserva com registro FREE. QR estático não é mais retornado. O titular solicita QR assinado de até 45 segundos no endpoint `/tickets/entry-qr?ticketId=<UUID>`, com a portaria habilitada e dentro do horário.

Consultar ingresso na portaria: `{ "token": "<JWT-do-QR>", "matchId": "<UUID>", "sectorId": "<UUID>" }`. A consulta retorna REVIEW e não libera entrada. Registrar entrada:

```json
{ "token": "<JWT-do-QR>", "matchId": "<UUID>", "sectorId": "<UUID>", "quantity": 1, "requestKey": "entry_unique_request_001" }
```

O retorno inclui `ticket`, protocolo, `duplicate` e `decision`. Só ALLOW com duplicate=false representa nova autorização. Repetição retorna ALREADY_RECORDED, vinculada ao mesmo operador/QR/quantidade, sem consumir outra entrada. Cada consumo invalida os QRs anteriores do pedido. A quantidade é entre 1 e 4 e não pode exceder as entradas restantes. `usedQuantity` e `remainingQuantity` indicam uso parcial; ao consumir todas, o status vira USED. Operações exigem administrador e são auditadas.

Plano: `{ "name": "Sócio Canário", "priceCents": 3990, "discountPercent": 10 }`; em PATCH acrescente `id`. Associação: `{ "userId": "<UUID>", "planId": "<UUID>", "status": "ACTIVE", "validUntil": "2027-12-31T23:59:59-03:00" }`. Associação ACTIVE exige validade futura. Atualizar estado de conta: `{ "userId": "<UUID>", "active": false }`.

Detalhes de assinatura, janelas, recuperação de resposta perdida e limites: [segurança dos ingressos](ticket-security.md). Portaria usa `entryEnabled`, `gateOpenAt` e `gateCloseAt` em PATCH `/admin/matches`. A central do torcedor consulta preço/vagas e confirma o total em duas etapas: [compra no app](ticket-purchase-app.md). Funcionários GATE operam pelas rotas `/gate/*`, restritos à escala: [equipe de portaria](gate-staff.md).

Aplicação das tabelas/primeiro administrador e jornada completa: [contas e ingressos](real-accounts-ticketing.md).

## Cashback e caixa do parceiro

Todos os endpoints abaixo exigem sessão, exceto o webhook. Operações do caixa verificam a permissão `MerchantOperator` para a loja. Clientes não enviam custo de cashback, comissão, saldo ou status de pagamento.

| Método | Endpoint | Finalidade |
| --- | --- | --- |
| GET | `/cashback/wallet?tenant=nacional-patos` | Código do torcedor, saldo em centavos, extrato e compras da própria conta |
| GET | `/merchant/setup` | Lojas/instituições autorizadas, taxas e habilitações |
| GET | `/merchant/charges` | Até 50 cobranças dos caixas autorizados |
| POST | `/merchant/charges` | Modelo B: gerar venda com valor e código opcional do torcedor |
| POST | `/payments/resolve` | Consultar QR de venda; bloqueia venda vinculada a outra conta |
| PUT | `/payments/claim` | Vincular cobrança aberta à própria carteira na instituição da oferta |
| GET | `/payments/charge?id=<UUID>` | Consultar cobrança já vinculada à própria conta |
| POST | `/payments/customer-charge?tenant=nacional-patos` | Modelo A: informar valor pelo QR fixo da loja; exige habilitação na oferta |
| POST | `/merchant/simulate-event` | Somente caixa autorizado, modo demo e fora de produção |
| POST | `/payments/webhook` | Asaas: autentica token, persiste evento e responde 200; 503 se desabilitado |

Modelo B:

```json
{ "offerId": "<UUID-da-oferta>", "amountCents": 10000, "requestKey": "sale_unique_request_001", "customerCode": "NC-<código-da-carteira>" }
```

`customerCode` pode ser omitido: o usuário precisa vincular a compra antes de concluir a simulação. `requestKey` tem de 16 a 80 caracteres (`A-Z`, `a-z`, números, `_`, `-`), identifica a operação do criador e permite repetir a requisição sem criar outra cobrança. Reutilização para outro valor/oferta/canal retorna 409.

Resolver/vincular: `{ "code": "<saleCode-do-QR>" }`. O link é `nacional://sale/<saleCode>`, opaco e sem CPF ou nome do torcedor. QR fixo: `nacional://merchant/<publicCode>`. Modelo A recebe `{ "merchantCode": "<UUID>", "amountCents": 10000, "requestKey": "sale_unique_request_002" }`.

Simulação: `{ "chargeId": "<UUID>", "type": "SETTLED", "eventId": "event_unique_request_001" }`. `REFUNDED` simula estorno total. Esse endpoint é bloqueado fora do modo demo e jamais funciona com cobrança de provedor real. Webhooks normalizados não são aceitos do app.

Retorno da cobrança inclui `amountCents`, `cashbackCents`, `merchantCents`, `commissionCents`, `gatewayFeeCents`, `customerLinked`, `demo`, `pixPayload`, `saleQr` e validade. `pixPayload=null` nas simulações: o QR da venda não é Pix. O saldo usa `availableCents` e `debtCents`; esses campos não são pontos Zezito. Detalhes: [fluxo e integração](cashback-pix.md).

## Corpos JSON

Cadastro (senha entre 10 e 128 caracteres):

```json
{ "name": "Rafael Silva", "email": "rafael@example.com", "password": "MinhaSenha123!" }
```

Login:

```json
{ "email": "rafael@example.com", "password": "MinhaSenha123!" }
```

Cadastro/login retornam `accessToken` (JWT), `refreshToken`, suas datas de validade, `expiresIn`, `tokenType` e `member`. Refresh recebe `{ "refreshToken": "<segredo>" }` e retorna um novo par. E-mails são normalizados para minúsculas. [Contrato JWT completo](authentication.md).

Atualização de perfil:

```json
{ "name": "Alex Rangel Vieira", "city": "Patos", "contact": "contato@example.com" }
```

Ingresso (IDs UUID retornados pela API, sem valores enviados pelo cliente):

```json
{ "matchId": "<UUID-do-jogo>", "sectorId": "<UUID-do-setor>", "quantity": 2 }
```

Palpite:

```json
{ "matchId": "<UUID-do-jogo>", "homeScore": 2, "awayScore": 1 }
```

Indicação (`kind`: `FRIEND`, `BUSINESS` ou `PARTNER`):

```json
{ "kind": "BUSINESS", "name": "Comércio local", "contact": "contato@example.com" }
```

IDs dos fixtures demonstrativos são identificadores locais; o seed gera UUIDs reais no PostgreSQL. Valores monetários são inteiros em centavos; datas são ISO 8601. O app formata horários do jogo no fuso de Patos/PB.

Preferências (todos os campos são obrigatórios; `ranking` começa desativado em novos cadastros):

```json
{ "family": true, "personalize": true, "notifications": false, "ranking": false }
```

Interesse na escolinha: `{ "interested": true }`. Isso registra interesse, sem realizar matrícula ou enviar contato. Resgate: `{ "rewardId": "<UUID-da-experiência>" }`. O custo é lido no banco, nunca recebido do cliente. Preferências de lembretes são armazenadas; entrega push ainda não está integrada.

Check-in retorna `entry` e `points`. Resgate retorna o protocolo com a experiência. Cada conta pode fazer um check-in por dia (`America/Fortaleza`) e um resgate por experiência. Débito, estoque, protocolo e lançamento de pontos são atômicos. Conflitos de serialização repetem a transação até três tentativas. Duplicidade, falta de saldo, estoque esgotado e capacidade insuficiente retornam 409.

Reservas incluem `quantity` e `expiresAt`; `priceCents` representa o total já com desconto. `EXPIRED` é calculado na leitura: o registro mantém `PENDING` no banco, mas deixa de ocupar capacidade após `expiresAt`. Refazer uma reserva vencida atualiza o mesmo registro. O administrador pode confirmar recebimento externo e emitir o ingresso. O gateway automático ainda não está conectado.

Paginação aceita `limit` entre 1 e 100 (padrão 50), `offset` entre 0 e 10000. O dashboard limita cada coleção. Ranking retorna apenas nome abreviado, pontos e identificação da própria posição; somente contas que aceitaram participar aparecem.

## Conferir no PowerShell

Relatórios administrativos (ADMIN ativo): `GET /admin/sales`, `/admin/admissions`, `/admin/admissions/protocol`, `/admin/gate-denials` e `/admin/gate-operators`. Filtros, critérios de receita/estoque e paginação estão em [gestão de vendas e histórico de portaria](admin-reports.md). Esses relatórios usam `limit` padrão 25 e permitem paginar além dos 10 mil registros.

```powershell
$credentials = @{ email = 'rafael@demo.nacional.local'; password = 'NacionalDemo123!' } | ConvertTo-Json
$login = Invoke-RestMethod -Uri 'http://localhost:3333/v1/auth/login' -Method Post -ContentType 'application/json' -Body $credentials
$sessionHeaders = @{ Authorization = "Bearer $($login.data.accessToken)" }
Invoke-RestMethod -Uri 'http://localhost:3333/v1/dashboard' -Headers $sessionHeaders
```

Erros principais: 400 JSON/setor inválido, 401 credenciais/sessão inválida, 403 associação/origem bloqueada, 404 rota/jogo ausente, 409 registro duplicado/jogo iniciado, 413 corpo grande, 415 Content-Type, 422 validação, 429 limite de requisições, 503 banco indisponível no readiness.
