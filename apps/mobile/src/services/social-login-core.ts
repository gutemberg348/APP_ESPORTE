export type SocialProvider = 'google' | 'apple';
export const socialRedirect = 'nacional://auth/social';
export function readSocialCallback(value: string, expectedAttempt: string) {
  const url = new URL(value);
  if (`${url.protocol}//${url.host}${url.pathname}` !== socialRedirect || url.searchParams.get('attempt') !== expectedAttempt) throw new Error('O retorno do login não corresponde a esta tentativa. Tente novamente.');
  if (url.searchParams.get('error') === 'canceled') return null;
  if (url.searchParams.has('error')) throw new Error('Não foi possível confirmar o login com o provedor. Tente novamente ou entre com e-mail.');
  const ticket = url.searchParams.get('ticket');
  if (!ticket || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new Error('O login retornou uma confirmação inválida. Tente novamente.');
  return ticket;
}
