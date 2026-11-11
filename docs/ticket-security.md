> Este documento descreve o fluxo anterior. A operação de leitura foi substituída pela [portaria unificada V1](ingresso-v1.md) em 11/11/2026; consulte seu contrato e os limites de migração antes de operar. Dados e relatórios anteriores permanecem preservados.

# Venda e validação de ingressos — estado atual

Atualização de 06/11/2026: Pix Asaas, webhook, conciliação e solicitação de estorno estão implementados. O funcionamento depende de `PAYMENT_MODE`: em `asaas`, a emissão é automática após consulta autenticada ao provedor; em `disabled`, depende de confirmação manual administrativa. Consulte a [configuração da integração](asaas.md). As credenciais ficam exclusivamente na API.

O administrador usa sua conta ADMIN na aplicação e no painel web (`npm run web`). O painel tem navegação administrativa própria e layout responsivo. A API e o PostgreSQL são os mesmos.

## Venda

1. O administrador cadastra uma partida em rascunho: mandante, adversário, data/horário, competição e estádio.
2. Cadastra setores com preço por ingresso, capacidade total e habilitação de venda. Define janela de venda, quando necessário.
3. Publica o jogo. O app mostra os setores e disponibilidade calculada.
4. O torcedor autenticado escolhe jogo/setor e de 1 a 4 lugares. A cotação não segura estoque. Ao confirmar, o servidor recalcula preço/desconto e disponibilidade, e reserva a capacidade em transação Serializable. Existe no máximo um pedido não excluído por conta e partida; uma reserva cancelada ou expirada sem pagamento pode ser reaproveitada quando não houver Pix pendente de conciliação.
5. A reserva fica PENDING por até 15 minutos, limitada ao encerramento das vendas/início do jogo. Cancelamento não pago e expiração liberam a capacidade.
6. Em modo Asaas, gerar Pix cria uma intenção única para aquela geração da reserva. O webhook autenticado persiste a notificação; o processador consulta a API do Asaas e confere cobrança, cliente pagador, referência, valor e modalidade PIX. Só `RECEIVED` permite emitir; `CONFIRMED` ainda aguarda. A emissão grava recibo e auditoria na mesma transação. Em modo manual, o administrador confere o recebimento externo e informa valor exato e referência única. Gratuitos têm emissão automática e registro FREE.
7. O titular acompanha o pedido em **Perfil → Meus ingressos** e toca em **Apresentar QR de entrada** quando estiver na portaria. Só um QR fica aberto por vez. A listagem não fornece um segredo de QR estático.

Pagamento recebido depois do prazo da reserva ou com estoque insuficiente não emite ingresso: o processador solicita devolução e acompanha sua confirmação. A validade bancária do Pix pode superar o prazo da reserva; o cancelamento remoto depende da conciliação. Excluir uma venda paga bloqueia seu acesso e preserva o histórico, mas não solicita devolução financeira automaticamente. O estorno é uma ação separada em **Pagamentos**. Não há pagamento de ingresso por cartão ou saldo de cashback nesta etapa.

## Identificação de cada operação

| Identificador | Finalidade | Libera entrada sozinho? |
| --- | --- | --- |
| `Ticket.id` (UUID) | Identifica o pedido, que pode conter até 4 lugares; uma reserva não paga reaproveitada pode manter o mesmo ID | Não |
| `GatewayIntent.id` / `socio:<id>` | Identifica a cobrança e vincula uma geração específica da reserva ao Asaas | Não |
| `ASAAS:pay_...` | Referência única do recibo confirmado; não é um código de ingresso | Não |
| QR de entrada | Credencial assinada vinculada ao pedido, jogo, setor, versão e leitura, com validade de até 45 segundos | Apenas após validação online e confirmação pela portaria |
| Código digitável | 10 caracteres aleatórios, exibidos em dois grupos de 5; usa a mesma validade e leitura do QR, apenas o hash é armazenado | Mesmas verificações do QR |
| `TicketAdmission.id` (UUID) | Protocolo permanente de uma entrada efetivamente registrada, com operador, quantidade e horário | Não; é comprovante de uma operação já feita |

O QR Pix serve para pagar. O QR de entrada serve para apresentar um ingresso emitido. O UUID do pedido e o código da carteirinha não substituem a credencial de portaria.

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
| Conferência do gateway | Cliente pagador, ambiente, ID, referência, modalidade e valor conferidos antes de emitir, cancelar, configurar split ou estornar; resposta incompatível fica em REVIEW |
| Processos concorrentes | Travas com token e prazo; escritas da intenção e do cadastro de pagador, marcadores anteriores a POST e conciliação transacional exigem posse atual da trava |
| Prazo da emissão | A reserva e o início da partida são conferidos novamente depois da consulta ao estoque; vencimento durante a espera encaminha para devolução |
| Tentativas repetidas | Por conta/minuto: 30 cotações, 10 operações compartilhadas entre reserva/cancelamento/geração Pix e 20 emissões de QR; consultas de pagamento não usam esse limite de compra |

O QR de carteirinha de sócio e o access token JWT de login **não servem como ingresso**. Códigos estáticos antigos foram desativados na migration. O ingresso não se valida pelo que está escrito no celular, pelo PDF, por screenshot ou pelo nome; precisa passar pelas verificações no servidor.

As rejeições que chegam à verificação de assinatura/contexto são auditadas. Erros que o middleware rejeita antes disso — JSON inválido, sessão ausente, falta de permissão ou formato inválido — seguem os logs HTTP e limites de requisição. Tokens completos não entram nos logs.

## Resposta perdida e idempotência

A interface guarda os identificadores da operação localmente **antes** de enviar a confirmação. Não guarda o QR. Se a resposta se perder ou o operador reabrir o painel, exige consultar a pendência. O servidor oferece consulta de protocolo vinculada ao mesmo operador, pedido, partida e setor.

Uma repetição ou consulta de entrada já gravada retorna `decision=ALREADY_RECORDED`, não uma nova autorização. A tela mostra estado de conferência e pede para verificar se as pessoas já passaram. Uma resposta desconhecida ou erro não gera sinal verde. O sinal de nova entrada desaparece após alguns segundos para não permanecer como autorização visual para outra pessoa.

O armazenamento local ajuda a recuperar a operação, mas **não é fonte de autorização**: adulterá-lo não cria ingresso, consumo ou protocolo no servidor. As regras ficam no banco/API. Aparelhos distintos usam o mesmo servidor para decidir o consumo; não existe um estoque independente por aparelho.

## Limites reais

Não existe proteção absoluta contra fraude. A validade curta reduz a janela de uma cópia, e o consumo impede reaproveitar acessos; **um QR ainda válido pode ser encaminhado ao vivo e alguém tentar usá-lo primeiro**. O operador precisa conferir o titular e o grupo presentes. Este projeto não implementa reconhecimento facial, prova física de identidade, integração de catraca nem garantia contra compartilhamento em tempo real.

Administrações e partidas desta etapa pertencem ao app Nacional. O módulo de cashback tem separação por instituição, mas a autorização de jogos/portaria ainda não é um sistema completo de clubes independentes com operadores restritos por clube. Há papel GATE separado de ADMIN, com escala por partida/setor conferida novamente dentro da transação de entrada.

JWT assinado não resolve disponibilidade de internet, confiabilidade dos aparelhos ou dimensão da operação do estádio. Os limites atuais são em memória por processo: há limite geral por IP e limites adicionais por conta para portaria e ingressos. Trocar IP não reinicia os limites por conta, mas reiniciar o servidor os apaga e múltiplas instâncias precisam de armazenamento compartilhado. Vários leitores sob o mesmo NAT podem atingir o limite geral. Volume de leitores, proxy, infraestrutura e restrições contra contas múltiplas precisam de validação antes de um evento real.

Uma trava com prazo não torna atômicas as APIs de dois sistemas. Os marcadores persistidos antes das operações financeiras e a busca por referência evitam repetir cegamente uma criação ou um estorno com resultado desconhecido. Situações ambíguas ficam em conciliação; podem exigir atendimento. A integração precisa passar pelo sandbox autenticado e pelo teste de entrega do webhook antes do uso real.

## Onde está implementado

- `apps/api/src/models/ticket-checkout.store.js`: cotação, reserva, preço e estoque.
- `apps/api/src/models/asaas.store.js`: cobrança, webhook persistido, conciliação, emissão e estorno.
- `apps/api/src/lib/ticket-qr.js` e `models/ticket-code.store.js`: assinatura do QR e código digitável.
- `apps/api/src/models/ticket-entry.store.js`: consulta, consumo dos acessos e protocolos.
- `apps/api/src/models/admin-ticket.store.js`: edição e exclusão lógica com auditoria.
- `apps/api/src/http/middleware/access.js`: autenticação, autorização e limites por conta.

Os testes de `asaas-flow.test.js` usam PostgreSQL descartável e gateway simulado. Incluem perda de trava, dados divergentes do pagamento, resposta inconclusiva, repetição de webhook e vencimento durante consulta ao estoque. Os testes de portaria verificam adulteração, expiração, concorrência, repetição e recuperação de protocolo. Não comprovam disponibilidade de rede ou configuração da conta real do gateway.

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

A revisão de segurança de 06/11/2026 não adiciona migrations e não alterou o banco de desenvolvimento. As migrations existentes precisam estar aplicadas no ambiente de execução. Com seu PostgreSQL disponível, os comandos são:

```powershell
npm run db:generate
npm run db:deploy
npm run test:integration
```

Nesta revisão passaram `npm run test:unit` (API e app), `npm run check` (sintaxe JavaScript e TypeScript) e os novos cenários financeiros. Os testes de assinatura e portaria usam persistência simulada; o fluxo financeiro usa PostgreSQL descartável via PGlite, com as migrations reais e um gateway simulado. Há teste específico em `ticket-entry-integration.test.js` para dois leitores disputando o mesmo QR enquanto ainda restam lugares. Essa integração com o PostgreSQL de execução, o sandbox Asaas autenticado e a conferência física dos leitores continuam necessários antes de um evento. Não foram iniciados a aplicação, a API ou o Docker.
