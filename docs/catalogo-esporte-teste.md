# Catálogo de teste do Esporte

Em 09/11/2026 foram cadastrados no PostgreSQL local cinco produtos demonstrativos, com imagens de catálogo geradas pela ferramenta integrada `image_gen` (skill imagegen), salvas no repositório e servidas pela API em `/media/shop/`.

| Produto | Preço fictício | Estoque inicial |
| --- | --- | --- |
| Camisa Torcedor · Alvirrubra | R$ 149,90 | P, M, G e GG: 12 cada |
| Camisa Treino · Vermelha | R$ 99,90 | P, M, G e GG: 10 cada |
| Boné ECP · Bordado | R$ 59,90 | 20 |
| Caneca ECP · Vermelha e branca | R$ 39,90 | 18 |
| Cachecol da Torcida · ECP | R$ 69,90 | 15 |

Os SKUs começam em `DEMO-ECP-`. Descrições e cards indicam demonstração: são conceitos visuais, não fotos ou modelos de produtos oficiais fabricados. Preços e estoques são fictícios. O catálogo foi aberto em modo interno. A retirada demonstrativa é “local e horário a combinar”; não foi inventado um endereço físico do clube.

O script `npm run shop:seed-demo --workspace @nacional/api` é idempotente: uma segunda execução confirmou cinco produtos existentes e não recriou ou resetou seus estoques. Recusa execução em `NODE_ENV=production`. Não altera usuários, vendas ou credenciais.

## Imagens e publicação

Arquivos finais em `apps/api/public/shop/`, com hash no nome. O manifesto `apps/api/prisma/shop-demo-images.json` vincula produtos aos arquivos. Docker já copia essa pasta junto da API. O componente `ProductImage` resolve o caminho na mesma origem da API, tanto no PC quanto no celular; HTTPS externo continua aceito. A rota pública serve somente o diretório de catálogo, com cache de arquivos versionados, sem expor `.env` ou aceitar caminhos de upload.

Não houve upload para um provedor de nuvem: as imagens são hospedadas pela API deste projeto. Para um novo ambiente, envie os arquivos do repositório junto da aplicação e execute as migrations; o cadastro de teste é opcional e manual.

O app recebeu cabeçalho do Esporte, busca, categorias em botões, cards com foto, preço, indicação de teste e carrinho. O cadastro administrativo continua usando os mesmos componentes de campo, seleção e formulário.

## Prompts utilizados

Cada imagem foi criada com uma chamada da ferramenta integrada, fundo opaco e o seguinte prompt comum, substituindo `SUBJECT` pelo texto da lista abaixo:

```text
Use case: product-mockup. Asset type: square catalog product photograph for a demonstration supporter store of Esporte Clube de Patos, Paraíba. Subject: SUBJECT. Reference for the fictional merchandise identity: a circular deep red and white seal with intertwined tall ECP letters and a small duck motif, as shown earlier. This is one concept product, not an official manufactured item. Photoreal professional e-commerce studio shot, warm off-white seamless background #f4f0eb, soft directional daylight, delicate realistic contact shadow, red color #b6202b, centered subject fully in frame with generous 15% margins, high fabric/ceramic detail, consistent quiet premium art direction. No people, no price text, no watermark, no UI or labels, no additional objects. Output one square image.
```

- Camisa Torcedor: `a premium red and white vertically striped soccer supporter jersey, front view, ghost mannequin, small Esporte Clube de Patos circular ECP crest on left chest, white V collar and sleeve cuffs, no sponsor marks`
- Camisa Treino: `a premium solid deep red athletic training T-shirt with very subtle tonal texture and white edge detailing, ghost mannequin front view, small circular ECP supporter crest on left chest, no sponsor marks`
- Boné: `a structured deep red cotton baseball cap with small white embroidered letters ECP centered at front, front three quarter angle, realistic curved brim, no other brand marks`
- Caneca: `a single white ceramic coffee mug with red handle, small red and white circular ECP supporter crest centered on front, three quarter view with handle visible to right`
- Cachecol: `one red and white football supporter scarf gracefully folded with visible woven texture and fringed ends, bold ECP lettering woven in white, clean simple club supporter design`

Imagens inspecionadas no resultado da ferramenta antes de serem copiadas ao projeto. Exportação web/iOS e TypeScript são verificações de build; não equivalem a inspeção visual da tela em um aparelho físico.
