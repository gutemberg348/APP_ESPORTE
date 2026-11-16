# Gerar Android localmente

Na raiz do repositório, execute no seu computador:

```powershell
npm run local:app
```

O resultado padrão é `dist/android/socio-esporte-release.apk`, instalável no Android. O comando não instala o app nem inicia emulador, API ou servidor de desenvolvimento. A API de produção precisa estar acessível por HTTPS para login, compras e validações.

No Windows, se `--check` indicar caminhos longos desativados ou CMake/Ninja ausente, execute no terminal normal, na raiz do repositório:

```powershell
npm run local:app:setup
```

Se necessário, o comando abre a confirmação de administrador do Windows (UAC): confirme **Sim**. Apenas a operação fixa que habilita `LongPathsEnabled` é executada com elevação; npm, SDK Manager e build continuam com as permissões do terminal original. Se cancelar, o comando explica como repetir; se a política já estiver ligada, não pede elevação. Uma política corporativa pode impedir a alteração mesmo após autorizar.

Esse preparo instala somente o CMake 3.31.6/Ninja 1.12.1 pelo SDK Manager oficial, caso ausentes, ao lado das versões existentes. Não move Java/SDK, não altera variáveis persistentes (`PATH`, `JAVA_HOME`, `ANDROID_HOME`) nem configurações globais do Gradle. A seleção do CMake acontece somente no build deste projeto. `LongPathsEnabled` é uma configuração global do Windows para ferramentas compatíveis com caminhos longos; não é uma mudança na localização das ferramentas. Reinicie o Windows quando essa política tiver sido alterada e depois use `npm run local:app` no terminal normal. O script não reinicia o computador nem compila o app durante o setup. Referência: [elevação de processo no PowerShell](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-5.1).

## Como funciona

1. Confere Java, Android SDK, Build Tools e NDK usando os requisitos do React Native instalado.
2. Cria uma assinatura privada local na primeira execução e reutiliza a mesma chave nas seguintes.
3. Executa o CLI do Expo instalado no projeto para gerar/atualizar `apps/mobile/android`, usando o template incluído no SDK, sem apagar a pasta e sem reinstalar dependências.
4. Executa o Gradle Wrapper desse projeto com `:app:assembleRelease`. A versão do Gradle vem do wrapper, independentemente do Gradle global usado por outros projetos.
5. O Gradle compila o app nativo e inclui JavaScript, fontes e imagens no APK. A assinatura é conferida com o `apksigner.jar` do Build Tools via Java antes de copiar o resultado para `dist/android`. Os caminhos são passados diretamente como argumentos, sem o interpretador `cmd.exe` ou o wrapper `.bat` do verificador. Falha de verificação preserva o APK no diretório de saída do Gradle e é reportada separadamente de falha na compilação.

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

# Preparação única no Windows: CMake/Ninja recente e política de caminhos longos
# Execute no terminal normal e confirme o pedido do Windows, se aparecer.
npm run local:app:setup

# Ver etapas e destino sem executar ferramentas
npm run local:app -- --plan

# Gerar AAB com a mesma chave local
npm run local:app -- --aab
```

O AAB é salvo em `dist/android/socio-esporte-release.aab`; para instalar diretamente em um aparelho, use o APK. Para publicar no Google Play, configure a chave de upload correspondente à conta e incremente `android.versionCode` no `apps/mobile/app.json`, além da versão do app, em cada nova publicação. As exigências da loja e a submissão são etapas separadas.

## Ferramentas

### Caminhos longos no Windows

O comando cria automaticamente uma unidade virtual temporária com `SUBST`, usando uma letra livre (por exemplo, `R:\`). Ela aponta para a raiz do repositório sem mover ou copiar arquivos. O prebuild, autolinking e Gradle executam por esse caminho curto; a unidade criada pelo comando é liberada ao terminar, inclusive quando o build falha. Unidades já existentes não são substituídas.

O `apps/mobile/metro.config.js` mantém a configuração automática de monorepo do Expo e acrescenta o caminho físico de `packages/shared` às pastas visíveis do Metro. Isso permite seguir a junction do npm para `@nacional/shared` mesmo quando a compilação usa `R:\` e o destino real permanece em `C:\`. A resolução continua usando os exports do pacote; não é necessário trocar imports ou reinstalar o workspace por causa do atalho. Veja [configuração de workspaces](https://docs.expo.dev/guides/monorepos/) e [visibilidade de links no Metro](https://metrobundler.dev/docs/configuration/#watchfolders).

Na primeira tentativa com o caminho curto, ou quando a letra de build mudar, o script invalida somente saídas geradas do Android (`app/.cxx`, `app/build`, `android/build` e caches `.cxx` de módulos dentro do repositório). Isso remove referências absolutas da tentativa anterior. A limpeza confere os destinos antes de remover qualquer pasta e recusa junctions/destinos externos. Código-fonte, `.env`, chaves e caches globais do Gradle/SDK são preservados. Com o mesmo caminho, os próximos builds continuam incrementais.

O atalho sozinho não basta quando uma junction nativa continua apontando para o caminho físico longo. Por isso o comando Windows exige **CMake 3.31.6, Ninja >= 1.12 e a política `LongPathsEnabled=1`** antes de executar Gradle. O init script aplica essa versão do CMake a todos os módulos Android e a propriedade `android.cmakeVersion` é passada somente neste build. O limite artificial anterior de 200 caracteres foi retirado. A atualização da configuração invalida os caches CMake antigos na próxima compilação.

As tarefas de codegen do React Native calculam caminhos relativos no Windows. Para evitar `this and base files have different roots` quando o autolinking retorna uma biblioteca em `C:\` e o build usa `R:\`, o init script normaliza os diretórios dessas tarefas para o caminho original do repositório: ferramentas, fontes, saídas, `package.json`, base de cálculo e diretório real do processo Node. A normalização ocorre após a configuração dos plugins, cobre geração de schema e de artefatos (app e bibliotecas) e não altera arquivos de `node_modules`. O CMake continua usando o caminho curto. Não é necessário limpar caches globais, reinstalar Java/SDK ou mover o projeto. Depois dessa correção, execute novamente `npm run local:app`; a geração do APK permanece a cargo do desenvolvedor.

Essas configurações ficam nos scripts versionados e não dependem de editar arquivos gerados ou `node_modules`. Referências: [limites de caminhos no Expo](https://docs.expo.dev/troubleshooting/windows-long-paths/), [SUBST do Windows](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/subst) e [instalação de CMake pelo SDK Manager](https://developer.android.com/tools/sdkmanager).

Após um erro `Filename longer than 260 characters`, execute `npm run local:app -- --check` com o script atualizado e conclua a preparação indicada antes de compilar novamente. Não é necessário mover o repositório ou trocar de branch. Se o terminal for encerrado à força e deixar uma unidade virtual, confira com `subst` e remova somente o atalho desse build com `subst R: /D` (substituindo a letra indicada no log).

O script lê `node_modules/react-native/gradle/libs.versions.toml`; com as dependências atuais, são necessários SDK 37, Build Tools 37.0.0 e NDK 27.1.12297006, além de JDK 17 ou superior. No Windows também verifica CMake/Ninja e a política de caminhos longos. `ANDROID_JAVA_HOME` permite escolher um JDK só para este app; caso ausente, usa `JAVA_HOME` ou o Java disponível. `ANDROID_SDK_ROOT`/`ANDROID_HOME` selecionam o SDK, com detecção do caminho padrão do Android Studio quando necessário.

Se faltar algum componente, instale a versão indicada pelo SDK Manager do Android Studio e aceite as licenças. Não é necessário alterar o Gradle de outros projetos. O primeiro build pode baixar a distribuição do wrapper e dependências Maven; portanto, **build local não significa build sem internet**. As seguintes execuções reaproveitam o cache nativo.

O build nativo e a instalação em aparelho ficam por conta do desenvolvedor. Na preparação deste comando não foram executados prebuild, Gradle ou geração de chaves reais. Os testes usam arquivos temporários e chaves fictícias para validar a configuração e a preservação da identidade.
