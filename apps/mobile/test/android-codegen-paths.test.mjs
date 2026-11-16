import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('real Groovy init hook unifies codegen roots for libraries and app without running Gradle', { skip: process.platform !== 'win32' }, async t => {
  const distributions = join(process.env.GRADLE_USER_HOME || join(homedir(), '.gradle'), 'wrapper/dists/gradle-9.4.1-bin');
  let entries;
  try { entries = await readdir(distributions, { withFileTypes: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return t.skip('Local Gradle 9.4.1 Groovy runtime not installed; no download is performed.'); }
  let lib;
  for (const entry of entries.filter(entry => entry.isDirectory())) {
    const candidate = join(distributions, entry.name, 'gradle-9.4.1/lib');
    try { if ((await readdir(candidate)).some(name => /^groovy-\d.*\.jar$/.test(name))) { lib = candidate; break; } }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!lib) return t.skip('Local Groovy runtime unavailable.');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin/java.exe') : 'java';
  const result = spawnSync(java, ['-cp', join(lib, '*'), 'groovy.ui.GroovyMain', fileURLToPath(new URL('./fixtures/android-codegen-paths.groovy', import.meta.url)), join(root, 'scripts/android-local.init.gradle')], {
    encoding: 'utf8', windowsHide: true, timeout: 30000,
    // Paths are fixtures only. There is no SUBST, disk access, deletion or build.
    env: { ...process.env, LOCAL_APP_SHORT_ROOT: 'R:\\', LOCAL_APP_ORIGINAL_ROOT: 'C:\\test workspace (android)\\nacional' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /mixed roots reproduced and normalized/);
});
