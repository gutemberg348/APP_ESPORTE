import { env } from '../src/config/env.js';

// No authorization request, access token, password or secret is printed or sent.
const origin = env.SOCIAL_PUBLIC_API_URL.replace(/\/$/, '');
const checks = {
  clientIdConfigured: Boolean(env.GOOGLE_CLIENT_ID),
  clientIdFormat: Boolean(env.GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com')),
  clientSecretConfigured: Boolean(env.GOOGLE_CLIENT_SECRET),
  publicHttpsOrigin: Boolean(origin && /^https:\/\/[^/?#]+$/.test(origin)),
};
try {
  if (checks.publicHttpsOrigin) {
    console.log(JSON.stringify({ callbackToRegister: `${origin}/v1/auth/social/google/callback` }));
    const response = await fetch(`${origin}/v1/auth/social/providers`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    checks.publicApiGoogleEnabled = response.ok && (await response.json())?.data?.google === true;
  } else checks.publicApiGoogleEnabled = false;
} catch { checks.publicApiGoogleEnabled = false; }
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks, actualGoogleLoginTested: false, note: 'Use cliente OAuth do tipo Aplicativo da Web. O redirect e os usuários de teste devem estar autorizados no Google Cloud. Após alterar .env, recrie o container api.' }));
if (!ok) process.exitCode = 1;
