import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkWindowsNativeTools, parseLongPathsEnabled, supportsLongNinjaPaths, WINDOWS_CMAKE_VERSION } from '../../../scripts/android-windows-toolchain.mjs';

test('Windows long-path policy and Ninja versions require actual support, not only a short build drive', () => {
  assert.equal(parseLongPathsEnabled('LongPathsEnabled    REG_DWORD    0x1'), true);
  for (const output of ['LongPathsEnabled REG_DWORD 0x0', '', 'OtherSetting REG_DWORD 0x1']) assert.equal(parseLongPathsEnabled(output), false);
  for (const version of ['1.12.0', '1.12.1\r\n', '1.13.0', '2.0.0']) assert.equal(supportsLongNinjaPaths(version), true);
  for (const version of ['1.10.2', '1.11.9', '0.99.0', 'invalid']) assert.equal(supportsLongNinjaPaths(version), false);
});

test('Windows toolchain stops before Gradle with a concrete setup command when system support is disabled', async () => {
  const calls = [];
  await assert.rejects(checkWindowsNativeTools({ sdk: join(tmpdir(), 'nacional-sdk-not-installed'), platform: 'win32', invoke: (command) => { calls.push(command); return { status: 0, stdout: 'LongPathsEnabled REG_DWORD 0x0' }; } }), error => /desativado/.test(error.message) && /local:app:setup/.test(error.message) && /administrador/.test(error.message));
  assert.deepEqual(calls, ['reg.exe']);
  assert.deepEqual(await checkWindowsNativeTools({ sdk: '/sdk', platform: 'linux', invoke: () => { throw new Error('must not execute'); } }), {});
});

test('Windows toolchain selects the SDK CMake and rejects an old Ninja even when registry policy is enabled', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'nacional-native-tools-'));
  t.after(async () => { const target = resolve(temporary); assert.ok(!relative(resolve(tmpdir()), target).startsWith('..') && basename(target).startsWith('nacional-native-tools-')); await rm(target, { recursive: true, force: true }); });
  const bin = join(temporary, 'cmake', WINDOWS_CMAKE_VERSION, 'bin');
  await mkdir(bin, { recursive: true });
  for (const name of ['cmake.exe', 'ninja.exe']) await writeFile(join(bin, name), 'fixture, never executed');
  let version = '1.10.2';
  const invoke = command => ({ status: 0, stdout: command === 'reg.exe' ? 'LongPathsEnabled REG_DWORD 0x1' : command.endsWith('cmake.exe') ? `cmake version ${WINDOWS_CMAKE_VERSION}\n` : version });
  await assert.rejects(checkWindowsNativeTools({ sdk: temporary, platform: 'win32', invoke }), /Ninja incompatível/);
  version = '1.12.1\n';
  assert.deepEqual(await checkWindowsNativeTools({ sdk: temporary, platform: 'win32', invoke }), { cmakeVersion: WINDOWS_CMAKE_VERSION });
});

test('Windows setup requests only registry elevation, handles cancellation and verifies the result without changing real system settings', { skip: process.platform !== 'win32' }, () => {
  // Parse the real script, then load only its function. Mock OS boundaries before invoking it.
  // The setup body, SDK Manager and real UAC/registry writes are never executed.
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($env:TEST_ANDROID_SETUP, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$functionAst = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Enable-AndroidLongPaths'}, $true)
if (-not $functionAst) { throw 'Missing setup function' }
Invoke-Expression $functionAst.Extent.Text
function Get-ItemProperty {
    param($LiteralPath, $Name, $ErrorAction)
    if ($LiteralPath -ne 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -or $Name -ne 'LongPathsEnabled') { throw 'Unexpected registry read' }
    @{ LongPathsEnabled = $script:policy }
}
function New-ItemProperty { throw 'Parent must never mutate registry' }
function Start-Process {
    param($FilePath, $Verb, $WindowStyle, $ArgumentList, [switch]$Wait, [switch]$PassThru, $ErrorAction)
    $script:launches++
    if ($FilePath -ne (Join-Path $PSHOME 'powershell.exe') -or $Verb -ne 'RunAs' -or $WindowStyle -ne 'Hidden' -or -not $Wait -or -not $PassThru) { throw 'Invalid elevation' }
    if (($ArgumentList[0..2] -join ' ') -ne '-NoProfile -NonInteractive -EncodedCommand') { throw 'Invalid arguments' }
    $payload = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($ArgumentList[3]))
    $payloadAst = [Management.Automation.Language.Parser]::ParseInput($payload, [ref]$null, [ref]$null)
    $commands = @($payloadAst.FindAll({param($node) $node -is [Management.Automation.Language.CommandAst]}, $true) | ForEach-Object { $_.GetCommandName() })
    if (($commands -join ',') -ne 'New-ItemProperty,Out-Null,Get-ItemProperty') { throw 'Unexpected elevated operation' }
    if ($payload -notmatch '-Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force' -or $payload -match '\$env:|npm|gradle|sdkmanager') { throw 'Unsafe payload' }
    switch ($script:scenario) {
        'cancel' { throw [ComponentModel.Win32Exception]::new(1223) }
        'launchFailure' { throw [ComponentModel.Win32Exception]::new(5) }
        'failed' { return @{ExitCode = 1} }
        'unconfirmed' { return @{ExitCode = 0} }
        'success' { $script:policy = 1; return @{ExitCode = 0} }
        default { throw 'Unexpected elevation request' }
    }
}
foreach ($case in @('enabled', 'success', 'cancel', 'failed', 'unconfirmed', 'launchFailure')) {
    $script:scenario = $case; $script:launches = 0; $script:policy = 0
    if ($case -eq 'enabled') { $script:policy = 1 }
    $caught = $null; $result = $null
    try { $result = Enable-AndroidLongPaths } catch { $caught = $_.Exception.Message }
    if ($case -eq 'enabled') {
        if ($caught -or $result -ne $false -or $script:launches -ne 0) { throw 'Already enabled must be a no-op' }
    } elseif ($case -eq 'success') {
        if ($caught -or $result -ne $true -or $script:launches -ne 1) { throw "Elevation failed: $caught" }
        if ((Enable-AndroidLongPaths) -ne $false -or $script:launches -ne 1) { throw 'Setup must be idempotent' }
    } else {
        $expected = switch ($case) { 'cancel' { 'Permissao cancelada' } 'launchFailure' { 'Nao foi possivel solicitar' } default { 'nao confirmou' } }
        if (-not $caught -or $caught -notmatch $expected -or $script:launches -ne 1 -or $script:policy -ne 0) { throw "Failure handling incorrect for $($case): $caught" }
    }
}
Write-Output 'Setup scenarios passed; no real elevation, SDK installation or registry writes.'
`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, TEST_ANDROID_SETUP: fileURLToPath(new URL('../../../scripts/setup-android-windows.ps1', import.meta.url)) },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Setup scenarios passed/);
});
