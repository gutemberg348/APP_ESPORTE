import { AppError } from './errors.js';

export const isAdminRole = (role) => role === 'ADMIN' || role === 'OWNER';

export function assertAdminRole(user, role) {
  if (user?.role === role && user.active !== false) return;
  if (role === 'OWNER') {
    throw new AppError(403, 'OWNER_REQUIRED', 'Esta operação é exclusiva da administração da empresa.');
  }
  throw new AppError(403, 'CLUB_ADMIN_REQUIRED', 'O pedido de saque deve ser feito pela administração do clube.');
}

export function managedStaffRoles(actorRole) {
  const staff = ['TICKET_SELLER', 'GATE', 'CASHIER'];
  if (actorRole === 'OWNER') return ['ADMIN', ...staff];
  return actorRole === 'ADMIN' ? staff : [];
}

export function assertManagedAccount(user, actorRole) {
  if (user?.role === 'OWNER') throw new AppError(403, 'OWNER_ACCOUNT_PROTECTED', 'A conta da empresa é gerenciada pelo próprio titular.');
  if (!isAdminRole(actorRole) || (user.role !== 'USER' && !managedStaffRoles(actorRole).includes(user.role))) {
    throw new AppError(403, 'ACCOUNT_HIERARCHY', 'Somente a administração geral pode gerenciar este acesso.');
  }
}
