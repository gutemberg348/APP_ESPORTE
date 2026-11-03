# Cadastro, login e JWT

A API usa Express 5, com controllers, services e models. Os middlewares verificam autenticação e permissões antes da leitura do corpo e da execução dos controllers. A autenticação usa `jose` para assinar/verificar JWT, scrypt para senhas e PostgreSQL para controlar sessões e renovação.

## Endpoints

Base: `/v1`. Rotas privadas recebem `Authorization: Bearer <accessToken>`. Tokens não são aceitos pela URL. Cadastro público nunca aceita role, associação, saldo ou campos administrativos.

| Método | Endpoint | Entrada | Resultado |
| --- | --- | --- | --- |
| POST | `/auth/register` | `name`, `email`, `password` | Conta USER ativa + sessão, 201 |
| POST | `/auth/login` | `email`, `password` | Sessão, 200 |
| POST | `/auth/refresh` | `refreshToken` | Novo par de tokens, 200 |
| POST | `/auth/logout` | Bearer, sem corpo | Revoga sessão atual, 204 |
| POST | `/auth/logout-all` | Bearer, sem corpo | Revoga todas as sessões da conta, 204 |
| GET | `/auth/sessions` | Bearer | Até 100 sessões ativas da própria conta |
| PUT | `/auth/password` | Bearer, `currentPassword`, `newPassword` | Altera senha, revoga todas as sessões, 204 |
| GET | `/me` | Bearer | Perfil e associação atuais |

Cadastro:

```json
{ "name": "Torcedor Nacional", "email": "torcedor@example.com", "password": "MinhaSenhaSegura123" }
```

E-mail é normalizado (`trim` e minúsculas), nome tem entre 2 e 100 caracteres e senha entre 10 e 128. A senha não é aparada nem truncada. Cadastro e criação da sessão são gravados na mesma transação. E-mail duplicado retorna `EMAIL_IN_USE` (409), inclusive sob disputa pela constraint única.

Cadastro, login e refresh retornam:

```json
{
  "data": {
    "accessToken": "<JWT-assinado>",
    "accessTokenExpiresAt": "<ISO-8601>",
    "expiresIn": 900,
    "refreshToken": "<segredo-aleatório-de-43-caracteres>",
    "refreshTokenExpiresAt": "<ISO-8601>",
    "tokenType": "Bearer",
    "member": { "id": "<UUID>", "name": "Torcedor Nacional", "role": "USER" }
  }
}
```

`member` tem os demais campos normais de perfil/associação. Não contém senha, hash ou sessões. O antigo campo `token` foi substituído por `accessToken`; consumidores externos precisam atualizar o nome. A confirmação de senha é feita no formulário do app, e o backend valida a senha recebida.

## Tokens e renovação

O access token tem duração padrão de **15 minutos**, limitada ao término absoluto da sessão. Usa exclusivamente **HS256**, tipo `at+jwt`, e exige `sub`, `sid`, `jti`, `iat`, `exp`, issuer e audience esperados. JWT não contém e-mail, senha, saldo ou papel administrativo. Um QR de carteirinha/ingresso ou um refresh token não autentica como access token.

Após verificar assinatura e claims, a API lê a sessão e o usuário atuais. Sessão revogada/vencida ou conta desativada é recusada. A autorização administrativa usa a role do banco, sem confiar em uma permissão antiga no JWT. Há consulta ao PostgreSQL em cada requisição privada; o uso de JWT não transforma a sessão em autorização puramente stateless.

O refresh token tem **256 bits aleatórios**. Somente SHA-256 é armazenado. Cada renovação consome o refresh anterior e gera outro, em uma transação Serializable. O histórico fica em `RefreshToken`; `Session.tokenHash` representa o hash do refresh atual. A reutilização de um refresh consumido revoga a sessão inteira, incluindo os JWTs ainda não expirados. A revogação é confirmada no banco antes de retornar a rejeição.

O prazo padrão da sessão é **7 dias absolutos desde o login**, não renovado a cada refresh. Outro login cria outra sessão. Logout afeta apenas a atual; logout-all, troca de senha e suspensão impedem uso das sessões correspondentes. Desativação administrativa continua revogando as sessões existentes.

Clientes devem salvar o novo par antes de substituir o anterior e fazer uma única renovação compartilhada entre requisições concorrentes. Se a resposta de uma renovação se perder depois do commit, repetir o refresh antigo pode ser identificado como reutilização e exigir login; não há período de tolerância nesta implementação.

Referências técnicas: [jose](https://github.com/panva/jose), [RFC 8725 — boas práticas para JWT](https://www.rfc-editor.org/info/rfc8725/), [RFC 9700 — proteção e rotação de refresh tokens](https://www.rfc-editor.org/info/rfc9700/). O projeto implementa autenticação própria; não é um servidor OAuth/OIDC completo.

## Senhas e proteção HTTP

Novas senhas usam scrypt-v2 com salt aleatório individual, `N=32768`, `r=8`, `p=3` e derivação de 64 bytes. A comparação usa `timingSafeEqual`. Hashes scrypt da versão anterior continuam válidos. Troca exige senha atual correta, nova senha válida e diferente; depois exige novo login em todos os dispositivos.

Usuário inexistente, senha incorreta e conta desativada retornam o mesmo erro de login. Um hash fictício evita eliminar o custo de derivação quando o e-mail não existe. Hashes nunca aparecem nas respostas.

O HTTP limita corpo JSON a 16 KiB, aceita apenas origens configuradas, rejeita headers Bearer malformados e retorna `Cache-Control: no-store`. Erros de autenticação incluem `WWW-Authenticate: Bearer`. Os limites são 120 requisições/minuto por IP, 10 tentativas/15 minutos por IP e endpoint de cadastro/login/troca de senha, e 60 renovações/15 minutos por IP. São limites em memória para uma instância; múltiplas réplicas exigem armazenamento compartilhado e configuração de proxy antes de confiar em IP encaminhado.

Principais erros: `ACCESS_TOKEN_EXPIRED`, `ACCESS_TOKEN_INVALID`, `SESSION_REVOKED`, `REFRESH_TOKEN_INVALID`, `REFRESH_TOKEN_REUSED`, `INVALID_CREDENTIALS` e `INVALID_CURRENT_PASSWORD` (401); `ADMIN_REQUIRED`, `GATE_REQUIRED`, `GATE_SCOPE_DENIED` e `GATE_ONLY_ACCOUNT` (403); `VALIDATION_ERROR` (422); limites (429). Uma senha atual incorreta não encerra a sessão existente.

Funcionários são criados por ADMIN com role GATE, sem cadastro público. O app usa um único formulário de login e envia somente e-mail e senha, sem seletor Torcedor/Portaria. O perfil retornado pela API define a área: USER abre o app do torcedor, GATE abre a portaria e ADMIN abre a administração. O campo opcional legado `portal` continua aceito pela API por compatibilidade, mas não é enviado pelo app e não concede permissões. Contas GATE só acessam rotas de portaria e segurança própria. Desativar funcionário ou redefinir sua senha no admin revoga suas sessões. [Funcionários e escalas](gate-staff.md).

Verificação de e-mail, recuperação de senha por mensagem e MFA não estão implementados. Não há envio de mensagens ou códigos fictícios. Eles dependem de etapa própria e do serviço de comunicação escolhido.

## Integração do app

O app já usa `accessToken`. `SessionProvider` controla login/restauração, `auth-session.ts` concentra a máquina de sessão e `api.ts` faz renovação antes do vencimento ou uma vez após `ACCESS_TOKEN_EXPIRED`. Respostas 401 por outros motivos não geram repetição automática de operações. O middleware autentica antes do handler; um pedido rejeitado por JWT vencido ainda não executou a mutação.

Renovações simultâneas compartilham uma promise. As gravações são serializadas, e uma geração de sessão impede resposta atrasada de restaurar tokens após logout ou sobrescrever outro login. Falha de rede mantém credenciais para nova tentativa; refresh rejeitado limpa a sessão.

Requisições de uma conta anterior também não são reenviadas usando o JWT de outro login. O cliente aceita referências de access tokens recentes apenas da própria sessão; troca de conta durante uma operação retorna `SESSION_CHANGED` para que ela seja refeita conscientemente.

No Android/iOS, o par é armazenado no SecureStore. No web, fica somente em memória; recarregar a página exige login. Não foi introduzido refresh persistente em localStorage nem fluxo de cookies. Clientes web independentes que precisem de sessão persistente devem ter projeto específico de cookies HttpOnly/CSRF.

**Perfil → Segurança** permite alterar a senha, consultar sessões e sair de todos os dispositivos. A mudança de senha tem aviso de encerramento das sessões antes de confirmar.

## Configuração e migration

```powershell
npm run setup
npm run db:prepare
```

Execute os comandos quando o banco estiver disponível. `setup` já foi executado nesta revisão, gerando segredos JWT aleatórios separados no `.env` da raiz (Docker) e `apps/api/.env` (API local), sem imprimir os valores. Eles não devem ser versionados. O comando mantém segredos existentes.

| Variável | Padrão/uso |
| --- | --- |
| `JWT_SECRET` | Obrigatório, pelo menos 64 caracteres; gerado pelo setup |
| `JWT_ISSUER` | `nacional-api` |
| `JWT_AUDIENCE` | `nacional-app` |
| `JWT_ACCESS_TTL_SECONDS` | `900`, permitido de 60 a 1800 |
| `SESSION_TTL_DAYS` | `7`, permitido de 1 a 30 |

O segredo JWT deve ser diferente do segredo de carteirinha. API local e container precisam do segredo correspondente aos tokens que emitem; ao trocar de configuração, os JWTs anteriores podem deixar de validar.

A migration `20261030010000_jwt_sessions` adiciona o histórico de refresh e os campos de revogação. Ela marca as sessões opacas anteriores como revogadas, preservando contas, hashes de senha e dados de negócio. Todos precisarão entrar novamente depois da aplicação. A migration foi preparada e não foi aplicada nesta revisão; nenhum servidor ou banco foi iniciado.

Sessões antigas/consumidas são mantidas até a expiração para detectar replay. Execute periodicamente `npm run auth:cleanup --workspace @nacional/api` para remover sessões expiradas e seus históricos por cascade. O comando não é agendado automaticamente.

## Testes

`npm run test:unit` executa testes de regras do backend e da máquina de sessão mobile, sem PostgreSQL ou portas abertas. `npm run check` confere sintaxe e TypeScript. `npm run test:integration` inclui o fluxo JWT real com PostgreSQL e servidor de teste temporário; deve ser executado em desenvolvimento pelo responsável quando iniciar o ambiente.
