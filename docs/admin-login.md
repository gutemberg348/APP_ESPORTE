# Login do painel e sessão no navegador

O torcedor usa `/` para entrar ou criar uma conta. A empresa e a equipe do clube entram em `/acesso/`. O cargo cadastrado abre a administração geral (`OWNER`), o painel do time (`ADMIN`), a portaria, a bilheteria ou o caixa. Os favoritos antigos `/administracao-geral/`, `/admin`, `/portaria` e `/bilheteria` levam à entrada da equipe, e `/app` continua abrindo o torcedor.

Os formulários web enviam `FAN` ou `STAFF` para `/v1/auth/login`. A API verifica a senha, o perfil e se a conta está ativa antes de criar a sessão. As permissões das operações continuam sendo verificadas na API. O Nginx do contêiner web serve `index.html` nos caminhos do aplicativo.

## Conta master da empresa

No Docker, configure `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `ADMIN_NAME` no `.env` da raiz e recrie o contêiner da API para carregar as variáveis. Execute `sudo docker compose exec -T api npm run db:bootstrap`. O comando informa o e-mail do master. Na API local, as variáveis ficam em `apps/api/.env`.

Se o e-mail já pertence a um administrador do clube, o comando converte essa conta, aplica a senha configurada e invalida as sessões e links de recuperação anteriores. Use um e-mail e uma senha de uso exclusivo da empresa. Para manter o login atual com o time, configure outro e-mail para o master. Repetir o comando para um master ativo preserva sua senha atual. O master cadastra os administradores do time em **Funcionários**.

O rodapé do menu contém **Logs de auditoria**. O master consulta os eventos administrativos de toda a instalação. Para o clube, a API filtra os eventos executados por contas master.

## Correção dos encerramentos ao atualizar a página

O transporte web anterior guardava os tokens apenas em uma variável JavaScript; recarregar a página apagava esse estado. Agora os tokens ficam no `window.sessionStorage`, com uma chave separada por endereço de API e área de acesso. Uma atualização da página restaura a sessão e consulta `/me` para obter perfil e permissões atuais.

Um JWT válido é reutilizado na restauração. Antes, cada restauração consumia um refresh, mesmo sem necessidade. O cliente continua renovando o JWT próximo do vencimento e compartilhando uma renovação entre chamadas concorrentes. O prazo absoluto padrão do servidor permanece de sete dias desde o login. Logout, revogação, troca de senha, suspensão e expiração continuam sendo aplicados.

O armazenamento contém somente o par de tokens e suas validades; senha e perfil ficam de fora. A persistência é por sessão da aba, não uma opção de lembrar acesso permanentemente. Se o navegador impedir o armazenamento, o login funciona em memória. Falhas de rede ou API indisponível não apagam as credenciais; uma rejeição real da sessão limpa o estado e pede novo login.

Na primeira atualização após esta mudança, pode ser necessário entrar uma vez, porque a sessão antiga existia apenas na memória da página.

## Arquivos

- `apps/mobile/src/screens/AdminLoginScreen.tsx`: apresentação e acesso administrativo.
- `apps/mobile/src/navigation/useWebPortal.ts`: seleção da área web e navegação pelo histórico.
- `apps/mobile/src/services/web-session-storage.ts`: persistência e validação dos tokens da aba.
- `apps/mobile/src/services/session-storage.ts`: seleção entre navegador e SecureStore.
- `apps/mobile/src/services/authenticated-request.ts`: envio autenticado e renovação do JWT.
- `apps/mobile/src/providers/SessionProvider.tsx`: restauração do perfil pela API.
- `apps/api/src/services/auth-core.js`: restrição do portal a administradores ativos.

## Verificação

Passaram 84 testes unitários da API e 22 do app. Os novos testes cobrem recarregamento, gravação da renovação, exclusão no logout, separação por API, dados corrompidos, refresh expirado, armazenamento bloqueado, chamadas simultâneas com JWT vencido, falhas de rede e rejeição real da sessão. O teste do serviço de login comprova que USER/GATE não criam sessão pelo portal ADMIN.

TypeScript, sintaxe da API e exportação web/iOS passaram; os pacotes estão em `.artifacts/admin-login-session`. A inspeção visual do novo login não foi concluída: o usuário interrompeu o controle do computador com Escape. Não foram iniciados servidores ou Docker.
