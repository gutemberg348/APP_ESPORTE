# Bilheteria presencial

## Preparar

A empresa entra em **Administração geral → Funcionários → Cadastrar acesso** e escolhe **Administrador do time**. Esse usuário entra em `/admin` para cadastrar os funcionários do clube. O clube pode atribuir **Bilheteria**, **Portaria** ou **Caixa de parceiro**. A empresa gerencia os acessos administrativos do time.

1. No admin, publique a partida V1, abra as vendas e cadastre lotes ativos com preço e capacidade nos setores disponíveis. O balcão vende o estoque desses lotes.
2. Em **Funcionários**, crie uma conta **Bilheteria** para cada vendedor. No app, o perfil abre a tela de vendas após o login. No navegador, a equipe acessa `/bilheteria`. O administrador também pode usar esse endereço.
3. Em **Configurações**, o prazo de reserva de ingressos também vale para o balcão. O fim da venda pode encurtar esse prazo.

## Vender

Informe o CPF, escolha o jogo, o setor, o lote, a quantidade e a forma de recebimento. Para setor numerado, informe bloco, fileira e primeiro assento. Quando há mais de um ingresso o sistema reserva lugares consecutivos. A reserva inteira depende da disponibilidade de todos os lugares.

Aguarde a tela **Receber** antes de cobrar. Ela mostra o total do pedido e o vencimento. Após receber o dinheiro ou obter a aprovação do cartão na maquineta, toque em **Recebi o pagamento · emitir**. Essa ação registra o recebimento presencial pelo vendedor. A maquineta processa o cartão separadamente. Reservas canceladas ou expiradas liberam as vagas. A API confere o vencimento ao confirmar, e recolhe as reservas vencidas quando a bilheteria consulta ou movimenta o estoque.

Para **Pix Sicredi**, a própria bilheteria exibe o QR e o Pix Copia e Cola. O vendedor acompanha o pedido. A API libera os ingressos após consultar o recebimento no banco. O botão de confirmação manual pertence apenas ao dinheiro e cartão. O painel de pagamentos identifica essas cobranças como **Bilheteria**.

Em **Minhas vendas**, o vendedor recupera a operação se a conexão cair. A repetição da confirmação é idempotente. O admin identifica o vendedor e a forma de recebimento em **Pedidos e ingressos V1 → Ver bilhete** e pode consultar a auditoria.

## Entregar e validar

O PDF contém uma página por ingresso, em largura de 80 mm. Cada página traz jogo, horário de Patos, estádio, setor, final do CPF, acomodação quando numerada, QR, código de barras Code 128 e código digitável. A segunda via conserva os mesmos identificadores.

No navegador, **Imprimir ingressos** abre o PDF e **Baixar PDF para enviar** baixa o arquivo. No aplicativo, a impressão usa o serviço de impressão do sistema e **Enviar PDF** abre o compartilhamento instalado. Uma maquineta precisa permitir o app Android ou o navegador. A impressora térmica embutida depende do serviço de impressão ou do SDK disponibilizado pelo fabricante.

O porteiro entra com a própria conta **Portaria**, seleciona a partida V1 e o setor de sua escala e confere o bilhete. As duas representações autorizam a mesma entrada individual. Uma cópia do PDF também consome apenas essa entrada. Nos ingressos comprados pelo checkout do torcedor, o QR e o Code 128 exibidos no app acompanham a validade do código temporário.

## Atualização

### Moderninha Smart PagBank

O mesmo login de bilheteria funciona no navegador do celular ou PC, no app do vendedor e no APK da Moderninha. No navegador e no app do vendedor, escolha **Dinheiro**, **Cartão físico no balcão** ou **Pix Sicredi**. Para dinheiro ou cartão físico já aprovado em equipamento externo, o vendedor confirma o recebimento e emite os ingressos. A API confirma o Pix pelo Sicredi do clube.

No APK da Moderninha, **Nova venda** permite escolher jogo, lote, CPF e quantidade. Para setores numerados, informe também bloco, fileira e primeiro assento. Em **Cartão na Moderninha**, o APK chama o leitor integrado. Em **Pix Sicredi**, o APK exibe o QR da cobrança criada pela API do clube e acompanha sua confirmação. **Consultar pedidos** recupera as reservas pendentes da conta.

1. Na VPS, gere uma chave própria com `openssl rand -hex 32` e guarde-a em `PAGBANK_TERMINAL_TOKEN` no `.env` da raiz. A chave habilita o APK de bilheteria dos terminais. O Pix usa as credenciais Sicredi já configuradas na API.
2. Depois de subir o código, execute `sudo docker compose up -d --build api web` na VPS. A API aplica a migration `20261118190000_moderninha`. Para usar a nova opção no celular do vendedor, distribua também uma versão atualizada do app habitual.
3. No PC, execute `npm run local:maquineta`. O arquivo é `dist/android/bilheteria-moderninha-release.apk`, com identificador `br.com.esporte.bilheteria.smart`. A assinatura fica em `.secrets/android/br.com.esporte.bilheteria.smart`. Guarde essa pasta para assinar as próximas versões. O comando usa a configuração HTTPS do build mobile. Para verificar a compilação e as dependências sem gerar o APK, use `npm run local:maquineta -- --check`.
4. No terminal de desenvolvimento PagBank ativado, abra **Bilheteria Esporte**. Entre com a mesma conta do vendedor e informe a chave no primeiro acesso. Ela fica protegida pelo Android Keystore. A senha e os tokens da sessão do vendedor ficam em memória.
5. Selecione a reserva conferindo o final do pedido e o total. Escolha **Débito** ou **Crédito à vista** e siga as instruções da Moderninha. A aprovação libera os ingressos na bilheteria e o botão de impressão no terminal. O comprovante do cartão e os ingressos são documentos distintos.

Se a conexão cair após passar o cartão, entre com a mesma conta no mesmo equipamento. **Enviar resultado à bilheteria** repete somente a comunicação com a API. Para uma operação com resultado desconhecido, use **Consultar última aprovação**. A conferência usa referência e valor. A reserva permanece retida durante essa conciliação. Se o terminal for perdido ou seus dados forem apagados, preserve o pedido e confira o extrato antes de resolver a venda. A confirmação registrada vem do SDK do terminal provisionado. A conciliação bancária por extrato continua sendo uma operação separada.

Para homologar, teste no terminal de desenvolvimento uma aprovação, uma recusa, perda de rede após aprovação, impressão e segunda via. A distribuição em terminais comerciais segue o processo do PagBank. [SDK SmartPOS](https://developer.pagbank.com.br/docs/desenvolvimento-smartpos) · [Homologação e distribuição](https://developer.pagbank.com.br/v1.0/docs/smart-pos-processo-de-integracao)

### Bilheteria e Pix

A migration `20261118180000_ticket_counter` acrescenta o perfil de vendedor, os dados de recebimento do balcão e o contador de reservas do lote. A migration `20261118183000_counter_pix` vincula cada pedido Pix da bilheteria a uma cobrança Sicredi única. O contêiner da API aplica migrations na inicialização. Atualize API e web e gere um novo APK para distribuir a tela e o módulo nativo de impressão.
