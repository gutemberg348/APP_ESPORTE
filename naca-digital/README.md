# Naça Digital — código-fonte

Protótipo de sócio-torcedor do Nacional de Patos.
Versão de 13/10/2026: página inicial mais próxima do modelo do usuário,
com próximo jogo, quatro atalhos e banner Ninho do Canário. Letras legíveis, escudo original,
tema claro/escuro e menu inferior em área própria.

## Abrir no VS Code

1. Extraia o ZIP e abra a pasta `naca-digital` no VS Code.
2. Abra o terminal e execute com Python 3:

```bash
python -m http.server 8000 --bind 127.0.0.1 --directory dist
```

No macOS/Linux, pode usar `python3`; no Windows, `py -3`.
Abra http://localhost:8000. Ctrl+C encerra o servidor.
Não abra o HTML por duplo clique: os módulos precisam de servidor HTTP.
Não precisa instalar pacotes nem executar build.

## Tecnologias e arquivos

HTML, CSS e módulos JavaScript nativos. O site publicado não usa React,
Tailwind ou lucide-react; o código enviado pelo usuário serviu como referência.

- `dist/index.html`: entrada e ordem dos estilos.
- `dist/app.mjs`: telas e interações.
- `dist/model.mjs`: dados fictícios e regras de pontos, cupons e ingressos.
- `dist/style.css`: base visual.
- `dist/minimal.css`: estrutura de cinco abas.
- `dist/typography.css`: tamanhos de texto e legibilidade.
- `dist/premium.css`: verde profundo, dourado e carteirinha.
- `dist/themes.css`: tema claro.
- `dist/home.css`: início compacto, ajuste por altura e paisagem.
- `dist/school.css`: banner, escolinha e tabela demonstrativa.
- `dist/wallet.css`: carteirinha inteira e ajuste do QR à altura disponível.
- `dist/stadium.css`: apresentação das luzes.
- `dist/stadium.mjs`: solicitação para manter a tela acesa.
- `dist/stadium-show.mjs`: sequência calculada pelo horário do aparelho.
- `dist/sw.js`: cache da interface para abrir sem internet.
- `dist/assets/nacional-escudo.png`: escudo original.
- `dist/assets/canary.svg`: canário ilustrativo.

## Experiência do início

A página inicial usa a altura visível do navegador (`100dvh`). Jogo,
atalhos e o banner da escolinha ocupam o espaço entre cabeçalho e menu, sem blocos extras.
Economia continua em Vantagens; check-in, desafios e pontos na Fan Zone/perfil.
Em telas muito baixas ou com ampliação extrema, permite rolagem para preservar
acesso aos controles. Texto de apoio entre 12 e 14 px, títulos e corpo de 16 px.
A conferência de dimensões reais em iPhone/Android ainda está pendente.

## Uso com pouco sinal no estádio

Abra o app com internet antes do jogo. No Modo Estádio, aguarde “Pronto para
abrir sem internet”. A interface pode reabrir sem rede no mesmo navegador,
desde que os dados do site não sejam apagados. Fontes externas têm alternativa
nas fontes do sistema. As imagens essenciais são locais.

A opção Juntos alterna verde e branco em blocos de seis segundos a partir do
horário do aparelho. Quem abrir depois entra na fase correspondente àquela
hora. Use relógio automático; a sincronização visual é aproximada. Não há
comando em tempo real do clube: esta é uma sequência demonstrativa repetida.

O app tenta manter a tela acesa quando o navegador oferece Screen Wake Lock.
Ao sair ou ocultar a página, libera a solicitação. A interface continua
funcionando se a solicitação for negada. Não controla lanterna ou brilho físico.
Referência: https://www.w3.org/TR/screen-wake-lock/

O cache está na versão v4. Se uma versão anterior estiver aberta, aguarde a
atualização do service worker e recarregue o app para usar os arquivos novos.
Para futuras alterações nos arquivos, incremente a versão do cache em `sw.js`.

## Dados e limites

Dados ficam em `localStorage` (`naca-digital-v1`); o tema em `naca-theme-v1`.
Uma cópia local tem dados separados do site publicado. Não há backend,
autenticação real de sócios, cobrança, PDV ou transmissão ao vivo.
QR, ofertas, parceiros, jogos, valores e pontuações são demonstrações.
Nenhuma solicitação ou indicação é enviada a pessoas ou empresas.

## Verificações

```bash
node --test model.test.mjs stadium.test.mjs stadium-show.test.mjs
```

Testes de regras, ciclo de Wake Lock e relógio comum passaram. A revisão desta
interface também verificou sintaxe, arquivos de cache e navegação/tema/ingressos
com stubs de DOM. Não substitui teste visual em navegador e aparelho real.

## Escudo

PNG obtido em 12/10/2026 da página do clube:
https://nacionalatleticocl.wixsite.com/nacionaldepatos/escudos-1
Arquivo de origem:
https://static.wixstatic.com/media/09701f_de198caf561c4095b951ba22a7994cb8~mv2.png

## Identificação

Commit: `caa4786255f2aea844a8759081e8ab0849714a1c`.
Cópia portátil sem credenciais, Git ou vínculo automático de publicação.
Para hospedar em outro serviço, use os arquivos da pasta `dist`.


## Carteirinha compacta

A aba Carteira abre o cartão diretamente, sem o título e a fileira de abas
acima dele. O botão de três pontos no cabeçalho abre ingressos, cupons,
extrato, experiências e plano. O botão central sempre retorna à carteirinha.
O cartão usa o espaço entre cabeçalho e menu e reduz os espaços e a área
do QR em telas baixas. Nome, matrícula, validade e status continuam visíveis.
Em paisagem, o cartão se distribui em duas colunas. Telas muito baixas ou
ampliadas podem rolar para preservar acesso aos dados.

Verificados composição da tela, opções, ingressos, tema e retorno ao início
com stubs de DOM. A conferência visual em iPhone/Android ainda está pendente.


## Ninho do Canário

O banner do início abre a proposta de escolinha (#escolinha), também acessível
pelo Perfil. Inclui informações recolhidas e interesse demonstrativo salvo
apenas no navegador. Não envia matrícula nem reserva vaga. Turmas, horários,
local, preços e descontos dependem de definição do clube.

Os atalhos do início agora são Loja, Naça TV, Estatísticas e Indicar. A tabela
mostra valores fictícios explicitamente identificados. No Perfil, Cenário do
início alterna entre próximo jogo e pré-temporada. A carteirinha compacta,
escudo original, temas e sequência de luzes pelo relógio foram preservados.

Verificados: sintaxe, cache, navegação da escolinha, interesse salvo/removido,
tabela, atalhos, cenários e regressão da carteira. Os 17 testes existentes de
regras passaram. Inspeção visual no iPhone ainda pendente.
