import { authService } from '../services/auth.service.js';
import { loginSchema, registerSchema, refreshSchema, changePasswordSchema } from '../validators/index.js';
export const authController = {
  register: async (ctx) => ({ status: 201, data: await authService.register(registerSchema.parse(ctx.body)) }),
  login: async (ctx) => ({ data: await authService.login(loginSchema.parse(ctx.body)) }),
  refresh: async ({ body }) => ({ data: await authService.refresh(refreshSchema.parse(body).refreshToken) }),
  logout: async ({ sessionId }) => { await authService.logout(sessionId); return { status: 204 }; },
  logoutAll: async ({ user }) => { await authService.logoutAll(user); return { status: 204 }; },
  sessions: async ({ user, sessionId }) => ({ data: await authService.listSessions(user, sessionId) }),
  changePassword: async ({ user, body }) => { await authService.changePassword(user, changePasswordSchema.parse(body)); return { status: 204 }; },
};
