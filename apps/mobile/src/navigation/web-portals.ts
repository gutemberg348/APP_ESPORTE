export const portalPaths = { app: '/', staff: '/acesso/' } as const;
type WebPortal = keyof typeof portalPaths | 'business';

export function webPortal(pathname: string): WebPortal {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/app/parceiro') return 'business';
  if (['/acesso', '/administracao-geral', '/admin', '/portaria', '/bilheteria'].includes(path)) return 'staff';
  return 'app';
}

export function accountPortal(role: string) {
  if (role === 'USER') return 'app';
  if (['OWNER', 'ADMIN', 'GATE', 'TICKET_SELLER', 'CASHIER'].includes(role)) return 'staff';
  return null;
}
