# Venda e validação de ingressos — estado atual

Atualiza??o de 06/11/2026: Pix autom?tico Asaas, webhook, concilia??o e solicita??o de estorno est?o implementados. Consulte [configura??o e contrato atuais](asaas.md); as descri??es do recebimento manual abaixo continuam aplic?veis em `PAYMENT_MODE=disabled`.

O administrador usa o mesmo cadastro/JWT no app e na versão web do projeto (`npm run web`). O painel web recebe mais largura em desktop; os formulários ficam centralizados. A API e o PostgreSQL são os mesmos. Não foi publicado um site em domínio externo nem foi iniciada uma prévia nesta revisão.

## Venda

1. O administrador cadastra uma partida em rascunho: mandante, adversário, data/horário, competição e estádio.
2. Cadastra setores com preço por ingresso, capacidade total e habilitação de venda. Define janela de venda, quando necessário.
3. Publica o jogo. O app mostra os setores e disponibilidade calculada.
4. O torcedor autenticado escolhe jogo/setor e até 4 lugares. O servidor calcula total/desconto e reserva a capacidade em transação Serializable.
5. A reserva fica PENDING por até 15 minutos, limitada ao encerramento das vendas/início do jogo. Cancelamento não pago e expiração liberam a capacidade.
6. O administrador confere o recebimento externo, informa valor exato e referência única e emite o ingresso. Gratuitos têm emissão automática e registro FREE.
7. O titular acompanha o pedido em **Perfil → Meus ingressos** e toca em **Apresentar QR de entrada** quando estiver na portaria. Só um QR fica aberto por vez. A listagem não fornece um segredo de QR estático.

O gateway ainda não foi escolhido. **Não há cobrança Pix/cartão automática**, checkout bancário ou confirmação financeira por webhook de ingresso. A confirmação manual depende da conferência real do clube. Compra com cashback e devolução de ingresso pago continuam pendentes.

## Portaria

Cada partida tem `entryEnabled` (começa false), `gateOpenAt` e `gateCloseAt`. Sem horários específicos, a janela vai de **2 horas antes** até **4 horas depois do início**. O administrador precisa habilitar a portaria; publicação e venda não habilitam entrada automaticamente.

No app/painel, o ADMIN entra em **Portaria**. O funcionário GATE usa o login único do app e é direcionado automaticamente à tela exclusiva com os jogos/setores liberados pelo administrador. O operador seleciona **a partida e o setor físico que está operando** e lê o QR atualizado pela câmera ou digita o código exibido junto dele. A consulta exibe nome, setor, lugares restantes e prazo, mas retorna `decision=REVIEW`: **não autoriza entrada**. [Cadastro de funcionários, escalas e código digitável](gate-staff.md).

Depois de conferir o titular e as pessoas presentes, o operador informa a quantidade e confirma. O servidor somente responde `decision=ALLOW` para uma nova entrada gravada com sucesso. Em uma transação, consome os acessos, incrementa a versão do QR, grava o protocolo de entrada e a auditoria.

Se o mesmo pedido tem várias pessoas, elas podem entrar juntas ou em grupos parciais. Uma entrada parcial invalida **todos os QRs anteriores** do pedido; o titular deve esperar a atualização do app para usar os lugares restantes. Não existe reentrada automática depois de consumir os acessos.

## Proteções implementadas

| Verificação | Comportamento |
| --- | --- |
| Sessão/role | JWT válido, ADMIN ativo ou funcionário GATE ativo com escala para o setor; titular autenticado para solicitar seu QR |
| Código digitável | 10 caracteres aleatórios, somente hash no banco; mesma leitura, versão e expiração do QR |
| Propriedade | Outra conta não consegue obter QR do pedido |
| Assinatura | JWT de ingresso com segredo próprio, HS256, issuer, audience e tipo exclusivos |
| Validade | QR dura até 45 segundos, limitado ao fechamento da portaria; app renova aproximadamente a cada 15 segundos |
| Escopo | QR contém pedido, partida, setor e versão; a partida e o setor selecionados precisam corresponder |
| Emissão/pagamento | Estado ISSUED, registro de recebimento compatível com o total e titular ativo |
| Janela | Portaria habilitada e horário atual entre abertura/fechamento |
| Quantidade | Inteiro válido, não maior que os acessos restantes |
| Uso simultâneo | Incremento condicional da versão e transação Serializable; um QR não pode liberar duas operações distintas, mesmo com lugares restantes |
| Repetição de requisição | Mesma operação/operador/QR/quantidade retorna o registro anterior, sem novo consumo |
| Auditoria | Entrada registra operador, horário, quantidade e protocolo; rejeições processadas registram motivo e hash do QR |
| Segredos | QR completo não é armazenado em auditoria, listagens ou registro local de pendência |
| Falha de conexão | Não há liberação offline; a tela mantém operação pendente e consulta o servidor |
| Falha após escrita | Se o token vence durante a espera no banco, ou a auditoria falha, a transação é desfeita |

O QR de carteirinha de sócio e o access token JWT de login **não servem como ingresso**. Códigos estáticos antigos foram desativados na migration. O ingresso não se valida pelo que está escrito no celular, pelo PDF, por screenshot ou pelo nome; precisa passar pelas verificações no servidor.

As rejeições que chegam à verificação de assinatura/contexto são auditadas. Erros que o middleware rejeita antes disso — JSON inválido, sessão ausente, falta de permissão ou formato inválido — seguem os logs HTTP e limites de requisição. Tokens completos não entram nos logs.

## Resposta perdida e idempotência

A interface guarda os identificadores da operação localmente **antes** de enviar a confirmação. Não guarda o QR. Se a resposta se perder ou o operador reabrir o painel, exige consultar a pendência. O servidor oferece consulta de protocolo vinculada ao mesmo operador, pedido, partida e setor.

Uma repetição ou consulta de entrada já gravada retorna `decision=ALREADY_RECORDED`, não uma nova autorização. A tela mostra estado de conferência e pede para verificar se as pessoas já passaram. Uma resposta desconhecida ou erro não gera sinal verde. O sinal de nova entrada desaparece após alguns segundos para não permanecer como autorização visual para outra pessoa.

O armazenamento local ajuda a recuperar a operação, mas **não é fonte de autorização**: adulterá-lo não cria ingresso, consumo ou protocolo no servidor. As regras ficam no banco/API. Aparelhos distintos usam o mesmo servidor para decidir o consumo; não existe um estoque independente por aparelho.

## Limites reais

Não existe proteção absoluta contra fraude. A validade curta reduz a janela de uma cópia, e o consumo impede reaproveitar acessos; **um QR ainda válido pode ser encaminhado ao vivo e alguém tentar usá-lo primeiro**. O operador precisa conferir o titular e o grupo presentes. Este projeto não implementa reconhecimento facial, prova física de identidade, integração de catraca nem garantia contra compartilhamento em tempo real.

Administrações e partidas desta etapa pertencem ao app Nacional. O módulo de cashback tem separação por instituição, mas a autorização de jogos/portaria ainda não é um sistema completo de clubes independentes com operadores restritos por clube. Há papel GATE separado de ADMIN, com escala por partida/setor conferida novamente dentro da transação de entrada.

JWT assinado não resolve disponibilidade de internet, confiabilidade dos aparelhos ou dimensão da operação do estádio. O rate limiter atual é em memória, com limite geral por IP e limite adicional por conta de portaria; vários leitores sob o mesmo NAT podem atingir o limite. Volume de leitores, proxy, limites compartilhados e infraestrutura da portaria precisam de validação antes de um evento real.

## API

Todas as rotas exigem Bearer de acesso. `/v1/admin/*` exige ADMIN. O app de funcionários usa `/v1/gate/*`, que aceita ADMIN ou GATE autorizado para o setor.

| Método | Endpoint | Uso |
| --- | --- | --- |
| GET | `/v1/tickets/entry-qr?ticketId=<UUID>` | Titular solicita QR curto após pagamento/emissão e abertura da portaria |
| GET | `/v1/gate/matches` | Jogos e setores autorizados para o operador |
| POST | `/v1/gate/inspect` | Consultar por `token` ou `code`, sem consumir |
| POST | `/v1/gate/admit` | Confirmar por `token` ou `code`, com quantidade e chave de operação |
| GET | `/v1/gate/admission-receipt` | Consultar operação anterior do próprio operador |
| POST | `/v1/admin/tickets/inspect` | Verificar QR e apresentar dados sem consumir acessos |
| POST | `/v1/admin/tickets/admit` | Gravar e autorizar uma entrada nova |
| GET | `/v1/admin/tickets/admission-receipt?ticketId=…&matchId=…&sectorId=…&requestKey=…` | Consultar operação do próprio operador sem nova liberação |

Consultar:

```json
{ "token": "<JWT-do-QR>", "matchId": "<UUID-da-partida>", "sectorId": "<UUID-do-setor-da-portaria>" }
```

Autorizar:

```json
{ "token": "<JWT-do-QR>", "matchId": "<UUID-da-partida>", "sectorId": "<UUID-do-setor>", "quantity": 1, "requestKey": "unique_gate_operation_001" }
```

Atualizar portaria com PATCH `/v1/admin/matches`:

```json
{ "id": "<UUID-da-partida>", "entryEnabled": true, "gateOpenAt": "2026-11-20T14:00:00-03:00", "gateCloseAt": "2026-11-20T20:00:00-03:00" }
```

O QR retornado é `nacional://ticket/<JWT>` e a resposta também fornece `code`, digitável. Pode enviar `code` no lugar de `token`, nunca ambos. `/tickets` e `/dashboard` retornam `entryQr=null`; o cliente precisa do endpoint dedicado. `TICKET_QR_SECRET` é separado de `JWT_SECRET` e `CARD_TOKEN_SECRET`; `npm run setup` gera os valores locais sem imprimi-los.

## Aplicação e validação

A migration `20261030020000_secure_ticket_entry` adiciona o controle de portaria/versão e o identificador único de leitura. Ela limpa os segredos estáticos antigos, preservando ingressos, pagamentos e entradas já gravadas. Todas as portarias começam desativadas e precisam ser configuradas pelo administrador.

A migration `20261030030000_gate_staff_codes` adiciona funcionários GATE, escalas por setor e hashes dos códigos digitáveis com validade curta.

O banco configurado continua recusando conexão nesta revisão. As migrations estão prontas e **não foram aplicadas**. Quando o responsável iniciar o banco:

```powershell
npm run setup
npm run db:prepare
npm run test:integration
```

Os testes isolados exercitam assinatura, prazo, escopo, recibo, titular, consumo, versões, repetição e rollback usando o código de produção com persistência em memória atômica. Isso **não comprova o comportamento de concorrência do PostgreSQL**. Há teste específico em `ticket-entry-integration.test.js` para dois leitores disputando o mesmo QR enquanto ainda restam lugares, além do fluxo HTTP administrativo atualizado. Os testes com PostgreSQL e a conferência em aparelho/navegador não foram executados nesta revisão; o agente não iniciou serviços.
