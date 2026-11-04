# Próximas etapas

1. Validar as telas em Android e iOS físicos, ajustar detalhes visuais em relação à referência e definir ícone/splash oficiais.
2. Administração de jogos, setores, planos, associações, contas, recebimentos e portaria implementada. Gestão de vendas com filtros, totais e disponibilidade e histórico de entradas/recusas com protocolos implementados e testados no PostgreSQL; ver [relatórios administrativos](admin-reports.md). Falta ampliar gestão de parceiros/recompensas e validar a operação em aparelhos.
3. Integrar gateway de pagamento com webhook autenticado, idempotência e transação de emissão do ingresso; definir cancelamento e reembolso.
4. Leitor e consumo de QR de ingresso implementados. Validar em aparelho e integrar à operação da portaria; o leitor do QR de carteirinha continua pendente.
5. Implementar resultado do jogo, apuração do palpite e regras de indicação. Extrato, check-in diário e resgates transacionais já estão implementados; falta sua validação em PostgreSQL nesta revisão.
6. Conectar Naça TV, boutique, conteúdo oficial, quiz, votação, atendimento e notificações.
7. JWT, refresh rotativo, logout-all, troca de senha autenticada e gerenciamento de sessões implementados. Recuperação de senha por mensagem, verificação de e-mail, MFA e dependentes continuam pendentes. Nome, cidade e contato já podem ser atualizados.
8. Preparar deploy público, monitoramento, backups e gerenciamento de segredos.

Cashback/Pix: modelo B, caixa, carteira monetária, vinculação de QR, simulação e estorno total implementados; modelo A preparado com habilitação por oferta. Próximo passo é escolher o gateway, criar onboarding de recebedores, outbox para cobranças, webhook autenticado/conciliação e gasto do saldo. Ver [escopo e decisões](cashback-pix.md).

## Dependências

O primeiro `npm audit` identificou 26 alertas (7 moderados, 19 altos), principalmente nas ferramentas transitivas do Expo/Metro e Prisma CLI. `npm audit fix` não conseguiu resolver mantendo as versões compatíveis; o npm propôs versões antigas de Expo/React Native e encontrou conflito. O conjunto compatível com Expo foi preservado, sem `--force`. O lockfile registra as versões utilizadas. Revisar as atualizações e os avisos antes de disponibilizar um ambiente público.

A instalação desta revisão reportou 22 alertas (7 moderados e 15 altos). Não foi aplicado downgrade forçado de dependências.

Os controles HTTP e a sessão já têm testes; funcionalidades com dinheiro, recompensas ou validação de acesso precisam de suas regras e integrações antes de serem usadas operacionalmente.
