const roles = [
  { value: 'ADMIN', label: 'Administrador do time', description: 'Acesso ao painel e à gestão da equipe' },
  { value: 'TICKET_SELLER', label: 'Bilheteria', description: 'Venda presencial e emissão de ingressos' },
  { value: 'GATE', label: 'Portaria', description: 'Validação nos setores autorizados' },
  { value: 'CASHIER', label: 'Caixa de parceiro', description: 'Vendas nos parceiros autorizados' },
];

export function staffRoleOptions(owner: boolean) {
  return owner ? roles : roles.filter(role => role.value !== 'ADMIN');
}
