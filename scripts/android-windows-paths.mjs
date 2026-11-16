import { spawnSync } from 'node:child_process';
import { lstat, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// SUBST creates an alias, without moving/copying the repository or changing Windows.
// Allocate only an unused drive, and release only the mapping created by this call.
export async function withWindowsShortRoot(projectRoot, action, { platform = process.platform, invoke = spawnSync, occupied = exists, letters = 'RSTUVWXYZQPONMLKJIHGFE' } = {}) {
  if (platform !== 'win32') return action(projectRoot);
  const target = resolve(projectRoot);
  for (const letter of letters) {
    const drive = `${letter}:`, shortRoot = `${drive}\\`;
    if (await occupied(shortRoot)) continue;
    const mapped = invoke('subst.exe', [drive, target], { encoding: 'utf8', windowsHide: true });
    if (mapped.error) throw new Error('Não foi possível executar SUBST do Windows para encurtar o caminho do build.');
    if (mapped.status !== 0) continue; // A drive may have been assigned since the check.
    try { return await action(shortRoot); }
    finally {
      const released = invoke('subst.exe', [drive, '/D'], { encoding: 'utf8', windowsHide: true });
      if (released.error || released.status !== 0) console.error(`Não foi possível liberar o atalho temporário ${drive}. Confira com subst; para removê-lo, use subst ${drive} /D.`);
    }
  }
  throw new Error('Nenhuma letra de unidade livre para o build Android. Libere uma unidade virtual e execute novamente.');
}

function within(root, path) {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !resolve(path).startsWith('\\\\') && !/^[A-Za-z]:/.test(rel);
}

// Only generated Android/CMake outputs may be cleared after changing build paths.
// Sources, keystores, environments and global SDK/Gradle caches are never targets.
export async function resetNativePathCache(projectRoot, buildRoot) {
  const workspace = await realpath(projectRoot);
  const native = join(projectRoot, 'apps/mobile/android');
  if (!await exists(native)) return [];
  const marker = join(native, '.local-app-build-root.json');
  let previous;
  try { previous = JSON.parse(await readFile(marker, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  const version = 2; // Invalidate old CMake/Ninja cache and the previous 200-character cap.
  if (previous?.root === buildRoot && previous?.version === version) return [];
  const candidates = [join(native, 'app/.cxx'), join(native, '.cxx'), join(native, 'app/build'), join(native, 'build')];
  for (const modules of [join(projectRoot, 'node_modules'), join(projectRoot, 'apps/mobile/node_modules')]) {
    if (!await exists(modules)) continue;
    for (const entry of await readdir(modules, { withFileTypes: true })) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const directory = join(modules, entry.name);
      if (entry.name.startsWith('@')) {
        for (const pkg of await readdir(directory, { withFileTypes: true })) {
          if (pkg.isDirectory() || pkg.isSymbolicLink()) candidates.push(join(directory, pkg.name, 'android/.cxx'));
        }
      } else candidates.push(join(directory, 'android/.cxx'));
    }
  }
  // Validate every existing final target before deleting anything, including junctions.
  const targets = [];
  for (const candidate of candidates) {
    let entry;
    try { entry = await lstat(candidate); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const actual = await realpath(candidate);
    if (!within(workspace, actual) || entry.isSymbolicLink()) throw new Error(`Cache Android fora da pasta do projeto ou vinculado: ${candidate}. A limpeza foi interrompida.`);
    targets.push(actual);
  }
  for (const target of new Set(targets)) await rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 200 });
  await writeFile(marker, JSON.stringify({ root: buildRoot, version }, null, 2) + '\n');
  return targets;
}
