$ErrorActionPreference = 'Stop'
$cmakeVersion = '3.31.6'
$changedPolicy = $false

function Enable-AndroidLongPaths {
    $policyPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem'
    if ((Get-ItemProperty -LiteralPath $policyPath -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled -eq 1) { return $false }

    Write-Host 'O Windows vai pedir permissao para habilitar caminhos longos. Confirme Sim na janela de seguranca.'
    Write-Host 'Somente LongPathsEnabled sera alterado. Java, Gradle, SDK e variaveis globais permanecem como estao.'
    # Elevate only this fixed registry operation, never npm, the project, or SDK Manager.
    # No project paths, environment values or credentials enter the elevated command.
    $policyCommand = @'
$ErrorActionPreference = 'Stop'
try {
    $policyPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem'
    New-ItemProperty -LiteralPath $policyPath -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force | Out-Null
    if ((Get-ItemProperty -LiteralPath $policyPath -Name LongPathsEnabled).LongPathsEnabled -ne 1) { exit 1 }
    exit 0
} catch { exit 1 }
'@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($policyCommand))
    try {
        $process = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -WindowStyle Hidden -ArgumentList @('-NoProfile', '-NonInteractive', '-EncodedCommand', $encoded) -Wait -PassThru -ErrorAction Stop
    } catch {
        $cause = $_.Exception
        while ($cause) {
            if ($cause -is [ComponentModel.Win32Exception] -and $cause.NativeErrorCode -eq 1223) {
                throw 'Permissao cancelada no Windows. Execute npm run local:app:setup novamente e confirme Sim. Nenhum build foi iniciado.'
            }
            $cause = $cause.InnerException
        }
        throw 'Nao foi possivel solicitar a permissao do Windows. Abra um PowerShell como administrador e execute npm run local:app:setup.'
    }
    if ($process.ExitCode -ne 0 -or (Get-ItemProperty -LiteralPath $policyPath -Name LongPathsEnabled -ErrorAction SilentlyContinue).LongPathsEnabled -ne 1) {
        throw 'O Windows nao confirmou LongPathsEnabled=1. A politica pode estar bloqueada pelo administrador do computador. Nenhum build foi iniciado.'
    }
    Write-Host 'Suporte a caminhos longos habilitado. Reinicie o Windows antes de compilar.'
    return $true
}

try {
    $changedPolicy = Enable-AndroidLongPaths

    $sdkRoot = $env:ANDROID_SDK_ROOT
    if (-not $sdkRoot) { throw 'ANDROID_SDK_ROOT nao foi definido pelo comando local:app:setup.' }
    $cmake = Join-Path $sdkRoot "cmake\$cmakeVersion\bin\cmake.exe"
    $ninja = Join-Path $sdkRoot "cmake\$cmakeVersion\bin\ninja.exe"
    if (-not (Test-Path -LiteralPath $cmake) -or -not (Test-Path -LiteralPath $ninja)) {
        $sdkManager = Join-Path $sdkRoot 'cmdline-tools\latest\bin\sdkmanager.bat'
        if (-not (Test-Path -LiteralPath $sdkManager)) { throw 'Instale Android SDK Command-line Tools (latest) pelo SDK Manager do Android Studio.' }
        Write-Host "Instalando somente CMake $cmakeVersion e o Ninja que acompanha essa versao..."
        $previousPreference = $ErrorActionPreference
        try {
            # Older SDK Managers may emit harmless XML compatibility warnings on stderr.
            # Keep them visible and use the real process exit code to decide success.
            $ErrorActionPreference = 'Continue'
            & $sdkManager "--sdk_root=$sdkRoot" --install "cmake;$cmakeVersion"
            $installExitCode = $LASTEXITCODE
        } finally { $ErrorActionPreference = $previousPreference }
        if ($installExitCode -ne 0) { throw 'O SDK Manager falhou. Confira a conexao e aceite as licencas pelo Android Studio.' }
    }
    & $cmake --version
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel executar o CMake instalado.' }
    $ninjaVersion = & $ninja --version
    if ($LASTEXITCODE -ne 0 -or $ninjaVersion -notmatch '^(\d+)\.(\d+)') { throw 'Nao foi possivel verificar a versao do Ninja.' }
    if ([int]$Matches[1] -lt 1 -or ([int]$Matches[1] -eq 1 -and [int]$Matches[2] -lt 12)) { throw 'O Ninja instalado precisa ser 1.12 ou superior.' }
    Write-Host "Ninja $ninjaVersion pronto. O CMake antigo permanece instalado para os outros projetos."
    if ($changedPolicy) { Write-Host 'Reinicie o Windows antes da proxima compilacao para aplicar a politica a todas as ferramentas.' }
    Write-Host 'Preparacao concluida. Depois, execute npm run local:app no terminal normal. Nenhum APK foi gerado.'
    exit 0
} catch {
    Write-Error $_.Exception.Message -ErrorAction Continue
    if ($changedPolicy) { Write-Host 'A politica de caminhos longos foi habilitada; reinicie o Windows e execute a preparacao novamente para concluir as ferramentas.' }
    exit 1
}
