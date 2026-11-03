# Atualização para Expo SDK 58 — 03/11/2026

O app foi atualizado de SDK 57 para SDK 58 para corresponder ao Expo Go 58 instalado no iPhone. A atualização usa o conjunto recomendado pelo próprio Expo (`expo install --fix`), com lockfile atualizado.

| Dependência | Versão configurada |
| --- | --- |
| Expo | `~58.0.22` |
| React / React DOM | `19.3.0` |
| React Native | `0.88.1` |
| Tipos React | `~19.3.0` |
| Expo Camera | `~58.0.14` |
| Expo SecureStore | `~58.0.2` |
| Expo Font | `~58.0.11` |
| Expo Blur | `~58.0.5` |
| Expo Clipboard | `~58.0.4` |
| Expo Keep Awake | `~58.0.3` |
| Expo Linear Gradient | `~58.0.3` |
| Expo Status Bar | `~58.0.4` |
| Safe Area Context | `~5.10.1` |
| React Native SVG | `15.16.0` |

O instalador adicionou os config plugins de fontes e status bar ao `apps/mobile/app.json`. `Linking.getInitialURL` no React Native atualizado também pode retornar `undefined`; o handler de abertura em `AppNavigator.tsx` foi ajustado para aceitar esse caso, preservando o comportamento dos links.

## Abrir no iPhone

1. Encerre o Metro antigo no terminal em que você o iniciou, com Ctrl+C.
2. Na raiz do projeto, execute:

```powershell
npm run dev:mobile:clear
```

3. Abra o QR novo no Expo Go 58. Não reutilize a sessão do servidor anterior com SDK 57.

Não é necessário mudar o banco ou a API para esta atualização. A URL da API no celular continua precisando apontar para o IP do computador, e não para `localhost`.

O comando acima só inicia o app quando executado pelo responsável. Durante a atualização, não foram iniciados o app interativo, a API ou o banco. A exportação do bundle usa o empacotador sem abrir uma prévia do aplicativo.

## Verificações

- `expo install --check`: dependências atualizadas e compatíveis.
- `expo-doctor`: 20/20 verificações passaram.
- `npm run check`: sintaxe da API e TypeScript do app passaram após o ajuste de Linking.
- Testes isolados do mobile: 9 passaram.
- Bundle iOS exportado com sucesso em `.artifacts/sdk58-ios`, com 2.957 módulos e bytecode Hermes. Isso verifica o empacotamento, sem substituir a execução no aparelho.
- A execução nativa pelo Expo Go no iPhone ainda precisa ser conferida no aparelho.

Referências: [guia oficial de atualização](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/) e [mudanças do SDK 58](https://expo.dev/changelog/sdk-58).
