import type { Employee } from '@nacional/shared/types';
import { request } from './api';
import type { AccountEditInput } from './admin';
export const employeeApi = {
  list: (token: string, search = '', offset = 0) => request<Employee[]>('/admin/employees?' + new URLSearchParams({ limit: '100', offset: String(offset), search }), { token }),
  create: (token: string, body: { name: string; email: string; password: string; role?: Employee['role']; contact?: string }) => request<Employee>('/admin/employees', { token, method: 'POST', body }),
  edit: (token: string, body: AccountEditInput & { role?: Employee['role'] }) => request<Employee>('/admin/employees', { token, method: 'PATCH', body }),
  password: (token: string, userId: string, password: string) => request('/admin/employees/password', { token, method: 'PUT', body: { userId, password } }),
};
