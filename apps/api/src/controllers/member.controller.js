import { memberService } from '../services/member.service.js';
import { profileSchema, preferencesSchema, schoolSchema } from '../validators/index.js';
export const memberController = {
  profile: async ({ user }) => ({ data: memberService.profile(user) }),
  update: async ({ user, body }) => ({ data: await memberService.update(user, profileSchema.parse(body)) }),
  preferences: async ({ user, body }) => ({ data: await memberService.preferences(user, preferencesSchema.parse(body)) }),
  school: async ({ user, body }) => ({ data: await memberService.school(user, schoolSchema.parse(body).interested) }),
  dashboard: async ({ user }) => ({ data: await memberService.dashboard(user) }),
  card: async ({ user }) => ({ data: memberService.card(user) }),
};
