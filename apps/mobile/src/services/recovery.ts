import { send } from "./api-transport";
import { request } from "./api";
export interface EmailStatus {
  enabled: boolean;
  sender: string;
  publicUrl: string;
  ttlMinutes: number;
  deliveries: Record<string, number>;
}
export const recoveryApi = {
  request: (email: string, portal: "APP" | "ADMIN") =>
    send<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email, portal },
    }),
  validate: (token: string) =>
    send<{ valid: boolean; expiresAt: string }>(
      "/auth/reset-password/validate",
      { method: "POST", body: { token } },
    ),
  reset: (token: string, password: string) =>
    send<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: { token, password },
    }),
  forUser: (token: string, userId: string) =>
    request<{ message: string }>("/admin/users/recovery", {
      token,
      method: "POST",
      body: { userId },
    }),
  status: (token: string) => request<EmailStatus>("/admin/email", { token }),
  verify: (token: string) =>
    request<{ message: string }>("/admin/email/verify", {
      token,
      method: "POST",
    }),
};
