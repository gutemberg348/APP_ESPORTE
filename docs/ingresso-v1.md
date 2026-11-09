# Ingresso V1 paralelo

Esta primeira fase cria somente a estrutura de dados do novo sistema de ingressos.

As tabelas usam o prefixo `ingresso_v1_` e são independentes das tabelas atuais
`Match`, `Sector`, `Ticket`, `TicketPayment` e demais entidades do fluxo legado.

## Entidades

- `ingresso_v1_estadios`
- `ingresso_v1_setores_estadio`
- `ingresso_v1_assentos`
- `ingresso_v1_templates_venda`
- `ingresso_v1_regras_setor_template`
- `ingresso_v1_categorias_template`
- `ingresso_v1_partidas`
- `ingresso_v1_alocacoes_setor_partida`
- `ingresso_v1_lotes`
- `ingresso_v1_pedidos`
- `ingresso_v1_ingressos`

Os campos e os enums da V1 estão em português. Valores monetários são
armazenados em centavos e os percentuais de desconto usam basis points
(`10000` representa 100%).

## Isolamento

As futuras rotas desta funcionalidade devem usar o namespace
`/v1/ingresso-v1`. Nenhuma rota ou tabela do sistema legado deve ser
reutilizada nesta fase.

Templates servem como base para a configuração de uma partida. Ao aplicar um
template, a configuração comercial deve ser copiada para as alocações e lotes
da partida; alterações posteriores no template não devem alterar uma partida
já configurada.
