# Gerar Android localmente

Na raiz do repositório, execute no seu computador:

```powershell
npm run local:app
```

O resultado padrão é `dist/android/socio-esporte-release.apk`, instalável no Android. O comando não instala o app nem inicia emulador, API ou servidor de desenvolvimento. A API de produção precisa estar acessível por HTTPS para login, compras e validações.

## Como funciona

1. Confere Java, Android SDK, Build Tools e NDK usando os requisitos do React Native instalado.
2. Cria uma assinatura privada local na primeira execução e reutiliza a mesma chave nas seguintes.
3. Executa o CLI do Expo instalado no projeto para gerar/atualizar `apps/mobile/android`, usando o template incluído no SDK, sem apagar a pasta e sem reinstalar dependências.
4. Executa o Gradle Wrapper desse projeto com `:app:assembleRelease`. A versão do Gradle vem do wrapper, independentemente do Gradle global usado por outros projetos.
5. O Gradle compila o app nativo e inclui JavaScript, fontes e imagens no APK. A assinatura é conferida com `apksigner` antes de copiar o resultado para `dist/android`.

O app funciona sem Expo Go, sem conta Expo/EAS, sem build na nuvem e sem Metro aberto. As bibliotecas Expo continuam no código porque o app usa câmera, arquivos, armazenamento seguro e outras funcionalidades delas. O prebuild e o empacotamento usam ferramentas Expo **localmente**, e a compilação final usa Gradle. Referências: [geração nativa do Expo](https://docs.expo.dev/workflow/continuous-native-generation/) e [compilação Android por linha de comando](https://developer.android.com/build/building-cmdline).

## API e configuração

Sem configurar nada extra, o APK aponta para `https://api-esporte.testes-techcode.shop/v1`, com a marca Esporte, tenant `nacional-patos` e modo demonstrativo desativado.

Para alterar, copie o exemplo e edite o arquivo local:

```powershell
Copy-Item apps/mobile/.env.android.example apps/mobile/.env.android.local
```

A precedência é: `.env.production.example` → `apps/mobile/.env.production` → `apps/mobile/.env.android.local` → variáveis do terminal. Apenas os campos de build previstos pelo script são aproveitados. O `.env` da raiz/VPS e o `.env` de desenvolvimento do app não são carregados pelo comando. `EXPO_NO_DOTENV=1` impede o Expo de substituir a API do APK pelo localhost do desenvolvimento.

Os campos `EXPO_PUBLIC_*` aparecem no aplicativo compilado e devem conter apenas dados públicos. A chave Android e suas senhas são repassadas ao Gradle separadamente; nunca ficam nos argumentos de terminal nem nos campos públicos. Mudar API, clube ou tenant invalida o cache da tarefa de JavaScript para que o APK incorpore os novos valores. Uma mudança desses valores exige gerar e instalar outro APK.

O nome exibido é Sócio Esporte. O identificador Android atual, `br.com.nacional.sociocanario`, é preservado para compatibilidade com a base existente. Para publicar uma identidade diferente, ajuste `android.package`, versões e links de forma planejada antes da primeira distribuição.

## Assinatura e atualizações

O script guarda a chave e suas credenciais em `.secrets/android/br.com.nacional.sociocanario/`, fora do Git e do contexto Docker. Faça backup privado dessa pasta. Ela contém a identidade que permite atualizar os APKs instalados. A chave fica fora de `android/` para sobreviver à geração do projeto nativo.

Se já possui uma chave deste app, configure os quatro campos `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD` no arquivo local. O caminho pode ser absoluto ou relativo à raiz do repositório. Não use a chave de outro aplicativo por acidente. Uma instalação anterior assinada com outra chave não pode receber uma atualização assinada com a nova identidade.

O script não substitui chaves incompletas ou de outro pacote. Se detectar somente a chave ou somente as credenciais, interrompe para que você restaure o par correto.

## Outros comandos

```powershell
# Conferir ferramentas, sem gerar projeto nativo, chave ou APK
npm run local:app -- --check

# Ver etapas e destino sem executar ferramentas
npm run local:app -- --plan

# Gerar AAB com a mesma chave local
npm run local:app -- --aab
```

O AAB é salvo em `dist/android/socio-esporte-release.aab`; para instalar diretamente em um aparelho, use o APK. Para publicar no Google Play, configure a chave de upload correspondente à conta e incremente `android.versionCode` no `apps/mobile/app.json`, além da versão do app, em cada nova publicação. As exigências da loja e a submissão são etapas separadas.

## Ferramentas

O script lê `node_modules/react-native/gradle/libs.versions.toml`; com as dependências atuais, são necessários SDK 37, Build Tools 37.0.0 e NDK 27.1.12297006, além de JDK 17 ou superior. `ANDROID_JAVA_HOME` permite escolher um JDK só para este app; caso ausente, usa `JAVA_HOME` ou o Java disponível. `ANDROID_SDK_ROOT`/`ANDROID_HOME` selecionam o SDK, com detecção do caminho padrão do Android Studio quando necessário.

Se faltar algum componente, instale a versão indicada pelo SDK Manager do Android Studio e aceite as licenças. Não é necessário alterar o Gradle de outros projetos. O primeiro build pode baixar a distribuição do wrapper e dependências Maven; portanto, **build local não significa build sem internet**. As seguintes execuções reaproveitam o cache nativo.

O build nativo e a instalação em aparelho ficam por conta do desenvolvedor. Na preparação deste comando não foram executados prebuild, Gradle ou geração de chaves reais. Os testes usam arquivos temporários e chaves fictícias para validar a configuração e a preservação da identidade.
