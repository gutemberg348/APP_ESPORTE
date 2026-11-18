import assert from 'node:assert/strict';
import { testPixWebhook } from '../../src/services/pix-webhook-test.js';

export function simulateApproval(db, settings, id, now, handler) {
  const base = 'https://example.test/v1/payments/webhooks/sicredi';
  return testPixWebhook(db, { ...settings, SICREDI_PIX_WEBHOOK_URL: base }, id, {
    now,
    readRegistration: async () => ({ webhookUrl: base + '/' + settings.SICREDI_PIX_WEBHOOK_TOKEN }),
    fetcher: async (url, options) => {
      const [token] = url.slice(base.length + 1).split('/');
      const body = JSON.parse(options.body);
      assert.deepEqual(body, { pix: [] });
      try { return Response.json({ data: await handler.webhook(token, body) }); }
      catch (error) { return Response.json({ error: { code: error.code } }, { status: error.status }); }
    },
  });
}
