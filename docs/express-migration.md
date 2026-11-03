# API com Express — 03/11/2026

A camada HTTP foi migrada de um despachante próprio para Express 5.3.0, conforme a nova orientação do projeto. A dependência está na API e fixada no lockfile. O app continua consumindo os mesmos endpoints, métodos, respostas e códigos de erro. Prisma, PostgreSQL, JWT, controllers, services e models permanecem na arquitetura atual. Não é necessária migration de banco para esta troca.

## Organização

| Arquivo | Responsabilidade |
| --- | --- |
| `src/http/app.js` | Monta a aplicação Express e a ordem dos middlewares, sem abrir porta |
| `src/http/server.js` | Cria o servidor HTTP a partir da aplicação e define timeouts |
| `src/server.js` | Inicializa a escuta quando executado e mantém o encerramento gracioso |
| `src/http/router.js` | Registra os descritores de rotas no Express Router e adapta o contexto dos controllers |
| `src/http/body.js` | `express.json`, limite de 16 KiB, JSON obrigatório e captura dos bytes originais |
| `src/http/middleware/request-context.js` | Identificador de requisição, cabeçalhos e log sem corpo/query |
| `src/http/middleware/cors.js` | Origens explícitas e preflight |
| `src/http/middleware/access.js` | Limites geral/login/refresh/portaria, sessão e permissões |
| `src/http/middleware/errors.js` | Respostas JSON de validação, domínio, parser, Prisma e erros internos |
| `src/routes/index.js` | Catálogo existente de endpoints e suas permissões |

Os controllers recebem `{ req, url, body, user, sessionId }` e retornam `{ status, data }`; o Router é responsável por enviar a resposta Express. Isso preserva a separação dos fluxos de negócio e o contrato do app durante a migração. Promises rejeitadas dos middlewares/handlers assíncronos são encaminhadas ao middleware de erro pelo Express 5.

## Contratos preservados

- As rotas continuam com nomes sensíveis a maiúsculas/minúsculas e barra final estrita. Um método não registrado retorna 405 e `Allow`; uma rota desconhecida retorna 404. HEAD não executa implicitamente uma operação GET.
- Autenticação, autorização e limites específicos são executados antes de analisar o corpo. GATE continua restrito à portaria e segurança própria; ADMIN continua obrigatório nas rotas administrativas.
- JSON inválido/vazio retorna 400; tipo incompatível retorna 415; corpo acima do limite retorna 413; campos inválidos retornam 422 com os detalhes Zod. Compressão do corpo fica desabilitada.
- `req.rawBody` preserva os bytes recebidos para uma futura verificação de assinatura de webhook. O gateway real ainda não foi integrado; capturar os bytes não autentica um webhook por si só.
- `trust proxy` fica desabilitado e os limites usam o endereço da conexão. Não há confiança automática em `X-Forwarded-For`. Limites continuam em memória por instância.
- `X-Powered-By` e ETag foram desabilitados. Identificador, `no-store`, `nosniff`, política de referência, CORS e respostas sem detalhes internos foram mantidos.
- Timeouts do servidor permanecem: 15 segundos para requisição e 10 segundos para cabeçalhos. O desligamento continua fechando servidor e conexão Prisma.

## Testes sem execução de serviços

`test/helpers/inject.js` passa streams `IncomingMessage`/`ServerResponse` diretamente à aplicação Express. Os testes HTTP não usam rede, porta, PostgreSQL ou listener. Cobrem parser, rawBody, cabeçalhos, CORS, métodos/caminhos, rejeição assíncrona, permissões, limites e erros Prisma. Os testes que exigem PostgreSQL usam `createHttpServer` e continuam condicionados a `RUN_DB_TESTS=true`.

O comando `npm run test:unit` inclui os testes HTTP. `npm test` também os executa em memória e ignora os testes de banco quando não habilitados. Nenhum app, API, Docker ou prévia foi iniciado nesta migração.

Verificação realizada: `npm run check` passou; 72 testes da API e 9 do app passaram (81 no total), incluindo os 13 testes HTTP. As 66 rotas foram montadas no Express e as 60 privadas rejeitaram acesso sem sessão. Não foi executada integração com PostgreSQL nem teste visual nesta etapa.

Referências: [API oficial do Express 5](https://expressjs.com/en/api/) e [guia de migração](https://expressjs.com/en/guide/migrating-5/).
