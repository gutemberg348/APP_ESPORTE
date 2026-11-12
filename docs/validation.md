Atualização de conexão — 09/11/2026: a configuração de desenvolvimento recomendada é `EXPO_PUBLIC_API_URL=http://localhost:3333/v1`. O IP antigo 192.168.0.100 mudou para 192.168.0.101; os valores abaixo são históricos. O host atual do Expo/navegador é usado em desenvolvimento, e as origens de rede deste computador são aceitas apenas nas portas locais autorizadas. `npm run api:check` verifica API e banco; para uma tela com configuração antiga, use Ctrl+F5 ou `npm run web:clear`. Não é necessário reiniciar o PostgreSQL quando `/health` e `/ready` já respondem 200.

# Validação da revisão naca-digital — 14/10/2026

## Identidade inicial do Esporte — 03/11/2026

- Paletas vermelha/vinho, cabeçalho, navegação, início, carteira e textos de clube adaptados à referência fornecida.
- Perfis visuais Esporte/Nacional centralizados no JSON compartilhado e selecionados por `EXPO_PUBLIC_CLUB`; configuração Expo de ambos conferida.
- Escudo gerado por edição image_gen para remover fundo externo, salvo no workspace e inspecionado. PNG RGBA com alpha 0 nos cantos externos.
- TypeScript e 15 testes do app passaram. Exportação iOS passou com 2.964 módulos e assets em `.artifacts/esporte-ios`.
- Sem alterações nos registros do banco ou início de serviços/prévia. Conferência visual no aparelho ainda pendente.

[Arquivos, seleção do clube e limites da configuração visual](identidade-clubes.md).

## Correção do cadastro no iPhone — 03/11/2026

- Erro reportado: impossibilidade de conectar à API. O app usava `localhost:3333`, que no iPhone aponta para o próprio telefone. O endereço explícito local foi corrigido para `192.168.0.100:3333`; o app também resolve localhost pelo host do Expo em desenvolvimento nativo.
- API já iniciada pelo responsável: `/health` e `/ready` responderam 200 pela rede local. O banco estava acessível, mas só tinha a migration inicial; faltavam colunas do perfil/roles e tabelas de refresh e portaria.
- `npm run db:prepare` executado com sucesso: Prisma gerado, seis migrations pendentes aplicadas (sete no total) e administrador configurado. Nenhum serviço foi iniciado pelo agente.
- Cadastro HTTP real pela API existente retornou 201; perfil autenticado e login retornaram 200; cadastro duplicado retornou 409 `EMAIL_IN_USE`. Somente a conta temporária exclusiva desta verificação foi removida, junto às suas sessões por cascade. Nenhuma credencial ou token foi exibido.
- Transporte do app diferencia erro de rede, timeout, resposta inválida e rejeição da API; detalhes Zod e protocolo ficam disponíveis. Banco sem schema atualizado retorna 503 específico.
- Passaram 15 testes isolados do mobile, 13 testes HTTP da API, sintaxe/TypeScript e `expo install --check`. A conectividade do iPhone deve ser conferida no aparelho após recarregar o Expo com a URL atualizada.

As seções abaixo registram verificações anteriores; as referências a migrations ainda não aplicadas descrevem o estado daquela data.

## Expo SDK 58 — 03/11/2026

- App e lockfile atualizados para Expo 58.0.22, React Native 0.88.1, React 19.3.0 e módulos recomendados pelo SDK.
- `expo install --check`: dependências atualizadas; `expo-doctor`: 20/20 checks passaram.
- `npm run check`: sintaxe e TypeScript passaram. Foi ajustado o caso `undefined` retornado por `Linking.getInitialURL` nas novas tipagens.
- 9 testes isolados do mobile passaram. Não foi iniciada a API, o banco ou uma prévia do app.
- Exportação iOS passou: 2.957 módulos, assets e bundle Hermes gerados em `.artifacts/sdk58-ios`, sem abrir o app no aparelho.
- Comando de reinício com cache limpo preparado: `npm run dev:mobile:clear`. Validação nativa no iPhone continua pendente.

[Versões e abertura pelo Expo Go 58](expo-sdk58.md).

## Migração HTTP para Express — 03/11/2026

- Express 5.3.0 instalado na API, com Router, middlewares de contexto/CORS/acesso e tratamento central de erros.
- `npm run check`: sintaxe JavaScript e TypeScript passaram.
- `npm run test:unit`: 72 testes da API e 9 do app passaram (81 no total). Incluem 13 testes HTTP executados com streams Node em memória, sem listener, rede ou banco.
- As 66 rotas de negócio foram montadas no Express; as 60 rotas privadas rejeitaram requisições sem sessão antes dos controllers e do parser de JSON.
- `npm ls express --workspace @nacional/api` confirmou Express 5.3.0. Package e lockfile atualizados.
- Nenhuma migration é necessária para esta alteração. Integração com PostgreSQL, execução em aparelho e validação do deploy continuam pendentes. App, API, Docker e prévia não foram iniciados.

[Estrutura e contratos da migração](express-migration.md).

## Central de compra no app — 30/10/2026

- Catálogo com busca e filtro, setores/vagas, revisão de compra, carteira com estados/prazos, cancelamento não pago e QR/código de portaria implementados.
- `npm run test:unit`: 59 testes da API e 9 do mobile passaram (68 no total), sem listener ou PostgreSQL. Os novos testes cobrem revisão sem reserva, cálculo do total, mudança de preço/desconto, lotação após consulta, prazo durante espera, gratuidade, duplicidade, auditoria e estados do catálogo.
- `npm run check`: sintaxe JavaScript, testes/scripts da API e TypeScript do app passaram. As 66 rotas foram importadas e os guards admin/portaria conferidos sem abrir um servidor.
- O fluxo HTTP administrativo foi preparado para consultar `/tickets/quote` e comparar `expectedTotalCents`. A integração com PostgreSQL não foi executada. Esta etapa não exige migration nova; as migrations preparadas anteriormente continuam necessárias.
- Nenhuma execução visual em navegador/aparelho foi feita. Não foram iniciados app, API, Docker ou prévia. O pagamento permanece por conferência externa, com gateway pendente de escolha.

[Jornada do torcedor e contrato do checkout](ticket-purchase-app.md).

## Ingressos com QR curto e portaria por partida/setor — 30/10/2026

- `npm run test:unit`: 43 testes de backend e 4 de sessão mobile passaram (47 no total).
- Novos testes exercitam assinatura/tipo/prazo do ingresso, partida/setor, recibo/titular, janela, inspeção sem autorização, versão consumida, repetição e rollback. A persistência desses testes é em memória atômica; eles não comprovam SSI/concor­rência do PostgreSQL.
- `npm run check` passou. Schema Prisma válido e cliente gerado.
- Conectividade PostgreSQL novamente recusada (`ECONNREFUSED`), então a migration `20261030020000_secure_ticket_entry` não foi aplicada.

O teste PostgreSQL de dois operadores disputando o mesmo QR enquanto ainda há lugares foi preparado em `ticket-entry-integration.test.js`. O fluxo HTTP administrativo foi atualizado para o novo QR. Nenhum teste com banco, preview web ou execução em aparelho foi realizado; app, API e Docker não foram iniciados. [Estado, proteção e limites](ticket-security.md).

## Autenticação JWT — 30/10/2026

- `npm run check`: JavaScript, scripts/testes da API e TypeScript mobile passaram.
- `npm run test:unit`: 34 testes de backend e 4 da máquina de sessão mobile passaram (38 no total), sem iniciar servidores ou consultar PostgreSQL.
- Testes novos cobrem assinatura, expiração, issuer/audience/algoritmo/tipo, rejeição de adulteração, cadastro, login, rotação/reutilização de refresh, revogação imediata, logout-all, troca de senha e concorrência de renovação no app.
- `prisma validate` e `db:generate`: schema válido e cliente gerado.
- As 54 rotas foram importadas e os guards administrativos conferidos, sem listener HTTP.
- A verificação de conectividade encontrou novamente `ECONNREFUSED` no PostgreSQL configurado. A migration `20261030010000_jwt_sessions` foi preparada, mas não aplicada. Nenhuma conta/senha foi alterada no banco.

O teste de autenticação com PostgreSQL foi adicionado a `test:integration` e não foi executado. Ele verifica sessão/refresh reais, replay, permissões atuais, logout, senha e suspensão. A nova tela Segurança não foi executada em aparelho. `setup` gerou segredos JWT locais sem imprimir seus valores. API, app e Docker não foram iniciados. [Contrato e aplicação da migration](authentication.md).

## Contas reais e administração de ingressos

O modo padrão foi alterado para API real. A implementação inclui cadastro/login, roles USER/ADMIN, publicação/janela de jogos, setores/capacidade, emissão por confirmação manual, cortesias, QR de ingresso, entradas parciais e auditoria.

- `npm run check`: sintaxe JavaScript e TypeScript passaram.
- Schema Prisma validado e cliente gerado.
- `npm run test:unit`: 22 testes isolados passaram, incluindo autorização, janela, recebimento, QR e consumo de entradas. Um teste identificou que PATCH aplicava defaults indevidos; os defaults foram removidos do schema de atualização, e o teste passou após a correção.
- `db:deploy` foi tentado; a conexão PostgreSQL falhou. Consulta independente confirmou `ECONNREFUSED` em `localhost:55432`.

Migration `20261014030000_admin_ticketing` criada e **não aplicada**. O bootstrap do administrador também não foi executado no banco indisponível. O teste `admin-integration.test.js` cobre contas reais, RBAC, publicação, disputa por capacidade, pagamento duplicado, entradas concorrentes, cortesia, associação e suspensão; está preparado e **não foi executado**. Nenhum app, API, Docker ou PostgreSQL foi iniciado pelo agente. Não houve conferência visual nesta revisão.

Quando o responsável iniciar o banco, execute `npm run db:prepare` e depois `npm run test:integration` em ambiente de desenvolvimento. [Instruções completas](real-accounts-ticketing.md).

## Revisão visual e cashback anterior

Nesta revisão não foram iniciados app, API, PostgreSQL, Docker ou prévia no navegador, conforme solicitado. Foram executados:

- `npm run check`: sintaxe JavaScript da API e TypeScript do app passaram.
- `prisma validate` e `npm run db:generate`: schema válido e cliente Prisma 7.10.0 gerado, sem consultar o banco.
- `node --test apps/api/test/crypto.test.js apps/api/test/business-rules.test.js apps/api/test/payment-rules.test.js`: 16 testes passaram, sem abrir portas ou conectar ao PostgreSQL. Cobrem criptografia, validadores, limites, fuso do check-in, preço/quantidade, capacidade, repetição de transações, split em centavos, vinculação, validade e eventos de estorno fora de ordem.

A migration `20261014010000_engagement_and_reservations` foi escrita e **não aplicada**. O teste de integração foi ampliado para reservas expiradas/capacidade, preferências, interesse na escolinha, check-ins e resgates concorrentes; **não foi executado nesta revisão**. O aspecto visual precisa ser comparado com a referência em Android/iOS e nas telas pequenas. A checagem TypeScript não comprova equivalência visual.

A migration `20261014020000_cashback_payments` foi gerada offline por comparação dos schemas e recebeu constraints de valores/divisão. Também **não foi aplicada**. Caixa, leitor de QR e carteira passaram na checagem TypeScript, mas não foram executados em aparelho/navegador. O novo teste financeiro com PostgreSQL está preparado e não foi executado. O gateway real continua desabilitado.

Para validar quando o ambiente for iniciado pelo responsável:

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
npm run test:integration
```

O teste de integração usa o banco configurado de desenvolvimento, abre um servidor de teste temporário e remove somente os registros que cria. Nunca use dados de produção.

## Histórico da base anterior — 13/10/2026

Os resultados abaixo pertencem à implementação anterior baseada em `base.js`; não validam as mudanças desta revisão.

Executado no ambiente Windows do projeto:

| Verificação | Resultado |
| --- | --- |
| `npm run check` | Sintaxe da API e TypeScript mobile válidos |
| `prisma validate` e `prisma generate` | Schema válido, cliente 7.10.0 gerado |
| Migration inicial | Aplicada ao PostgreSQL 17 em Docker |
| Seed | Conta, associação, plano, jogo, setores e parceiros criados |
| `npm test` | 10 testes passaram; teste com banco é executado separadamente |
| `npm run test:integration` | Fluxo completo com PostgreSQL passou |
| `expo install --check` | Dependências compatíveis com SDK 57 |
| Exportação Expo | Bundles Android, iOS e web gerados |
| Prévia web em Chromium | Cinco abas, dois temas, filtro, perfil, palpite, ingresso e modo estádio passaram |
| App conectado à API | Login, dashboard real, QR dinâmico e logout passaram no navegador |
| Visual responsivo | Capturas em 390 × 844 e 320 × 740 inspecionadas |
| Build Docker API | Imagem criada com `npm ci` e geração Prisma |
| API no container | Migration deploy e `/ready` passaram |

Os testes HTTP cobrem autenticação, CORS, validação, limites de corpo e ocultação de erros internos. A integração verifica cadastro/login, proteção da carteirinha, sessão armazenada em hash, desconto, ingresso pendente, duplicidade, palpite, atualização de perfil, saldo protegido, indicação, expiração da associação e revogação por logout.

As capturas e scripts temporários da revisão estão em `.artifacts/`, ignorados pelo Git e pelo Docker. A prévia web é uma conferência adicional; ainda falta execução em Android/iOS físicos e geração de APK/IPA. Integrações futuras estão descritas no [roadmap](roadmap.md). Os alertas encontrados no audit estão registrados nesse mesmo documento.


Revisão de configurações comerciais (09/11/2026): `npm run check` e `npm run test:unit` passaram com 219 testes (187 API + 32 app). Os testes de configurações usam PostgreSQL descartável e cobrem autorização, edição concorrente, pontos configuráveis, pausa do check-in, custo histórico dos resgates, estoque de recompensas, prazos de reserva/cotação, limite de pendências, política financeira preservada, recebedores distintos por ambiente e cobranças existentes protegidas após editar o parceiro. A migration aditiva 20261109050000_business_configuration foi aplicada ao banco local; `prisma migrate status` confirmou as 15 migrations atualizadas. Nenhum serviço ou container foi iniciado/reiniciado pelo agente nesta revisão. Fluxos em dispositivo físico e pagamentos com credenciais reais não foram executados nesta etapa.


Revisão do login e endereço local (09/11/2026): TypeScript e os 36 testes do app passaram. Regressões cobrem IPv4 privado antigo em modo local, preservação de APIs separadas/produção, resolução por requisição sem repetir POST de login, diagnóstico sem credenciais, identidade da API, falha do banco e prazo de diagnóstico. As verificações na API existente retornaram 200 em `/health` e `/ready` por localhost e pelo IP atual do computador, e 401 na rota de login com uma conta inexistente de diagnóstico; o IP antigo da captura não respondeu. Também foi observada uma conexão encerrada durante uma troca de processo Node em modo watch; uma nova tentativa no processo estável respondeu normalmente. Não foi comprovada uma queda causada pelo PostgreSQL. Nenhum serviço ou container foi iniciado/reiniciado nesta revisão. A automação da aba ficou indisponível e o login com a conta real não foi executado.


Revisão de estabilidade da API (10/11/2026): `npm run check` e `npm run test:unit` passaram com 226 testes (189 API e 37 app). Casos novos verificam POST JSON público sem sessão/cota de login, validação estrita do corpo, CORS e exposição do protocolo, registro de requisição interrompida sem segredos, e rejeição de diagnóstico positivo quando GET funciona e POST falha. O login administrativo com as credenciais locais configuradas retornou 200, o perfil autenticado 200 e a revogação da sessão de diagnóstico 204. O painel autenticado foi observado na aba do navegador. A API encontrada estava em watch e o usuário forneceu log de reinício; o comando padrão passou a processo estável, com watch optativo. Nenhum container, servidor adicional, migração ou seed foi executado. A troca do processo já aberto em watch para o novo comando cabe ao usuário: Ctrl+C no terminal da API e `npm run dev:api`. Referência e limites da conclusão em [estabilidade da API](api-estabilidade.md).


Upload de fotos de produtos (10/11/2026): `npm run check` e a suíte de 229 testes passaram (192 API + 37 app). Os três novos testes de imagens verificam decodificação JPG/PNG/WebP, tamanho, formato real, conteúdo truncado/adulterado, orientação, remoção de EXIF, concorrência de processamento, permissão ADMIN antes da leitura do corpo, persistência PostgreSQL, deduplicação, resposta binária pública/cache, referências no produto e preservação de URLs históricas. A validação de base64 no tamanho máximo também passou em execução específica posterior. A migration 20261110120000_shop_image_uploads foi aplicada ao banco local (28 aplicadas) e o cliente Prisma foi gerado. A dependência Sharp foi instalada. A API já aberta ainda respondeu com a versão anterior para a nova rota; cabe ao responsável reiniciar somente o processo da API e atualizar a página. Nenhum servidor ou container foi iniciado/reiniciado nesta etapa. Upload pelo seletor em dispositivo físico ainda não foi conferido.


Revisão da portaria unificada V1 (11/11/2026): `npm run check` passou e `npm run test:unit` passou com 239 testes (199 API + 40 app). Os testes novos aplicam todas as migrations em PGlite, verificam backfill de códigos sem reset de status, autorização de ADMIN/GATE, escala revogada, conta inativa, clube/partida/setor, assinatura adulterada, janela fechada, pagamento pendente/estornado, consumo único, idempotência e recibo, filtragem e privacidade do histórico. Chamadas concorrentes usam a conexão única do PGlite; um teste adicional simula perda na atualização condicional. Não substituem carga em PostgreSQL com múltiplas conexões. Uma imagem QR codificada localmente foi decodificada com o leitor usado no navegador.

A exportação Expo para web, Android e iOS concluiu com sucesso, em `.artifacts/gate-v1-export-20261111` (ignorado pelo Git). Não é APK/IPA nem teste físico. A migration aditiva `20261111010000_unified_gate_v1` foi aplicada ao PostgreSQL local (29 migrations). Consulta local confirmou dois ingressos V1 com códigos válidos, preservados nos estados VENDIDO e UTILIZADO; nenhuma entrada fictícia foi criada. A consulta administrativa de partidas e a resposta de funcionários com escalas V1 funcionaram com o banco atualizado. Não foram iniciados/reiniciados API, Expo Go ou containers; a exportação usou somente o processo temporário de compilação. Câmera, leitor USB e imagens de dispositivo físico ainda precisam de conferência no equipamento. O checkout e os ingressos do fluxo anterior não foram convertidos ao V1; a interface de leitura antiga foi retirada, com histórico anterior preservado para consulta. Operação e limites: [portaria V1](ingresso-v1.md).


Revisão Pix Sicredi (11/11/2026): 256 testes passaram em `npm run test:unit` (216 API + 40 app), sem ignorados. A nova suíte testa mTLS real em HTTPS local com certificado descartável, compatibilidade de chave, timeout e sanitização, OAuth/cache por escopo, URLs e configuração, TXID persistido antes da cobrança, recuperação sem duplicação, notificação sem crédito direto, consulta de E2E/valor/chave, leitura autorizada, financeiro com tarifa estimada, devolução idempotente, devolução parcial/externa, pagamento tardio, estoque/retorno de produto uma única vez e isolamento Asaas/Sicredi. As migrations completas passaram em PGlite. A suíte usa uma conexão e não substitui carga concorrente em PostgreSQL real.

Cliente Prisma foi gerado. A aplicação da migration local não concluiu: PostgreSQL em localhost:55432 recusou conexão (ECONNREFUSED). A migration 20261111020000_sicredi_pix está preparada; nenhum container ou serviço foi iniciado/reiniciado. Não foram realizadas autenticação ou operações financeiras na conta Sicredi real. Não houve cadastro/alteração de webhook no banco. Preenchimento das credenciais e validação autenticada estão descritos em [Pix Sicredi](sicredi-pix.md).


Retirada operacional do Asaas (11/11/2026): npm run check e 257 testes passaram (217 API + 40 app). PAYMENT_MODE=asaas é rejeitado, o worker não pode ativar o provedor retirado e um QR histórico não é oferecido para pagamento. A verificação de 122 módulos alcançáveis pelo servidor/CLI não encontrou importação da integração Asaas. Variáveis removidas dos ambientes/modelos/Compose/setup; formulário de wallets, serviço/controller e CLI antigos removidos. Segredos anteriores arquivados em .secrets/legacy, fora do Git e do contexto Docker. Nenhum dado bancário histórico, migration aplicada ou serviço foi alterado/reiniciado.


Preparação da VPS com três containers (11/11/2026): npm run check e 259 testes passaram (219 API + 40 app). Compose validado sem iniciar serviços: exatamente postgres/api/web, portas publicadas em loopback, certificados somente na API em modo leitura, argumentos do frontend exclusivamente públicos e gateway da rede coincidente com o proxy confiável. Testes HTTP verificam limite independente por cliente atrás do proxy, rejeição de IP forjado por conexões não confiáveis e confiança apenas no gateway exato. O setup foi conferido em pasta temporária para geração de senha de banco, preservação de segredos/administrador e UID/GID do dono dos certificados.

A exportação web concluiu em .artifacts/vps-web-20261111 com a URL https://api-esporte.testes-techcode.shop/v1; os segredos privados do ambiente não aparecem nos bundles. Os dois domínios ainda retornaram ENOTFOUND na conferência de DNS. Imagens Docker e nginx -t não foram executados nesta preparação; requerem conferência no servidor. Nenhum container, Nginx, PM2 ou serviço da VPS foi iniciado/reiniciado. Guia: docs/vps-docker.md.


Compatibilidade de imagens na VPS (12/11/2026): o log enviado pelo operador confirma PostgreSQL acessível e 30 migrations aplicadas; a API encerrava ao importar o sharp 0.35.5 porque o binário pronto exige x86-64-v2. A imagem agora compila sharp/libvips 8.18.7, confere o SHA-256 da origem e inclui libwebpdemux/libwebpmux no runtime. O teste de build carrega explicitamente o addon local para impedir que um fallback pré-compilado esconda bibliotecas ausentes. Cinco testes de setup/upload/persistência passaram e npm run check --workspace @nacional/api passou. O build de verificação concluiu com JPEG/PNG/WebP, rotação EXIF e remoção de metadados como usuário node, incluindo execução sob QEMU com CPU qemu64 (sem x86-64-v2). Somente a verificação local trocou o CDN por outro espelho oficial do Alpine devido a erros de download e adicionou QEMU; o emulador não faz parte da imagem de produção. Evidências em .artifacts/sharp-native/docker-build-cpu-check.log e tests.log. Não houve início/reinício da API ou serviços nem alterações na VPS pelo agente; a reconstrução e a confirmação de /ready na VPS ainda dependem do operador.
