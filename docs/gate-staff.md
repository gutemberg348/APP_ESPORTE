# Portaria do Sócio Esporte

## Preparar o jogo

1. Em **Funcionários**, o administrador cadastra uma conta individual com perfil **Portaria**. O cadastro público cria torcedores.
2. Em **Definir escala**, marca o setor da partida em que a pessoa vai trabalhar. **App** identifica partidas vendidas pelo checkout do torcedor e **V1** identifica partidas de **Gestão de ingressos V1**. Mesmo quando os nomes coincidem, cada setor tem o seu próprio identificador. A escala salva os dois conjuntos juntos.
3. Para testar ingressos comprados pelo app antes do jogo, vá a **Jogos → Abrir portaria agora**. A API abre a entrada no horário atual do servidor e mantém o horário de fechamento. O torcedor já pode apresentar o QR em **Meus ingressos**. Ao terminar o teste, use **Fechar portaria**. Para agendar, edite os horários da partida. Na ausência de horários específicos, a janela vai de duas horas antes até quatro horas depois do início. Para ingressos presenciais, configure a janela em **Partidas V1**.
4. Entrega a cada funcionário as próprias credenciais. No navegador, o funcionário entra em `/acesso/` com sua conta de portaria. No Android e no iOS a pessoa usa o login comum do app e é direcionada pelo perfil da conta.

## O que cada conta pode fazer

| Perfil | Acesso |
| --- | --- |
| Portaria | Selecionar partidas e setores da escala, conferir o ingresso, confirmar uma entrada e consultar suas próprias operações. A verificação de carteirinha é uma ação distinta. |
| Administrador | Gerenciar funcionários, escalas e portarias, operar os setores disponíveis e consultar o histórico dos operadores. |
| Torcedor ou caixa | As rotas de consulta e admissão de ingressos exigem outro perfil. |

O servidor verifica o JWT, a sessão e a conta ativa em cada pedido autenticado. O token de renovação é rotacionado e o banco guarda seu hash. O app nativo usa SecureStore, e o navegador guarda a sessão na aba. Desativar uma conta, redefinir sua senha ou trocar seu perfil revoga as sessões. Alterar a escala passa a valer na próxima autorização. A API confere novamente a escala dentro da transação que registra a passagem.

## Na catraca

A **Bilheteria** vende os ingressos presenciais das partidas V1. O operador da catraca usa a mesma partida e o mesmo setor para ler o QR ou o Code 128 da via impressa ou digital. O ingresso temporário apresentado no app do torcedor também exibe Code 128. Veja o [fluxo de venda e impressão](bilheteria.md).

1. Selecionar partida, setor físico e informar o portão. Ler o QR com a câmera ou com um arquivo de imagem. Também é possível digitar o código ou usar um leitor USB em modo teclado, com o campo focado e Enter. A câmera depende de permissão e, no navegador, de HTTPS ou localhost.
2. Conferir o titular e o setor na prévia. Para o V1, o bilhete também pode trazer acomodação e código de barras Code 128. Para um pedido de grupo do app, a prévia mostra o saldo disponível.
3. Tocar em **Confirmar e registrar uma entrada**. Liberar uma pessoa ao receber **Entrada confirmada**. Um grupo do app apresenta um novo QR ou código para cada pessoa seguinte.
4. Se a rede cair depois do envio, manter a passagem bloqueada e usar **Consultar confirmação no servidor**. O dispositivo guarda identificadores da operação para recuperar o protocolo. **Entrada já registrada** exige conferir quem já passou. Uma confirmação repetida não autoriza uma pessoa adicional.
5. Consultar o **Histórico de entradas** no leitor. O administrador também tem **Histórico de portaria**, incluindo o relatório dos ingressos do app. A auditoria permite localizar entradas por protocolo e identificar o responsável, horário e setor. Os novos registros incluem o portão informado pelo operador.

## Credenciais e bloqueios

| | Comprado no app | Emitido na gestão V1 |
| --- | --- | --- |
| Apresentação | QR assinado temporário ou código aleatório de 10 caracteres. O app solicita renovação aproximadamente a cada 15 segundos. | QR assinado do bilhete, Code 128 ou código de 16 caracteres hexadecimais. |
| Validade | Até 45 segundos, limitada ao fechamento da portaria. QR e código correspondem à mesma versão. Uma passagem invalida a versão anterior. | Enquanto o ingresso estiver vendido, o pedido pago e a portaria aberta. A primeira confirmação muda o ingresso para utilizado. |
| Verificações | Ingresso emitido, conta do titular ativa, pagamento registrado compatível com o valor, ausência de estorno, setor, partida e saldo. | Clube, estádio e setor ativos, partida publicada ou esgotada, pedido pago, ingresso vendido, setor e, no QR assinado, acomodação compatível. |
| Persistência | `TicketAdmission` registra a entrada. `TicketAccessCode` guarda o hash do código temporário e seu vencimento. | `AdmissionV1` registra uma única admissão por ingresso. O bilhete imprimível tem credencial persistente. |

As duas modalidades fazem a baixa com transação e atualização condicional. O recibo identifica a operação. Cada consulta de recuperação exige o mesmo operador e contexto autorizado. Na recusa de uma credencial processada pelo validador, a auditoria registra o motivo e um hash. A emissão V1 atual omite a chave do QR na auditoria e o painel filtra esse campo de registros anteriores.

O controle protege o saldo e a repetição de entrada. Quem tiver uma cópia de um bilhete V1 ainda disponível pode apresentá-la primeiro. Um QR do app também pode ser encaminhado enquanto estiver válido. A conferência presencial do titular continua importante. O leitor verifica o pagamento registrado no sistema. No V1, o estado pago também pode decorrer de uma operação administrativa. A leitura na catraca não realiza consulta bancária.

## Verificação

Os testes de portaria cobrem as duas credenciais, os perfis, a escala revogada entre consulta e confirmação, pagamento estornado, uso repetido, grupo, protocolo e histórico. A integração HTTP cobre cadastro do funcionário, login, troca de senha e suspensão. A homologação de câmera, leitor USB e rede deve ser feita nos aparelhos que serão usados no evento. Para os endpoints e a configuração da gestão V1, consulte [Gestão de ingressos e portaria](ingresso-v1.md).
