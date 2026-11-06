# Arquitetura

Atualiza??o de 06/11/2026: Pix autom?tico Asaas, webhook, concilia??o e solicita??o de estorno est?o implementados. Consulte [configura??o e contrato atuais](asaas.md); as descri??es do recebimento manual abaixo continuam aplic?veis em `PAYMENT_MODE=disabled`.

## Backend

```text
Requisição HTTP
  → Express: contexto da requisição, CORS e limite geral
  → Express Router: método/endpoint, limites específicos, sessão e permissões
  → express.json: validação do tipo e leitura de JSON com limite de 16 KiB
  → controller: validação e status HTTP
  → service: regra de negócio
  → model: consultas Prisma
  → PostgreSQL
```

Controllers não consultam o banco diretamente. Services decidem sobre associação, desconto, início do jogo e duplicidade. Models concentram o acesso ao Prisma. O schema Prisma define as entidades persistidas: User, Session, Plan, Membership, Match, Sector, Ticket, Partner, Prediction, Referral, PointEntry, Reward, Redemption, entidades financeiras de cashback, TicketPayment, TicketAdmission e AuditLog.

O servidor usa Express 5.3.0, com middleware central de erros e Router registrado a partir dos descritores em `src/routes/index.js`. Zod valida os dados; Prisma/pg fazem persistência; dotenv carrega o ambiente. A API usa ESM e JavaScript; os contratos do app são TypeScript. Os controllers mantêm seu contexto `{ req, url, body, user, sessionId }`, adaptado pelo Router, e retornam `{ status, data }`.

`src/http/app.js` exporta `createApp`, que monta a aplicação Express sem escutar portas. `src/http/server.js` exporta `createHttpServer`, que a conecta ao transporte nativo `node:http` com os timeouts existentes. `src/server.js` inicia a escuta e mantém o encerramento gracioso. Os middlewares de contexto, CORS, acesso e erros ficam em `src/http/middleware/`. Testes HTTP usam streams Node em memória, sem listener. [Migração e decisões](express-migration.md).

## Sessão e carteirinha

Novas senhas usam scrypt-v2 com salt individual; hashes da versão anterior continuam válidos. Access tokens JWT duram 15 minutos e são verificados com jose: algoritmo HS256, tipo at+jwt, issuer, audience, sub, sid, jti e validade obrigatórios. Refresh tokens têm 256 bits aleatórios e somente seu SHA-256 é armazenado. Cada renovação consome o anterior em uma transação; reutilização revoga a sessão. A duração absoluta padrão é sete dias.

Rotas privadas também consultam a sessão e o usuário atuais. Logout revoga a sessão; logout-all e troca de senha revogam todas. Permissões administrativas vêm do banco, sem role congelada no JWT. O app renova automaticamente os tokens e impede refresh simultâneo ou restauração tardia após logout. Ver [autenticação](authentication.md).

Perfil público da própria conta exclui senha e sessões. Alteração do perfil aceita nome, cidade e contato: o cliente não pode alterar saldo, associação ou desconto. QR da carteira só é gerado para associação ativa e não vencida, com payload assinado por HMAC-SHA256 e expiração na próxima janela de 30 segundos. O endpoint de validação do leitor do estádio ainda precisa ser implementado; este QR não está integrado a catracas.

O app renova o QR, oculta tokens vencidos e pede um novo ao voltar do segundo plano. A sessão nativa fica no SecureStore. No navegador, os tokens ficam no sessionStorage da aba, separados pela URL da API, e sobrevivem à atualização da página. O perfil e as permissões são restaurados pela API. A área web tem login administrativo próprio em `/admin` e acesso do torcedor em `/app`.

## Ingressos e palpites

Um usuário tem uma solicitação de ingresso por jogo. O cliente envia IDs do jogo/setor e quantidade de 1 a 4. Uma transação Serializable lê a capacidade, soma lugares pagos/usados e reservas válidas, calcula o desconto pela associação atual e grava a reserva. A validade é de até 15 minutos, limitada ao início do jogo. Expiradas aparecem como EXPIRED na API e podem ser refeitas. A constraint por usuário/jogo impede duplicidade. Confirmação manual de recebimento externo, emissão de QR e cancelamento de reserva sem pagamento já estão implementados. Ingresso gratuito é emitido automaticamente. O gateway automático e o reembolso de pedido pago continuam pendentes.

Palpites aceitam inteiros de 0 a 30, somente antes do jogo. A constraint `(userId, matchId)` impede envio duplicado inclusive sob concorrência. Resultado e apuração dos palpites serão implementados posteriormente. Check-ins e resgates já gravam movimentações em PointEntry. Indicações são persistidas, sem envio de mensagem a terceiros.

## Administração e portaria

User tem role USER/ADMIN/GATE e estado active. A autorização administrativa é verificada no HTTP e nos services, com sessão/estado atuais. Cadastro público não recebe esses campos. O bootstrap cria a conta administrativa separadamente. ADMIN provisiona funcionários GATE e escalas GateAssignment por setor; GATE opera somente portaria e segurança própria. A confirmação de entrada verifica novamente a conta e a escala dentro da transação. Jogos novos são rascunhos e exigem setor disponível para publicação. Capacidade não pode ficar abaixo dos lugares reservados/emitidos.

TicketPayment registra confirmação do total recebido, referência única e administrador. O antigo segredo Ticket.entryToken foi desativado. O titular solicita JWT de ingresso de até 45 segundos, com segredo/tipo/audience exclusivos, partida, setor e versão de acesso. TicketAdmission grava quantidade/operador/chave de idempotência; a transação bloqueia consumo acima da quantidade comprada e incrementa entryVersion, invalidando todos os QRs anteriores do pedido. Portaria exige partida/setor selecionados, pagamento compatível, titular ativo, habilitação e janela de horário. AuditLog registra as operações. A portaria de ingressos não valida o QR da carteirinha de sócio.

## App e design

Check-in e resgate usam transações Serializable. A chave única `(userId, sourceKey)` impede crédito diário duplicado, e `(userId, rewardId)` limita o resgate por conta. Saldo e estoque têm atualizações condicionais e constraints não negativas no PostgreSQL. O ledger registra cada crédito/débito. O ranking consulta somente quem habilitou a preferência, sem publicar identificadores ou contatos. Conflitos de serialização têm até três tentativas; as regras dependentes de leituras do banco são avaliadas dentro da transação nos models.

`ThemeProvider` concentra cores. `SessionProvider` controla login e restauração; `ClubProvider` controla o dashboard e ações. As telas usam componentes React Native, estilos nativos e SVG, sem HTML, Tailwind ou WebView para simular o app.

As cinco abas conservam a ordem da referência: Início, Vantagens, Carteira ao centro, Fan Zone e Perfil. `Crest` usa o PNG original de `naca-digital/dist/assets`. As fontes DM Sans e Manrope são empacotadas localmente; o tema é persistido em AsyncStorage. Gradientes, ícones Lucide, cards e sheets mantêm a composição do protótipo. Efeitos CSS específicos da web foram adaptados; a carteira tem linha de leitura animada, e o modo estádio mantém a tela acordada e respeita a preferência do sistema por menos movimento.

O modo estádio alterna cores com base no relógio local em fases de seis segundos, conforme a referência atual, com opções Juntos, Verde, Branca e Suave. Sincronização controlada pelo estádio exigirá um endpoint/canal de comandos e compensação da diferença de relógio.

## Operação

Configuração validada na inicialização. JSON limitado a 16 KiB. CORS aceita origens explícitas; requisições nativas sem Origin continuam permitidas com autenticação. Limites atuais: 120 requisições/minuto por IP e 10 tentativas de autenticação/15 minutos por IP e endpoint, além de 60 renovações de sessão/15 minutos por IP. São limites em memória para uma instância; em múltiplas instâncias devem ser substituídos por armazenamento compartilhado. O servidor não confia em `X-Forwarded-For` nesta etapa.

Respostas têm identificador de requisição e `Cache-Control: no-store`; logs não incluem corpos ou tokens. Há endpoints de liveness/readiness e encerramento de conexões no desligamento. Banco local usa volume persistente e porta ligada ao loopback. A API Docker roda sem root.
