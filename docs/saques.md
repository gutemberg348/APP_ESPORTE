# Saques, pedidos de repasse e comprovantes

A seção **Saques** do menu administrativo reúne **Pedidos** e **Envios realizados**. É o controle do repasse manual do saldo dos ingressos ao time. O Financeiro continua com o resumo, recebimentos, comissões e configurações. Não há integração de transferência bancária automática nesta operação.

## Operação

1. Configure favorecido, chave Pix e dia semanal em Financeiro → Configurações.
2. Em Saques, confira o saldo **Livre para novos pedidos** e clique em **Novo pedido de saque**. Informe valor, favorecido, dados de conferência e observações. O pedido recebe o estado Pendente e registra o administrador responsável.
3. Pedidos pendentes comprometem esse valor para novos pedidos, mas ainda não são contabilizados como dinheiro enviado. O saldo do time e a comissão da empresa permanecem calculados pelos recebimentos e envios efetivamente registrados.
4. No menu do pedido, use **Comprovantes e detalhes** para anexar documentos. Faça a transferência pelo banco e, depois, escolha **Registrar envio realizado**. Confira valor/favorecido, informe a referência única da transação e a data/hora. Também é possível anexar nessa janela ou depois do envio.
5. Ao confirmar, o sistema cria um único `ClubPayout`, vincula o pedido, muda o estado para Enviado e atualiza o saldo do time em uma transação. Não há baixa ao apenas criar o pedido ou anexar um arquivo. Enviar o saldo integral disponível deixa o saldo correspondente zerado; novas vendas/estornos continuam recalculando os valores. A comissão da empresa não é zerada por essa operação.

O mesmo pedido não pode produzir dois envios. Repetir uma requisição já concluída com o mesmo identificador devolve o resultado anterior. Referências de transferência continuam únicas no banco. O servidor confere novamente o saldo, a versão do pedido e os valores comprometidos com outros pedidos. Os endpoints antigos de registro de repasse também respeitam os pedidos pendentes.

Pedidos pendentes podem ser cancelados com motivo, liberando o valor comprometido. Pedidos enviados não são cancelados como pendentes. Para um lançamento de envio incorreto, **Corrigir registro** preserva o histórico, anula o registro contábil e deixa o pedido como Envio anulado. Isso não desfaz uma transferência no banco. Uma nova tentativa de repasse exige um novo pedido.

Devoluções e ajustes posteriores podem reduzir o saldo liberado abaixo dos pedidos existentes. A tela avisa e o servidor bloqueia envios sem cobertura. Confira/cancele os pedidos afetados antes de continuar; não há liberação automática de valor indisponível.

Os envios antigos continuam em **Envios realizados**, permitem anexos e conservam as referências e correções. A apresentação usa tabela no computador e cartões no celular. Pedidos possuem busca por favorecido, observação ou referência, filtro de situação e paginação. A lista atualiza periodicamente e após as operações.

## Comprovantes

- PDF, JPG/JPEG, PNG e WebP, até **5 MB por arquivo**, até **cinco anexos ativos por registro**.
- O servidor verifica limite, codificação base64 e assinatura inicial do formato; PDFs também precisam do marcador de fim. Essa validação de formato não substitui um antivírus ou uma análise completa do documento.
- Nome normalizado no servidor, extensão definida pelo tipo validado e hash SHA-256 para identificar conteúdo repetido. Reenviar o mesmo arquivo ativo para o mesmo registro retorna o anexo existente.
- Conteúdo em `PayoutAttachment.content`, no PostgreSQL. Não usa pasta pública nem depende do disco efêmero do contêiner. Inclua essa tabela na política de backup do banco; considere armazenamento de objetos quando o volume crescer.
- Listagens retornam metadados, sem bytes e sem hashes de senha. O conteúdo exige sessão de ADMIN ativa. Não há URL pública, e o token de acesso não fica na URL do arquivo.
- No navegador, **Baixar / abrir** baixa o arquivo. No celular, abre a folha de compartilhamento do sistema para escolher um aplicativo. O arquivo temporário fica no cache privado e tem limpeza programada após cinco minutos; se o app for encerrado antes, o sistema operacional gerencia o cache.
- Remover um anexo exige motivo, bloqueia novos downloads desse anexo e preserva bytes/metadados no banco para histórico. Não é exclusão física. Pedidos cancelados/anulados não recebem novos anexos na interface.
- Uploads e remoções registram ator, data, registro, hash/tamanho ou motivo na auditoria; anexos não alteram saldos.

As requisições de conteúdo e upload têm limite de tempo de 60 segundos no app. O limite JSON de aproximadamente 7,1 MB é exclusivo da rota de upload (base64 amplia o tamanho do arquivo); os demais endpoints continuam com os limites existentes. Se houver proxy de entrada, configure-o para aceitar esse tamanho nessa rota.

## API e permissões

Todas as rotas abaixo usam `/v1/admin/withdrawals` e exigem ADMIN autenticado. Torcedores, portaria e caixas não acessam pedidos nem comprovantes.

| Método | Sufixo | Operação |
|---|---|---|
| GET | `/summary` | Saldo liberado, comprometido em pedidos, livre para pedir e já enviado |
| GET | `/` | Lista paginada; `status`, `search`, `limit`, `offset` |
| POST | `/` | Pedido com valor, saldo esperado, favorecido, Pix, notas e `requestKey` |
| POST | `/cancel` | Cancela pedido pendente com `id`, `version` e `reason` |
| POST | `/send` | Registra transferência já realizada com versão, saldo esperado, referência, data, confirmação e chave idempotente |
| GET | `/attachments` | Metadados por `withdrawalId` ou `payoutId` |
| POST | `/attachments` | Anexo: um dos IDs acima, `name`, `mimeType`, `base64` |
| POST | `/attachments/content` | Conteúdo privado por `{id}` |
| DELETE | `/attachments` | Remove da consulta ativa por `{id, reason}` |

As rotas sem sufixo são `/v1/admin/withdrawals`, sem barra final. Para comprovantes de pedidos enviados, use `withdrawalId`; para envios antigos sem pedido, use `payoutId`.

## Instalação e arquivos

Execute `npm install`, `npm run db:generate` e `npm run db:deploy` no ambiente de destino e reinicie a API pelos comandos habituais. A migration `20261109040000_withdrawals_receipts` adiciona as tabelas, relações e restrições; não apaga repasses antigos. Não há nova credencial de gateway ou variável de armazenamento para os anexos.

O app usa os módulos Expo DocumentPicker, FileSystem e Sharing compatíveis com SDK 58. O plugin de Sharing foi incluído no `app.json`; builds nativos próprios precisam ser reconstruídos depois da instalação de módulos nativos. Referências: [DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/), [FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/), [Sharing](https://docs.expo.dev/versions/latest/sdk/sharing/).

Arquivos principais: `models/withdrawal.store.js`, `models/finance.store.js`, `lib/payout-attachments.js`, `validators/withdrawals.js`, controller/service de withdrawals; no app, `AdminWithdrawalsPanel`, `WithdrawalForms`, `PayoutAttachments` e `services/receipt-files.ts`. Dicionário: [banco/saques.txt](banco/saques.txt). Testes isolados: `apps/api/test/withdrawals.test.js`.
