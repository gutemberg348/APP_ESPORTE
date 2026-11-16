import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { stat } from 'node:fs/promises';

export const WINDOWS_CMAKE_VERSION = '3.31.6';
export function parseLongPathsEnabled(output) {
  return Number.parseInt(output.match(/LongPathsEnabled\s+REG_DWORD\s+(0x[\da-f]+|\d+)/i)?.[1] || '0') === 1;
}
export function supportsLongNinjaPaths(version) {
  const parts = version.trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  return Boolean(parts && (Number(parts[1]) > 1 || (Number(parts[1]) === 1 && Number(parts[2]) >= 12)));
}
export async function checkWindowsNativeTools({ sdk, env, platform = process.platform, invoke = spawnSync }) {
  if (platform !== 'win32') return {};
  const cmake = join(sdk, 'cmake', WINDOWS_CMAKE_VERSION, 'bin/cmake.exe');
  const ninja = join(sdk, 'cmake', WINDOWS_CMAKE_VERSION, 'bin/ninja.exe');
  const blockers = [];
  const policy = invoke('reg.exe', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\FileSystem', '/v', 'LongPathsEnabled'], { env, encoding: 'utf8', windowsHide: true });
  if (policy.error || policy.status !== 0 || !parseLongPathsEnabled(policy.stdout || '')) blockers.push('O suporte a caminhos longos está desativado no Windows.');
  for (const executable of [cmake, ninja]) {
    try { await stat(executable); } catch (error) { if (error.code !== 'ENOENT') throw error; blockers.push(`Ferramenta ausente: ${executable}.`); }
  }
  if (blockers.length) throw new Error(`${blockers.join('\n')}\nExecute npm run local:app:setup no terminal normal. O Windows solicitará permissão de administrador se necessário; confirme Sim e depois reinicie o Windows. Essa preparação não compila o app.`);
  const cmakeResult = invoke(cmake, ['--version'], { env, encoding: 'utf8', windowsHide: true });
  const ninjaResult = invoke(ninja, ['--version'], { env, encoding: 'utf8', windowsHide: true });
  if (cmakeResult.status !== 0 || !cmakeResult.stdout?.includes(`cmake version ${WINDOWS_CMAKE_VERSION}`) || ninjaResult.status !== 0 || !supportsLongNinjaPaths(ninjaResult.stdout || '')) throw new Error(`CMake/Ninja incompatível ou incompleto. Execute npm run local:app:setup para preparar CMake ${WINDOWS_CMAKE_VERSION} com Ninja >= 1.12.`);
  console.log(`Ferramentas Windows: CMake ${WINDOWS_CMAKE_VERSION}, Ninja ${ninjaResult.stdout.trim()}, caminhos longos habilitados.`);
  return { cmakeVersion: WINDOWS_CMAKE_VERSION };
}
