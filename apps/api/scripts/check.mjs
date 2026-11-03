import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function check(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) await check(file);
    else if (/\.(js|mjs)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  }
}
await check('src');
await check('prisma');
await check('scripts');
await check('test');
console.log('Sintaxe JavaScript válida.');
