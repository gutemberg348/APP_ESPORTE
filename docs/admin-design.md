# Componentes e interface do administrador

O administrador usa Inter, superfícies neutras, bordas discretas e vermelho nas ações principais. O layout oferece menu lateral recolhível no desktop e menu em gaveta no celular. A largura disponível determina a disposição dos formulários, sem prender campos a uma largura de tela fixa.

## Uma implementação para cada controle

Os controles ficam em `apps/mobile/src/components/admin/AdminControls.tsx`. Novas telas devem reutilizá-los em vez de criar inputs, selects ou botões com estilos próprios.

| Componente | Responsabilidade |
| --- | --- |
| `AdminButton` | Botão principal, secundário, discreto ou destrutivo; ícone, loading, foco e bloqueio de interação |
| `AdminField` | Campo de texto, número, valor com prefixo, senha com olhinho ou texto multilinha; rótulo, ajuda e erro |
| `AdminSelect` | Seleção única com opções desabilitadas, descrição e busca em listas maiores |
| `AdminDateTimeField` | Calendário por mês/ano e escolha de hora/minuto; valor opcional pode ser limpo |
| `AdminToggle` | Alternância ou checkbox, inclusive para escala de funcionários |
| `AdminFormGrid` | Distribuição de campos conforme o espaço disponível |
| `AdminSection` | Título e descrição de uma seção do formulário |
| `AdminNotice` | Mensagem neutra, sucesso, atenção ou erro |
| `AdminMenu` | Ações secundárias de um registro, usando o mesmo popover dos demais controles |
| `AdminFilterPanel` | Grupo recolhível de filtros; aberto inicialmente no desktop e fechado no celular |

`AdminLayout.tsx` concentra navegação, título de página, tabela e badge de situação. `AdminReportControls.tsx` mantém a consulta, paginação e métricas dos relatórios. A visão geral e os relatórios compartilham o mesmo componente de métricas.

Compatibilidade dos nomes antigos:

- `AdminAction`, exportado por `AdminLayout`, é um alias de `AdminButton`.
- `AdminField` e `AdminToggle`, exportados por `AdminForms`, são reexports da base única.
- `ReportInput` e `ReportSelect` só adaptam a distribuição no grupo de filtros; a implementação dos controles é `AdminField`/`AdminSelect`.
- `Button` de `ui.tsx`, quando está dentro do tema administrativo, delega a `AdminButton`. Assim os formulários antigos não criam um segundo estilo de botão.
- `Sheet` continua sendo a janela compartilhada; no admin usa cabeçalho compacto, botão de fechar da base e espaçamento de formulário.

## Datas e selects

O calendário mostra datas no formato `DD/MM/AAAA · HH:mm`, permite navegar entre meses/anos e escolher qualquer minuto. Internamente mantém `AAAA-MM-DD HH:mm`, no horário de Patos. A conversão para ISO continua em `utils/admin.ts`; a API e as regras de período não foram alteradas.

`utils/admin-calendar.ts` concentra o calendário, validação de datas, navegação de mês e formatação. Não depende do fuso do dispositivo para calcular os dias. Filtros novos sugerem início às 00:00 e fim às 23:59. O fim do período continua inclusivo até o último milissegundo do minuto, conforme o contrato existente.

No navegador largo, selects/calendário/menus abrem em popover posicionado a partir do campo e limitado à janela. Em telas menores, a seleção aparece centralizada com rolagem. Os controles mantêm rótulos acessíveis, seleção atual, opções desabilitadas e fechamento por solicitação do sistema/tecla Escape, conforme suporte da plataforma.

## Páginas revisadas

- Login administrativo: apresentação neutra e campos/botão da base comum; continua exigindo portal ADMIN.
- Visão geral: métricas compartilhadas e hierarquia tipográfica mais discreta.
- Jogos: formulários separados em dados da partida, venda e portaria; datas com calendário.
- Vendas: filtros recolhíveis e menu por pedido para edição, cancelamento, exclusão e recebimento.
- Pagamentos: conciliação e solicitação de estorno no menu; confirmação e motivo preservados.
- Torcedores: busca com campo comum, ações agrupadas e associação com selects e calendário.
- Planos: controles e botões comuns para valores e desconto.
- Funcionários: tabela no PC, cartões no celular, busca local, formulário de senha com olhinho e escala com checkbox.
- Portaria: selects de partida/setor/quantidade, preservando câmera, digitação, recuperação e confirmação da entrada.
- Histórico de portaria: filtros recolhíveis e datas com calendário; consultas de protocolo preservadas.
- Auditoria: tabela e layout comuns.

As alterações são de interface e organização dos componentes. Os contratos HTTP, permissões, confirmação de pagamento, auditoria, estoque, validação de ingresso e estornos permanecem no backend existente. O painel continua atualizando seus relatórios conforme os intervalos já configurados.

## Verificação

Passaram TypeScript, os 27 testes do app e exportação web/iOS. Os testes novos cobrem semanas completas do calendário, início na segunda-feira, virada de mês/ano, anos bissextos, horários inválidos e compatibilidade com o fuso/intervalo da API.

A inspeção visual interativa ficou pendente: a ferramenta de controle do computador encerrou a tentativa porque não conseguiu determinar com segurança a URL ativa do navegador. Nenhuma validação visual em navegador ou aparelho é alegada nesta entrega. Não foram iniciados API, app em desenvolvimento ou Docker. O trabalho permaneceu na branch selecionada pelo usuário (`main`), sem commit ou push automático.
