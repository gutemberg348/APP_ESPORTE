# Funcionários e app de portaria

## Operação

1. O ADMIN entra no app ou no mesmo painel pelo navegador, abre **Funcionários** e cadastra nome, e-mail e senha de pelo menos 12 caracteres. A conta criada tem papel `GATE`; não existe cadastro público de funcionários nem promoção de uma conta existente pelo e-mail.
2. Em **Definir escala de jogos e setores**, marca os setores que o funcionário pode operar. Sem escala, a conta pode entrar, mas não validar ingressos. A partida também precisa estar com portaria habilitada e dentro da janela de entrada.
3. O funcionário abre o app e usa o mesmo formulário de e-mail e senha dos torcedores, com as credenciais entregues pelo clube. O perfil GATE retornado pela API direciona automaticamente para a tela exclusiva de portaria; não há seletor de tipo de conta no login. O cadastro público continua criando somente torcedores.
4. Seleciona o jogo e o setor físico da portaria. Pode **ler o QR pela câmera** ou **digitar o código de 10 caracteres** mostrado junto ao QR no app do titular. Letras minúsculas, espaços e o hífen são normalizados.
5. A consulta mostra titular, setor, acessos restantes e validade. Ainda não libera entrada. Depois da conferência presencial, informa quantas pessoas estão entrando e confirma no servidor.
6. Somente uma resposta de nova entrada confirmada permite liberar as pessoas indicadas. Resposta perdida exige consultar a operação pendente. Sem internet, não há liberação offline.

ADMIN mantém acesso à portaria pelo painel, sem precisar de escala individual. GATE não acessa rotas administrativas, compras, cashback ou recursos privados do torcedor; tem somente portaria e segurança da própria conta. O administrador pode desativar a conta ou redefinir a senha: ambas as ações revogam as sessões anteriores. Alterações de escala são consultadas na API e novamente dentro da transação de entrada; não dependem de atualizar o app do funcionário.

## Código digitável e QR

O código tem dez caracteres aleatórios, em dois grupos de cinco, sem `0`, `1`, `I` ou `O`. São 50 bits de aleatoriedade. Não é o UUID do ingresso, uma senha fixa ou um código de pagamento. Cada emissão cria um par QR/código com a **mesma leitura (`scanId`), versão e expiração de até 45 segundos**, limitada ao fechamento da portaria.

O app renova o par aproximadamente a cada 15 segundos. Pares anteriores continuam sujeitos ao seu vencimento original; depois de qualquer entrada, todos os pares da versão anterior deixam de funcionar, inclusive quando o pedido ainda tem lugares restantes. Ler pela câmera e depois digitar o código não fornece dois acessos. Repetir a mesma operação retorna um comprovante anterior, sem novo consumo.

`TicketAccessCode` guarda somente hash SHA-256 do código, vínculo com ingresso/leitura/versão e vencimento. O texto do código e o JWT não entram em auditorias nem na pendência local. `npm run auth:cleanup --workspace @nacional/api` remove registros vencidos. O limite da API inclui autenticação, limite geral por IP e 90 ações de portaria por minuto por conta; os contadores atuais ficam em memória.

A confirmação mantém todas as regras existentes: ingresso emitido, pagamento compatível, titular ativo, partida/setor corretos, portaria aberta, quantidade disponível, atualização condicional da versão, transação Serializable e auditoria atômica. Um QR ou código ainda válido pode ser encaminhado ao vivo; a conferência presencial do titular continua necessária.

## Endpoints

| Método | Rota | Permissão |
| --- | --- | --- |
| POST | `/v1/auth/login` com e-mail e senha | Login único; perfil retornado define a área e as permissões |
| GET / POST / PATCH | `/v1/admin/employees` | ADMIN: listar, criar ou atualizar funcionário |
| PUT | `/v1/admin/employees/password` | ADMIN: `{ userId, password }`, redefine senha e revoga sessões |
| PUT | `/v1/admin/employees/assignments` | ADMIN: `{ userId, sectorIds }`, substitui escala; `[]` remove todas |
| GET | `/v1/gate/matches` | GATE: somente jogos e setores da escala; ADMIN: todos |
| POST | `/v1/gate/inspect` | GATE escalado ou ADMIN; consulta sem consumir |
| POST | `/v1/gate/admit` | GATE escalado ou ADMIN; confirma entrada |
| GET | `/v1/gate/admission-receipt` | Somente comprovante de operação do próprio operador |

Consulta digitada:

```json
{ "code": "ABCDE-FGHJK", "matchId": "<UUID>", "sectorId": "<UUID>" }
```

Confirmação digitada:

```json
{ "code": "ABCDE-FGHJK", "matchId": "<UUID>", "sectorId": "<UUID>", "quantity": 1, "requestKey": "unique_gate_operation_001" }
```

Para leitura pela câmera, enviar `token` com o JWT extraído de `nacional://ticket/<JWT>`, em vez de `code`. Enviar ambos ou nenhum é inválido. A consulta de comprovante usa `ticketId`, `matchId`, `sectorId` e `requestKey` na query; permanece disponível ao próprio operador ativo mesmo se sua escala mudar, para esclarecer uma resposta perdida sem outra entrada.

## Banco e verificação

A migration `20261030030000_gate_staff_codes` acrescenta GATE, `GateAssignment` e `TicketAccessCode`, com chaves estrangeiras e índices únicos. O PostgreSQL em `localhost:55432` recusou conexão em 30/10/2026; a migration **não foi aplicada** e nenhum funcionário foi criado nesta máquina. Quando o responsável iniciar o banco, executar `npm run db:prepare`.

Passaram 51 testes isolados da API e 6 do mobile, além de TypeScript, sintaxe e validação do schema Prisma. Os testes exercitam código normalizado, hash, expiração, câmera/código compartilhando o mesmo consumo, impedimento de cadastro público GATE, login de portaria e escala revogada antes da confirmação. A persistência dos testes isolados é em memória e não comprova concorrência no PostgreSQL.

`gate-staff-integration.test.js` está preparado para verificar cadastro/escala, permissões HTTP, os dois caminhos de entrada, redefinição de senha e suspensão com PostgreSQL. Não foi executado. Depois de preparar um banco de desenvolvimento, `npm run test:integration` executa também esse teste, que abre um servidor temporário durante sua execução. A câmera e o fluxo visual ainda precisam ser conferidos no aparelho; no navegador, a câmera exige HTTPS ou localhost. Nenhum app, API, container ou prévia foi iniciado pelo agente.
