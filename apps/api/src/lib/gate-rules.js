import { isAdminRole } from './admin-roles.js';
import { randomBytes } from 'node:crypto';
import { AppError } from './errors.js';
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function newGateCode() {
  const raw = [...randomBytes(10)].map((value) => alphabet[value % alphabet.length]).join('');
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}
export function normalizeGateCode(code) {
  const value = typeof code === 'string' ? code.replace(/[\s-]/g, '').toUpperCase() : '';
  if (!/^[2-9A-HJ-NP-Z]{10}$/.test(value)) throw new AppError(422, 'INVALID_GATE_CODE', 'Digite os 10 caracteres do código exibido no app do titular.');
  return value;
}
export function assertGateUser(user) {
  if (!user?.active || !(isAdminRole(user.role) || user.role === 'GATE')) throw new AppError(403, 'GATE_REQUIRED', 'Acesso restrito à equipe de portaria.');
}
export function assertGateScope(user, assignment) {
  assertGateUser(user);
  if (!isAdminRole(user.role) && (!assignment?.active || assignment.userId !== user.id)) throw new AppError(403, 'GATE_SCOPE_DENIED', 'Você não está escalado para esta partida e setor.');
}
export function assertGateRoute(user, route) {
  if (route.ticketSeller && (!user?.active || !['TICKET_SELLER', 'ADMIN'].includes(user.role))) throw new AppError(403, 'TICKET_SELLER_REQUIRED', 'Acesso restrito à bilheteria.');
  if (user?.role === 'TICKET_SELLER' && !route.ticketSeller && !route.staffSelf) throw new AppError(403, 'TICKET_SELLER_ONLY', 'Esta conta tem acesso somente à bilheteria e à própria conta.');
  if (user?.role === 'CASHIER' && !route.cashier && !route.staffSelf && !route.membershipCard) throw new AppError(403, 'CASHIER_ONLY_ACCOUNT', 'Esta conta tem acesso somente aos caixas autorizados e à segurança da própria conta.');
  if (user?.role === 'GATE' && !route.gate && !route.staffSelf && !route.membershipCard) throw new AppError(403, 'GATE_ONLY_ACCOUNT', 'Esta conta tem acesso somente à portaria e à segurança da própria conta.');
}
