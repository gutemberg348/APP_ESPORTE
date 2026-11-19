# Login do painel e sessão no navegador

O torcedor usa `/` para entrar ou criar uma conta. A equipe do clube usa `/acesso/`. O perfil cadastrado abre a portaria, a bilheteria, o caixa do parceiro ou o painel do time. O administrador geral da empresa entra em `/administracao-geral/`. Os favoritos antigos `/admin`, `/portaria` e `/bilheteria` levam à entrada da equipe, e `/app` continua abrindo o torcedor.

Os formulários web enviam `FAN`, `STAFF` ou `OWNER` para `/v1/auth/login`. A API verifica a senha, o perfil e se a conta está ativa antes de criar a sessão. As permissões das operações continuam sendo verificadas na API. O Nginx do contêiner web serve `index.html` nos caminhos do aplicativo.

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
