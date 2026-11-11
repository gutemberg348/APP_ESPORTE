# Contas, administração e venda de ingressos

O app está configurado com `EXPO_PUBLIC_DEMO_MODE=false`: cadastro, login, perfil, disponibilidade, reservas e administração consultam a API/PostgreSQL. Os fixtures só são usados quando o modo demo é habilitado explicitamente.

## Preparar o banco

Na raiz do projeto, depois de instalar as dependências:

```powershell
npm run setup
npm run db:up
npm run db:prepare
```

`db:up` é executado pelo responsável e inicia apenas PostgreSQL em Docker. `db:prepare` gera o cliente Prisma, aplica as migrations e cria a primeira conta administrativa, a instituição Nacional de Patos e o plano Sócio Canário. Esse comando não inicia a API, o app ou o Docker, não cria jogos fictícios e preserva dados existentes.

Na revisão de 14/10/2026, a aplicação das migrations foi tentada, mas o PostgreSQL configurado em `localhost:55432` recusou a conexão (`ECONNREFUSED`). As novas tabelas e a conta administrativa **ainda não foram criadas no banco desta máquina**. Nenhum serviço foi iniciado pelo agente. A migration `20261014030000_admin_ticketing` está pronta junto das migrations anteriores.

Credenciais do primeiro administrador ficam em `apps/api/.env`:

- `ADMIN_EMAIL`: inicialmente `admin@nacional.local`.
- `ADMIN_NAME`: nome exibido no app.
- `ADMIN_PASSWORD`: senha aleatória já preenchida localmente. Em uma instalação nova, `npm run setup` cria essa senha quando o campo está vazio.

Você pode editar esses campos antes do primeiro `db:prepare`. Não use o cadastro público para criar um administrador. Se o e-mail já pertencer a uma conta de torcedor, o bootstrap exige outro e-mail. Repetir o bootstrap não troca senhas nem promove uma conta existente. Mais administradores podem ser criados com outros e-mails usando o mesmo script no servidor; não há promoção pública de perfil.

## Executar API e app

Em terminais separados, por sua conta:

```powershell
npm run dev:api
```

```powershell
npm run dev:mobile
```

Para usar o painel no navegador, execute `npm run web` no lugar do segundo comando. O painel usa os mesmos componentes React Native e APIs; é acessível também no celular.

Em desenvolvimento, mantenha `EXPO_PUBLIC_API_URL=http://localhost:3333/v1`: no celular, o app usa o host atual do Expo; na web, o host do navegador. A API em desenvolvimento aceita os IPs deste computador nas portas web locais configuradas. APIs remotas e builds de produção exigem uma URL explícita acessível. Em emulador Android, use `http://10.0.2.2:3333/v1`. Recarregue o Expo após mudar `.env`; `npm run web:clear` limpa o cache web. `npm run api:check` consulta API e banco sem reiniciar serviços. `GET /ready` retorna 503 quando o banco não está acessível.

## Jornada do torcedor

1. Na tela inicial de autenticação, toque em **Quero me cadastrar**.
2. Informe nome, e-mail, senha de pelo menos 10 caracteres e confirmação. A API cria o usuário com perfil `USER`, senha em scrypt e sessão autenticada; não aceita role, saldo ou associação enviados pelo cliente.
3. Abra **Perfil → Meus ingressos**, ou **Tabela** no início, para ver os jogos publicados pelo clube.
4. Escolha jogo, setor e de 1 a 4 lugares. A disponibilidade e o desconto da associação são conferidos de novo pelo servidor na transação.
5. Confirme a reserva e siga as instruções de pagamento publicadas pelo clube. A reserva paga expira em até 15 minutos; a criação não marca pagamento como recebido.
6. Após o administrador conferir o recebimento, o ingresso aparece como **Emitido**, com QR e quantidade de entradas restantes.
7. O administrador habilita a portaria da partida e sua janela. O app apresenta QR renovado de até 45 segundos. Na portaria, apresente o QR. Entradas parciais são permitidas até consumir a quantidade comprada. O servidor impede exceder os acessos restantes.

Ingressos gratuitos, incluindo os cujo desconto resulte em zero, são emitidos automaticamente, com registro `FREE`. Para ingressos com preço, o fluxo atual é **recebimento externo confirmado manualmente pelo clube**. Ainda não existe cobrança Pix/cartão automática nem uso do cashback para pagar ingressos. Nenhuma chave Pix foi inventada no app.

Configure `TICKET_PAYMENT_INSTRUCTIONS` em `apps/api/.env` com as orientações reais do atendimento do clube. O administrador informa valor e referência única do recebimento e declara ter conferido o pagamento. Confirmar exige total igual à reserva e validade não expirada. Quando a reserva venceu, o cliente deve refazê-la se ainda houver capacidade; o sistema não emite acima da lotação.

Uma conta mantém um pedido por jogo, com até 4 lugares. Reservas sem pagamento podem ser canceladas pelo próprio titular ou pelo administrador; lugares são liberados. Um pedido pago/emitido não pode ser cancelado como reserva: reembolso e nova compra desse pedido exigem etapa posterior. Essa regra preserva o histórico financeiro.

## Jornada do administrador

O login administrativo abre o painel diretamente. Ele também está em **Perfil → Abrir administração do clube**.

| Aba | Operações |
| --- | --- |
| Jogos | Criar rascunho, editar dados/data, cadastrar setores, preço/capacidade, publicar e pausar vendas |
| Vendas | Consultar reservas/compras, conferir recebimento, emitir ingressos e cancelar reservas não pagas |
| Torcedores | Buscar contas, ativar/renovar associação, desativar/reativar conta |
| Planos | Criar/editar preço mensal e desconto em ingressos |
| Portaria | Ler QR, consultar titular/setor/acessos, registrar entrada com quantidade |
| Auditoria | Consultar quem executou cada operação e quando |

Cadastre primeiro o jogo como rascunho. Depois adicione setores com capacidade e preço. A publicação exige ao menos um setor habilitado com lugares. Novas contas podem comprar ingresso sem plano; sócios ativos recebem o desconto configurado pelo servidor.

A ativação de associação é administrativa, com plano, status e validade. Ela não gera mensalidade cobrada nem comprova pagamento do plano. Carteirinha exige associação ativa e não vencida. O QR de carteirinha e o QR de ingresso são diferentes; a portaria desta etapa aceita **somente ingresso**.

Desativação de conta revoga suas sessões. O último administrador ativo é protegido, e o administrador não pode desativar a própria conta. O cadastro e a atualização pública de perfil não conseguem alterar permissões. As rotas `/admin/*` exigem role `ADMIN` ativa, verificada no HTTP e no service.

## Banco e concorrência

As novas entidades são `TicketPayment`, `TicketAdmission` e `AuditLog`. `User` recebe perfil/estado, `Match` recebe publicação/janela de venda, `Sector` recebe controle de venda e `Ticket` recebe segredo de acesso e quantidade utilizada.

Reserva, ajuste de capacidade, confirmação de pagamento e entrada são transações Serializable. As constraints impedem referências de recebimento repetidas, duas confirmações financeiras do mesmo pedido e uso duplicado da mesma operação de portaria. Repetir uma confirmação com a mesma referência/valor retorna o pedido original; repetir a operação de entrada com a mesma chave não consome outra entrada.

A API revela o QR de acesso somente ao titular, pelo endpoint dedicado, após emissão/pagamento e dentro da janela de entrada habilitada. O QR tem validade curta; cada entrada invalida as versões anteriores. [Regras atuais e limites](ticket-security.md). A listagem administrativa não expõe o segredo do QR. Não há exclusão física de pedidos ou contas na interface; auditoria e registros financeiros são preservados. Alterar preço do setor não altera o total de reservas existentes, e reduzir capacidade abaixo de lugares emitidos/reservados válidos é bloqueado. Mudança de data de jogo com ingressos emitidos exige tratamento dos compradores e está bloqueada nesta etapa.

Jogos existentes antes da migration são preservados como publicados. Novos jogos começam como rascunho. Ingressos antigos que já estejam `ISSUED` mas não tenham registro financeiro/QR não recebem uma confirmação fictícia durante a migration; sua regularização exige conferir os registros do clube.

## Validação

`npm run check` confere sintaxe JavaScript e TypeScript. `npm run test:unit` executa as regras sem abrir portas, iniciar app ou consultar PostgreSQL. O teste de integração completo está em `apps/api/test/admin-integration.test.js` e é incluído em `npm run test:integration`.

O teste com banco cobre cadastro e bloqueio de promoção, publicação de jogo, disputa pelos últimos lugares, confirmação duplicada, QR, entrada repetida/concorrente, cortesia, associação, suspensão e auditoria. Não foi executado nesta revisão porque o PostgreSQL estava indisponível. Câmera, layout e uso em Android/iOS também precisam de conferência no ambiente iniciado pelo responsável.


### Endereço local e login após mudança de IP

Em `apps/mobile/.env`, mantenha `EXPO_PUBLIC_API_URL=http://localhost:3333/v1` e `EXPO_PUBLIC_API_HOST_MODE=local` quando Expo e API rodam neste mesmo computador. No PC, abra `http://localhost:8081/admin` (ou a porta indicada pelo Expo). O modo local acompanha o host da página/Expo e corrige IPv4 privado antigo somente em desenvolvimento. Para uma API separada ou host de emulador configurado explicitamente, use `EXPO_PUBLIC_API_HOST_MODE=configured`; produção e APIs públicas remotas não são redirecionadas.

O transporte resolve a URL no início de cada requisição, em vez de fixá-la na criação do módulo. Um login que falha não é reenviado automaticamente nem tentado em outro servidor. O erro do login oferece **Verificar conexão**: `GET /health`, `GET /ready` e `POST /connection-check` com o corpo `{"probe":true}`, com prazo de 4 segundos por verificação, sem senha, JWT ou cookies. O diagnóstico diferencia a API indisponível do banco indisponível. Na web local, **Atualizar página** recarrega o código atual; isso não inicia serviços e não altera o container do banco. Uma aba antiga precisa ser recarregada para receber esse ajuste.


O comando `npm run dev:api` agora mantém a API sem reinício automático. Use `npm run dev:api:watch` somente quando quiser recarregar ao salvar o backend. Um terminal já aberto em watch precisa ser encerrado pelo responsável e iniciado com o comando estável; o PostgreSQL permanece ligado. [Comandos, evidências e diagnóstico de consultas/envio](api-estabilidade.md).
