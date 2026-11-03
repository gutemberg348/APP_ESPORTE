# Administração no navegador

Execute `npm run web` e entre com uma conta ADMIN. A administração possui apresentação própria em todas as larguras: a partir de 1024 px, mostra o menu lateral fixo e recolhível; abaixo disso, o botão de menu abre uma gaveta lateral. O app nativo usa as mesmas regras de largura.

O painel usa Inter nos textos e campos, fundo cinza, superfícies brancas, bordas discretas e destaques na cor do app: vermelho para o Esporte. Botões, ícones e seleção de menu usam os tokens do clube configurado. O tema escuro combina cinza neutro e a mesma cor de destaque. A preferência fica em `admin.theme`, independente do tema do torcedor. O nome do clube identifica a organização no menu.

O menu lateral tem rolagem independente, identificação do administrador, saída e acesso ao app do torcedor. No PC, pode ser recolhido para mostrar somente os ícones. No celular, fecha ao escolher uma seção, tocar fora, usar o botão de fechar ou o comando de voltar. O cabeçalho oferece atualização e alternância de tema. A área principal aproveita a janela, com conteúdo limitado a 1600 px para manter a leitura em monitores grandes.

- **Visão geral:** contadores reais da API, próximas partidas, reservas pendentes da lista consultada e últimas atividades.
- **Jogos:** grade de partidas com setores, preços, disponibilidade e ações de edição, publicação, vendas e portaria.
- **Vendas:** tabela com comprador, partida/setor, total e situação; permite conferir pagamento, editar e excluir inclusive vendas pagas. Edição e exclusão pedem motivo e registram auditoria. O filtro **Excluídas** consulta o histórico preservado. Busca e filtros operam sobre os pedidos carregados. [Regras e contrato das alterações](admin-sales.md).
- **Torcedores:** busca de contas pela API, tabela com perfil, associação e acesso; ações de associação e ativação continuam disponíveis.
- **Planos:** grade com preço, desconto e edição.
- **Funcionários:** grade de equipe com cadastro, escala, redefinição de senha e ativação.
- **Portaria:** conferência de ingresso com orientações ao lado do formulário.
- **Auditoria:** tabela de operações, responsável, entidade e horário.

Os formulários abrem em janelas centrais de até 720 px a partir de 768 px, com rolagem interna. O cadastro de jogo organiza campos em duas colunas nessa largura; no celular, os campos ficam em uma coluna. As tabelas de consulta usam cartões em telas menores; tabelas horizontais pontuais podem rolar quando necessário.

Os componentes estão em `apps/mobile/src/components/admin/`; a composição e as chamadas administrativas ficam em `screens/AdminScreen.tsx`. `theme/AdminThemeProvider.tsx` fornece a paleta e a tipografia Inter para todo o admin, incluindo formulários. `navigation/AppNavigator.tsx` libera a largura e retira o cabeçalho e as abas do torcedor em toda a administração. `components/Sheet.tsx` adapta os formulários e `components/EmployeePanel.tsx` organiza a equipe em grade. Os arquivos de Inter são carregados localmente pelo Expo, sem depender do Google Fonts durante o uso.

A interface utiliza as rotas, permissões e validações já existentes. O login e as regras de emissão e consumo dos ingressos continuam sob responsabilidade da mesma API.

## Verificação

TypeScript verificado com `npm run check --workspace @nacional/mobile`; os 15 testes unitários existentes do app passaram. A exportação web compilou com sucesso em `.artifacts/admin-neutral-web`, sem iniciar servidor de desenvolvimento. A revisão visual interativa desta nova apresentação permanece pendente: a janela do navegador estava minimizada e não pôde ser capturada pela ferramenta de controle.
