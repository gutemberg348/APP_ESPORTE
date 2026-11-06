import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { createAsaasClient } from '../payments/asaas-client.js';
import { createAsaasStore } from '../models/asaas.store.js';

export const asaasStore = createAsaasStore(db, { settings: env, api: createAsaasClient({ apiKey: env.ASAAS_API_KEY, environment: env.ASAAS_ENVIRONMENT, timeoutMs: env.ASAAS_TIMEOUT_MS }) });
export function startPaymentWorker({ store = asaasStore, settings = env, logger = console } = {}) {
  if (settings.PAYMENT_MODE !== 'asaas') return async () => {};
  let stopping = false, timer, active;
  const run = () => {
    active = store.tick().catch(() => logger.error('ASAAS_WORKER_RETRY: falha ao processar a fila; a próxima rodada retomará os registros pendentes.')).finally(() => {
      if (!stopping) timer = setTimeout(run, settings.PAYMENT_WORKER_INTERVAL_MS).unref();
    });
  };
  run();
  return async () => { stopping = true; clearTimeout(timer); await active; };
}
