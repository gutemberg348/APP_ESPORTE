# API estável para testar o app e o painel

Revisão de 10/11/2026.

## Comandos

`npm run dev:api` agora executa a API sem observar arquivos. Ela continua usando o `.env` de desenvolvimento, mas salvar código, gerar Prisma ou trocar arquivos do checkout não derruba esse processo. Depois de mudar o backend, encerre a API pelo próprio terminal e execute o comando novamente para carregar as mudanças.

`npm run dev:api:watch` é a opção explícita para desenvolver com recarga automática. Preserva a saída do terminal. Uma alteração em dependência observada encerra a instância anterior e cria outra; a API fica indisponível durante essa troca e requisições em andamento podem ser interrompidas. No Windows, o encerramento de um subprocesso via `kill` é abrupto, conforme a [documentação do Node 22](https://nodejs.org/download/release/v22.13.1/docs/api/child_process.html#subprocesskillsignal).

Uma sessão de terminal que já executava `node --watch` não troca de modo porque o `package.json` foi editado. Para ativar o modo estável, use **Ctrl+C no terminal da API** e execute `npm run dev:api` uma vez. Não é necessário reiniciar o PostgreSQL, recriar banco ou containers, executar seed nem trocar senhas.

`npm run start --workspace @nacional/api` e o comando do container da API continuam sem watch. A configuração de ambiente e os controles de acesso permanecem os mesmos.

## Diagnóstico que verifica o envio

`npm run api:check` consulta três endpoints sem usar senha ou sessão:

| Endpoint | Verificação |
| --- | --- |
| `GET /health` | Processo HTTP e identidade da API |
| `GET /ready` | Acesso atual ao banco |
| `POST /connection-check` | Envio e leitura de JSON, com corpo exclusivo `{"probe":true}` |

O terceiro endpoint não faz login, não consulta contas, não cria sessão, não altera o banco e não consome a cota de tentativas de autenticação. Ele passa pelo CORS, limite geral de requisições e validação JSON; métodos incorretos, campos extras e corpos inválidos são rejeitados.

O botão **Verificar conexão** do login testa os mesmos três caminhos a partir do próprio navegador ou app, com prazo individual de quatro segundos. Se as consultas responderem e o POST falhar, ele informa a falha no envio em vez de declarar a conexão recuperada. Se os três responderem, o erro anterior do login é substituído pela indicação de conexão restabelecida; o usuário repete o login conscientemente. O diagnóstico nunca repete um login, pagamento ou outra operação de escrita automaticamente.

O transporte usa JWT no cabeçalho, omite cookies e solicita respostas sem cache. O CORS expõe `X-Request-Id`, permitindo consultar o protocolo das respostas no cliente. Conexões interrompidas antes da conclusão são registradas como `REQUEST_INTERRUPTED`, com método, caminho sem parâmetros, protocolo e duração; sem senha, corpo ou token.

## Evidências desta revisão

O processo encontrado inicialmente estava em `node --watch`; o log fornecido continha `Restarting 'src/server.js'`. O login administrativo com as credenciais configuradas retornou 200 em aproximadamente 600 ms, a consulta autenticada retornou 200 e a sessão de diagnóstico foi revogada com 204. Também foi observado o painel autenticado na aba do navegador. O banco e os testes de consulta/envio responderam durante a verificação.

Isso confirma um problema concreto de disponibilidade no modo de recarga e um diagnóstico anterior incompleto. Não permite atribuir retrospectivamente todas as falhas antigas ao mesmo motivo. Se houver nova falha fora de um reinício, confira o POST em **Verificar conexão**, o protocolo e as mensagens do terminal para distinguir erro de rede, interrupção, indisponibilidade do banco ou rejeição de credenciais.
