# Gestão de ingressos e portaria V1

A gestão V1 usa estádios, setores, templates, partidas, alocações, lotes, pedidos e ingressos próprios (`ingresso_v1_*`). A portaria visível no admin e no acesso do funcionário agora é única e usa esse modelo.

## Preparação depois do pull

Na raiz, com o PostgreSQL já disponível:

```powershell
npm install
npm run db:generate
npm run db:deploy
```

Depois reinicie os processos da API e do Expo que você mantém abertos. Esses comandos não iniciam serviços. A migration `20261111010000_unified_gate_v1` foi aplicada no banco local em 11/11/2026 (29 migrations).

## Configuração e operação

1. **Partidas V1 → Editar:** habilite a portaria e defina abertura/fechamento opcionais. A partida precisa estar `PUBLICADA` ou `ESGOTADA`; estádio e setor precisam estar ativos. Sem horários personalizados, a janela vai de duas horas antes até quatro horas depois do início do jogo. Horários do formulário são os de Patos (UTC−3).
2. **Funcionários:** cadastre ou edite uma conta com perfil Portaria e use **Definir escala** para marcar as alocações de setor de cada partida V1. As escalas antigas não são convertidas por nome, para evitar autorizar o setor errado. Salvar sem marcações revoga todas as escalas V1 daquele funcionário.
3. No navegador, **`/portaria`** abre um acesso da equipe sem cadastro público. No aplicativo, o mesmo login comum encaminha contas `GATE` diretamente à portaria. O administrador também pode operar a portaria.
4. Selecione partida, setor físico e portão/catraca. Consulte o ingresso por câmera, arquivo de imagem do QR, leitor USB em modo teclado com Enter ou código digitado.
5. Confira titular e acomodação. **Consultar não libera entrada.** Somente **Confirmar e registrar uma entrada** consome o ingresso. O resultado informa um protocolo, responsável e portão. Cada ingresso V1 autoriza uma pessoa uma única vez.

A câmera do app lê QR e Code 128. No PC, o leitor USB precisa funcionar como teclado e o campo de código deve estar focado; a câmera web depende de suporte do navegador e de localhost/HTTPS. Para arquivo de imagem, o recurso lê QR (PNG/JPEG/WebP, até 10 MB); não faz OCR de código digitado nem lê código de barras de arquivo. No iOS, a leitura de imagem também usa somente QR. Se não conseguir ler, use o código impresso. Nenhuma imagem do leitor é enviada à API.

## Bilhete, validação e repetição

**Pedidos e ingressos V1 → Ver bilhete** gera o QR localmente, sem enviar seu conteúdo a serviço externo. Mostra também Code 128 e código aleatório de 16 caracteres hexadecimais, agrupados em quatro blocos (`ABCD-1234-EF56-7890` é apenas exemplo). O código de barras representa esse mesmo código sem separadores. A emissão V1 já devolve `codigoPortaria`.

O servidor exige funcionário ativo, perfil ADMIN/GATE, clube, partida, setor e escala compatíveis, janela de entrada aberta, pedido `PAGO` e ingresso `VENDIDO`. QR `INGV1` é conferido com HMAC-SHA256 (`TICKET_QR_SECRET`) e comparado ao registro e à acomodação no banco. Guarde esse segredo estável; alterá-lo invalida assinaturas anteriores.

A confirmação usa transação Serializable, mudança condicional `VENDIDO → UTILIZADO`, protocolo único por ingresso e chave única por funcionário/operação. Leituras concorrentes não criam duas admissões. Repetir uma operação retorna o mesmo protocolo como **já registrado**, sem autorizar outra passagem. Código manual e QR são credenciais de acesso; não compartilhe imagens de ingressos. A assinatura não impede copiar uma imagem, mas somente a primeira entrada válida pode consumir aquele ingresso.

Se a resposta for interrompida, o dispositivo guarda apenas identificadores da operação, sem QR/código. O operador consulta a confirmação no servidor; enquanto houver dúvida, mantém o acesso bloqueado. Não existe liberação offline. Erros de rede não são tratados como ingresso válido.

## Histórico e dados anteriores

**Histórico de portaria** consulta entradas confirmadas e leituras recusadas, com filtros por partida, setor, funcionário, período e protocolo. Nas confirmações também é possível buscar pelo nome do titular. `GATE` vê somente suas próprias operações; ADMIN vê as do clube. As recusas guardam o hash da credencial, nunca seu conteúdo.

Os ingressos V1 anteriores recebem códigos aleatórios pela migration, preservando QR e status. Um V1 que já estava `UTILIZADO` permanece bloqueado, sem inventar uma admissão histórica sem responsável. Novas confirmações aparecem em `AdmissionV1`.

Os ingressos do fluxo anterior (`Ticket`, `Match`, `Sector`) permanecem preservados. O botão **Consultar histórico anterior ao V1** mantém a consulta desses registros. O leitor antigo foi retirado; os antigos caminhos HTTP de leitura apontam para o motor V1 e exigem o novo contrato. **Não houve conversão automática dos ingressos antigos ou do checkout do torcedor para V1.** Antes de usar em um evento com ingressos emitidos no fluxo anterior, essa migração precisa ser planejada. O checkout/pagamento anterior continua separado; este trabalho não altera a integração do gateway.

## API e arquivos

Todas as rotas abaixo exigem Bearer JWT e limitam leituras por funcionário:

| Método | Rota | Função |
| --- | --- | --- |
| GET | `/v1/gate/v1/matches` | Partidas e setores autorizados |
| POST | `/v1/gate/v1/inspect` | Conferência sem consumo |
| POST | `/v1/gate/v1/admit` | Consumo único com protocolo |
| GET | `/v1/gate/v1/receipt` | Recuperação da confirmação |
| GET | `/v1/gate/v1/history` | Histórico `kind=ALLOW` ou `DENIED` |
| PUT | `/v1/admin/employees/assignments-v1` | Escala V1, somente ADMIN |

Consulta: `{ partidaId, alocacaoId, chaveQr }`. `chaveQr` aceita o token assinado ou o código manual. Confirmação acrescenta `catracaId` e `requestKey` (16–80 caracteres). Recibo usa os mesmos IDs e a mesma chave. Escala: `{ userId, allocationIds: [] }`. Histórico: `partidaId`, `alocacaoId`, `actorId`, `from`, `to` ISO UTC, `protocol`, `search`, `kind`, `limit` (até 100), `offset`.

- API: controller/validator/service `gate-v1`, store `src/models/gate-v1.store.js` e assinatura `src/lib/ingresso-v1-token.js`.
- App e admin: `GateV1Panel`, `GateV1History`, `TicketBarcode`, `gate-image.ts`, `gate-v1.ts`. Uma única tela de validação é reutilizada nos dois acessos.
- Banco: [dicionário dos campos e relações](banco/portaria-v1.txt).

## Exemplo local

```powershell
npm run ingresso-v1:seed-demo
```

O seed cria/reutiliza os cadastros **[TESTE LOCAL]**: template de setor numerado, estádio, setor, 20 assentos (bloco 101, fileiras A/B, cadeiras 1–10), template de venda, partida, dois pedidos gratuitos e dois ingressos (um disponível e outro utilizado). Usa inteira R$ 30, meia R$ 15 e cortesia R$ 0, em cotas 16/2/2. Não chama gateway nem reinicia serviços.

Só funciona em banco local, fora de produção, com `ADMIN_EMAIL` de administrador ativo. Abre explicitamente a portaria da partida fictícia antes do horário do jogo para permitir testes. Reexecução não reseta ingressos utilizados, não cria senhas de funcionários e não abre partidas reais. Configure uma escala para testar uma conta GATE.

## Verificação

`npm run check` e `npm run test:unit` verificam sintaxe/TypeScript e regras. Testes novos aplicam as migrations em PostgreSQL descartável (PGlite), preservação de V1 existentes, códigos, QR adulterado, clube/setor incorretos, escala revogada, conta inativa, janela fechada, estorno, duplicidade, chamadas concorrentes, recuperação de recibo, filtros e isolamento de histórico. Há teste de perda da disputa na atualização condicional e de codificação/decodificação de uma imagem QR. PGlite usa uma conexão; não substitui um teste de carga com múltiplas conexões no PostgreSQL real.

Câmera, leitor USB e arquivo real em Android/iOS/PC precisam da conferência nos equipamentos do evento. Não foram acionados serviços ou dispositivos físicos nesta alteração.
