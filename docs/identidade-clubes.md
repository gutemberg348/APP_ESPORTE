# Identidade inicial: Esporte Clube de Patos

O app passa a usar inicialmente a identidade vermelha do Esporte Clube de Patos, seguindo a referência enviada em 03/11/2026: fundo quase preto/vinho, cartões em vermelho escuro, ações vermelhas, detalhes rosa e dourado, escudo no cabeçalho e navegação com item ativo destacado.

O cabeçalho mostra o escudo, o nome do usuário, o identificador visual TERROR, o saldo real disponível de cashback e os botões de tema/notificações. O próximo jogo usa dados publicados pela API; se não houver jogo, mostra um estado vazio do clube. Não foram inventados jogos, saldos, promoções de 50% ou comissão de indicação de 10% a partir da imagem de referência.

## Arquivos principais

| Arquivo | Uso |
| --- | --- |
| `packages/shared/brands.json` | Perfis Esporte e Nacional: nome, programa, apelido, TV, escolinha e paletas claras/escuras |
| `apps/mobile/src/config/club.ts` | Seleção da identidade e registro estático de imagens para o Metro |
| `apps/mobile/app.config.js` | Nome exibido pelo Expo e texto da permissão da câmera por clube |
| `apps/mobile/src/theme/ThemeProvider.tsx` | Tema do clube e preferência claro/escuro independente por identidade |
| `apps/mobile/src/theme/brand-tone.ts` | Adapta tons verdes legados ao matiz da marca, preservando dourado e cores de categorias |
| `apps/mobile/src/components/Crest.tsx` | Exibe o escudo selecionado com acessibilidade |
| `apps/mobile/src/navigation/AppNavigator.tsx` | Cabeçalho, saldo e navegação inferior |
| `apps/mobile/src/screens/HomeScreen.tsx` | Jogo, CTA de ingresso, atalhos, escolinha e indicação |
| `apps/mobile/src/config/demo.ts` | Adaptação visual das fixtures; não modifica cadastros reais |
| `apps/mobile/assets/esporte-escudo.png` | Escudo com transparência externa, usado no app |

Carteira, perfil, Fan Zone, ingressos, leitores, botões e formulários usam as cores da identidade. Nome do clube, TV, escolinha e textos principais também seguem a configuração. O login único e as permissões existentes continuam iguais.

## Trocar de clube

No `apps/mobile/.env`:

```dotenv
EXPO_PUBLIC_CLUB=esporte
```

Para a identidade anterior, usar `nacional`. Reiniciar o Expo com `npm run dev:mobile:clear` para reaplicar a variável. O nome inicial foi ajustado para **Sócio Esporte**. A identidade alternativa continua Nacional • Sócio Canário, ambas no SDK 58.

O login/cadastro usa o título Sócio Esporte, com altura de linha explícita para evitar corte no iOS. O cadastro pede a senha uma única vez, com mínimo de dez caracteres, e login/cadastro oferecem botão para mostrar ou ocultar a senha. Não há seletor de perfil no login.

Para acrescentar outro clube, criar um perfil com as mesmas chaves no JSON e registrar o arquivo do escudo em `config/club.ts`, com `require` estático. Isso é a base de configuração visual por instalação/build, não um seletor público de acesso a clubes no banco.

## Limites da mudança

Esta etapa prepara identidade visual reutilizável; não converte o backend inteiro para multi-tenant. Não foram alterados jogos, planos, compras, carteiras ou registros financeiros existentes. Nomes e condições reais cadastrados no banco continuam sendo os dados do administrador. Novos jogos no formulário administrativo começam com o nome do clube selecionado.

Os nomes técnicos dos pacotes, IDs de instalação, sessões e links `nacional://` foram preservados por compatibilidade. Publicar apps independentes de clubes exige configurar IDs, esquema de links e ambiente de cada instalação, além de ampliar o isolamento do backend onde necessário.

## Escudo: arquivo e edição

Entrada fornecida pelo usuário: `C:/Users/GUTOO/Downloads/images (4).jpg`.
Arquivo final: `apps/mobile/assets/esporte-escudo.png`.
Ferramenta: image_gen integrada, no modo de edição com fundo transparente; não foi usada a CLI/API externa.
Verificação do arquivo: PNG RGBA, 1254 × 1254, canal alpha com valores de 0 a 255 e canto externo transparente. O escudo foi inspecionado visualmente após a geração.

Prompt final utilizado:

Use case: background-extraction. Edit target: the provided Esporte Clube de Patos official circular red and white ECP crest. Remove ONLY the white rectangular background OUTSIDE the outer red circular border, leaving actual alpha transparency. Preserve the entire circular logo exactly, including all white areas INSIDE the red ring, its red colors, all letters 'ESPORTE CLUBE DE PATOS', the ECP monogram, the white duck, and the date '7.7.1952'. Do not redesign, recolor, retype, or remove internal white details. Center the whole original circular emblem on a square transparent canvas with minimal equal padding, clean antialiased outer edge. Output a transparent PNG suitable for mobile app header.

## Verificação

TypeScript e os 15 testes isolados do mobile passaram. A configuração dos dois clubes foi conferida sem iniciar serviços. O bundle iOS foi exportado com sucesso em `.artifacts/esporte-ios`: 2.964 módulos, escudos e fontes empacotados. O tema visual ainda deve ser conferido no aparelho pelo responsável; não foi aberto app interativo ou prévia pelo agente.
