import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['--test', 'test/integration.test.js', 'test/payments-integration.test.js', 'test/admin-integration.test.js', 'test/auth-integration.test.js', 'test/ticket-entry-integration.test.js', 'test/gate-staff-integration.test.js'], { stdio: 'inherit', env: { ...process.env, RUN_DB_TESTS: 'true' } });
process.exitCode = result.status ?? 1;
