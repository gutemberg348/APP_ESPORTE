# Fotos dos produtos

Em **Loja → Produtos → Novo produto / Editar → Fotos**, use **Enviar foto** para selecionar um arquivo do computador ou celular. **Adicionar link** continua disponível para uma foto HTTPS já hospedada. Cada foto tem prévia, troca de arquivo e remoção; **Usar como capa** move a foto para a primeira posição. O produto aceita até oito fotos.

O seletor utiliza `expo-document-picker` e `expo-file-system`, já presentes no app. A leitura de arquivos é compartilhada com os comprovantes, mantendo o limite e os formatos de cada recurso separados.

## Upload e armazenamento

- Entradas: JPG/JPEG, PNG e WebP, até 5 MB por arquivo e 24 megapixels; imagens animadas não são aceitas.
- A API verifica assinatura, formato e decodificação. A foto é orientada, limitada a 2000 × 2000 pixels sem ampliação e convertida para WebP, sem os metadados originais. A implementação usa [Sharp](https://sharp.pixelplumbing.com/api-constructor/).
- Processamento limitado a duas fotos simultâneas por processo e 20 envios por minuto por administrador.
- Os bytes ficam em `ShopImage`, no PostgreSQL, junto com largura, altura, tamanho, hash e responsável. Fotografias normalizadas iguais reaproveitam o mesmo arquivo.
- O produto armazena somente a URL `/media/shop/upload-<UUID>.webp`. O catálogo e o cadastro não recebem o arquivo completo em base64. A API confere a existência dos uploads ao salvar o produto.
- A URL é pública para exibição na loja, tem tipo fixo `image/webp`, `nosniff`, ETag e cache imutável. Somente administradores autenticados fazem upload.
- Remover a foto do formulário remove sua referência no produto. O arquivo é mantido, pois pedidos anteriores podem usar a URL registrada na compra. Fechar o formulário após enviar também pode deixar um arquivo ainda sem produto; não há exclusão automática que possa quebrar o histórico.
- O backup do PostgreSQL inclui as fotos. Não há dependência do disco temporário da API, volume adicional do container ou serviço externo de imagens.

## Rotas e estrutura

`POST /v1/admin/shop/images`: JSON com `mimeType` e `base64`, validado com limite de corpo de 7,1 MB antes da decodificação. Retorna somente `id`, `url`, `mimeType`, `byteLength`, `width` e `height`. A tela aguarda o envio terminar antes de permitir salvar ou fechar o produto. Não há repetição automática de uploads com falha.

`GET /media/shop/upload-<UUID>.webp`: resposta binária da foto, sem exigir login. As imagens públicas não devem conter documentos ou outros dados privados; comprovantes continuam no fluxo privado de Saques.

Arquivos principais: `shop-image.controller.js` → `shop-image.service.js` → `shop-image.store.js`; normalização em `lib/shop-images.js`; componente `ProductPhotosField.tsx`. Limites compartilhados em `packages/shared/shop-media.js`.

Migration: `20261110120000_shop_image_uploads`. Para outra instalação, executar `npm ci`, `npm run db:generate`, `npm run db:deploy` e carregar a API atualizada. Na instalação local desta revisão, a dependência já foi instalada, o cliente gerado e a migration aplicada. A instância da API que já estava aberta precisa ser reiniciada pelo responsável para carregar as novas rotas.
