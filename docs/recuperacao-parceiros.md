# Recuperação de senha, parceiros e equipe

## Recuperação de acesso

O app e o login administrativo possuem **Esqueci minha senha**. O email abre `/reset-password#token=...&portal=...`; o token fica no fragmento e não é enviado na URL das requisições HTTP. A página valida o link antes de aceitar a nova senha, que deve ter de 12 a 128 caracteres e possui botão para mostrar/ocultar.

Preencha **apps/api/.env** para executar a API pelo Node. Para o perfil `full` do Docker, os mesmos campos ficam no **.env da raiz**:

```dotenv
SMTP_ENABLED=true
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu-email@dominio.com
SMTP_PASSWORD="senha-ou-senha-de-aplicativo"
SMTP_FROM_EMAIL=seu-email@dominio.com
SMTP_FROM_NAME="Sócio Esporte"
PASSWORD_RESET_PUBLIC_URL=https://seu-app.com/reset-password
PASSWORD_RESET_TTL_MINUTES=15
MAIL_DATA_SECRET=segredo-aleatorio-exclusivo-com-pelo-menos-64-caracteres
MAIL_WORKER_INTERVAL_MS=3000
```

`SMTP_SECURE=true` usa TLS desde a conexão (normalmente porta 465). Na porta 587, use `false`: STARTTLS continua obrigatório e os certificados são verificados. Use credenciais SMTP do seu provedor; uma senha de aplicativo pode ser necessária. Segredos com `$`, `#` ou espaços precisam ser corretamente delimitados no dotenv. Nenhum campo SMTP deve usar o prefixo `EXPO_PUBLIC_`.

`npm run setup` prepara um `MAIL_DATA_SECRET` aleatório sem alterar credenciais existentes ou habilitar o envio. O segredo cifra a fila de emails e precisa ser estável entre reinicializações e instâncias da API. Reinicie a API após alterar o ambiente. Com SMTP desabilitado, a recuperação informa indisponibilidade sem consultar a existência da conta.

`PASSWORD_RESET_PUBLIC_URL` precisa apontar para a **aplicação web**, não para a API. No celular, `localhost` aponta para o próprio aparelho: use a URL pública ou o IP de rede do computador com a versão web aberta. Em produção, HTTPS é obrigatório. A hospedagem estática precisa reescrever `/reset-password`, `/admin` e `/app` para `index.html`. A redefinição funciona no navegador do email; o aplicativo também reconhece `nacional://reset-password#token=...&portal=app`, caso o domínio seja configurado para abrir links no app. Não há associação automática de domínio universal configurada nesta entrega.

### Segurança e processamento

- Segredo aleatório de 256 bits; a tabela de tokens guarda somente SHA-256. O conteúdo necessário ao envio fica cifrado com AES-256-GCM na fila.
- Validade padrão de 15 minutos; consumo transacional de uso único. Um novo link invalida os anteriores.
- Conta desativada, senha ou email alterado invalidam o link. Sucesso encerra todas as sessões e não faz login automaticamente.
- Resposta pública genérica, piso de tempo de resposta, limite por IP, intervalo mínimo de 60 segundos e até cinco pedidos por conta por hora. Não expõe email, usuário ou token ao validar.
- SMTP roda fora das transações. A fila tem lease, tentativas espaçadas e limite de cinco falhas; remove o conteúdo cifrado após envio, descarte ou falha definitiva.
- Uma falha entre o aceite SMTP e a gravação pode repetir o mesmo email. O `Message-ID` é estável; o token continua de uso único. SMTP não garante entrega exatamente uma vez nem chegada à caixa de entrada.
- `npm run auth:cleanup --workspace @nacional/api` remove recuperações vencidas há mais de 30 dias e as entregas relacionadas. Agende esse comando na infraestrutura.

No admin, **Email e acesso** mostra remetente, URL, validade, totais da fila e verifica a autenticação SMTP sem enviar uma mensagem de teste. A recuperação de uma conta também está no menu de **Torcedores** e **Funcionários**; o destino é sempre o email já cadastrado. Não existe edição de senhas SMTP pelo navegador.

### Rotas

| Método | Rota `/v1` | Acesso |
|---|---|---|
| POST | `/auth/forgot-password` | Público: `{email, portal: APP ou ADMIN}` |
| POST | `/auth/reset-password/validate` | Público: `{token}` |
| POST | `/auth/reset-password` | Público: `{token, password}` |
| POST | `/admin/users/recovery` | ADMIN: `{userId}` |
| GET | `/admin/email` | ADMIN: situação sem segredos |
| POST | `/admin/email/verify` | ADMIN: verifica SMTP |

## Parceiros e ofertas

Em **Parceiros**, cadastre/edite nome, categoria, benefício em destaque, ícone, descrição, condições, endereço, telefone com máscara e site HTTPS. A lista tem busca, filtros, paginação e arquivamento com confirmação. Restaurar um parceiro o mantém inativo e não reabre permissões de caixa.

Cada parceiro tem um `Merchant` associado. A oferta financeira `MerchantOffer` pertence ao clube de `TENANT_SLUG` e permite configurar cashback, comissão, ativação e QR fixo. Cashback e comissão somados não podem exceder 100%. Alterações afetam novas cobranças; os valores das cobranças anteriores continuam registrados. Para pagamentos reais configure a wallet recebedora em `ASAAS_MERCHANT_WALLETS` conforme [a integração Asaas](asaas.md). O identificador do `Merchant` aparece no painel. Essa comissão é das vendas do parceiro; as configurações dos ingressos continuam na seção Financeiro.

O menu **Ofertas e caixas** permite criar e editar múltiplos benefícios, condições e datas. Desativar uma oferta a retira da apresentação pública sem apagar seu histórico. O dashboard e `/partners` expõem apenas parceiros ativos não arquivados e benefícios ativos dentro da janela. A lista pública omite funcionários e detalhes internos do caixa. As categorias do app são obtidas dos parceiros cadastrados.

O arquivamento é lógico: o parceiro some do app, seu caixa é desativado e suas autorizações são removidas, preservando vendas e registros financeiros. Alterações administrativas ficam em `AuditLog`. Parceiros e ofertas verificam `updatedAt` para recusar formulários antigos.

Rotas administrativas: GET/POST/PATCH/DELETE `/admin/partners`, POST `/admin/partners/restore`, POST/PATCH `/admin/partners/benefits`, PUT `/admin/partners/operators`. Os corpos de alteração exigem os identificadores e `updatedAt` retornados na consulta.

## Funcionários e permissões

O menu de Torcedores agora tem **Editar torcedor**; contas da equipe exibem **Editar funcionário**. Funcionários também abre o mesmo formulário de edição. A janela permite alterar nome, email, telefone com máscara, cidade, situação e, para a equipe, perfil de acesso. A associação continua na ação Gerenciar associação.

Habilite **Definir nova senha** para preencher uma senha de 12 a 128 caracteres, com botão de mostrar/ocultar. Com a opção desativada, a senha atual é preservada. Os dados e a senha são gravados juntos em transação: conflito de email ou formulário desatualizado cancela toda a alteração. Email, senha, perfil ou desativação encerram as sessões e invalidam recuperações anteriores. Alterar seu próprio email ou senha exige entrar novamente.

GET `/admin/users/detail?userId=...` carrega os dados atuais e `updatedAt`; PATCH `/admin/users` edita contas sem aceitar campos de privilégios, pontos ou valores financeiros. A edição da equipe utiliza PATCH `/admin/employees`, com as mesmas regras de credenciais e permissão específica para alterar o perfil. Somente ADMIN acessa essas operações. A senha atual e o hash nunca são retornados; a auditoria registra apenas quais dados mudaram e se houve troca de senha. Nenhuma tabela nova é necessária para esta edição.

**Funcionários** inclui administradores, portaria e caixas. Permite cadastrar, editar nome/email/telefone/perfil, ativar/desativar, trocar a senha com botão de visibilidade e enviar recuperação por email. O cadastro público continua criando somente torcedores.

| Perfil | Operação |
|---|---|
| ADMIN | Painel completo, inclusive gestão da equipe e parceiros |
| GATE | Portaria exclusivamente nas partidas/setores da escala |
| CASHIER | Login comum do app abre o caixa; somente parceiros autorizados |

Para caixas, crie a conta em Funcionários e marque-a em Parceiros → Ofertas e caixas. Para portaria, use Definir escala. Administradores também podem ser autorizados como operadores. A remoção de uma autorização vale na próxima requisição, sem depender de um novo JWT.

Alterar perfil remove escalas e permissões anteriores. Desativar, alterar email, trocar perfil ou senha encerra sessões. O admin não pode remover seu próprio acesso por esse formulário, e o último administrador ativo é protegido. As contas ficam desativadas, sem exclusão física que comprometeria auditorias ou vendas.

## Arquivos e validação

- Prisma e SQL: `apps/api/prisma/schema.prisma`, migration `20261109030000_recovery_partners_staff`.
- API: controllers/services de `password-recovery`, `partner`, modelo transacional `password-recovery.store.js`, `partner.store.js`, `staff.model.js`, utilitário SMTP `lib/mail.js`.
- App/admin: `PasswordRecoveryForm`, `PasswordResetScreen`, `AdminPartnersPanel`, `PartnerForm`, `PartnerBenefitForm`, `AdminEmailPanel`, `EmployeePanel`, `CashierScreen`.
- Testes: `apps/api/test/recovery-partners.test.js`, testes existentes de autenticação/portaria e verificações TypeScript.
- Dicionário das tabelas: [recuperacao-parceiros.txt](banco/recuperacao-parceiros.txt).

Aplicação em outro ambiente: `npm install`, `npm run db:generate`, `npm run db:deploy`, ajuste o SMTP e reinicie a API. O worker inicia junto à API. Não foram cadastradas contas fictícias nem enviados emails reais durante a implementação; a entrega SMTP real depende das suas credenciais e da configuração do domínio.

Referências: [SMTP do Nodemailer](https://nodemailer.com/smtp), [recuperação de senha da OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
