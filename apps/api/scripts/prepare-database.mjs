import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Run only when explicitly invoked. This never starts Docker, API or mobile.
const prisma = resolve('../../node_modules/prisma/build/index.js');
for (const args of [[prisma, 'generate'], [prisma, 'migrate', 'deploy'], ['prisma/bootstrap.js']]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
