export const portalPaths = { app: '/', staff: '/acesso/', owner: '/administracao-geral/' } as const;
type WebPortal = keyof typeof portalPaths | 'business';

export function webPortal(pathname: string): WebPortal {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/app/parceiro') return 'business';
  if (path === '/administracao-geral') return 'owner';
  if (['/acesso', '/admin', '/portaria', '/bilheteria'].includes(path)) return 'staff';
  return 'app';
}

export function accountPortal(role: string) {
  if (role === 'USER') return 'app';
  if (role === 'OWNER') return 'owner';
  if (['ADMIN', 'GATE', 'TICKET_SELLER', 'CASHIER'].includes(role)) return 'staff';
  return null;
}
