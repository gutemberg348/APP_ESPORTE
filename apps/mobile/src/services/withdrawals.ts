import type {
  WithdrawalRequest,
  WithdrawalSummary,
  ReceiptParent,
  PayoutAttachment,
} from "@nacional/shared/finance";
import { request } from "./api";
export const withdrawalsApi = {
  summary: (token: string) =>
    request<WithdrawalSummary>("/admin/withdrawals/summary", { token }),
  list: (token: string, filters: Record<string, string>) =>
    request<{ items: WithdrawalRequest[]; total: number }>(
      "/admin/withdrawals?" +
        new URLSearchParams(
          Object.entries(filters).filter(([, value]) => value !== ""),
        ),
      { token },
    ),
  create: (
    token: string,
    body: {
      amountCents: number;
      expectedAvailableCents: number;
      recipient: string;
      pixKey: string;
      notes: string;
      requestKey: string;
    },
  ) =>
    request<WithdrawalRequest>("/admin/withdrawals", {
      token,
      method: "POST",
      body,
    }),
  cancel: (token: string, id: string, version: number, reason: string) =>
    request<WithdrawalRequest>("/admin/withdrawals/cancel", {
      token,
      method: "POST",
      body: { id, version, reason },
    }),
  send: (
    token: string,
    body: {
      id: string;
      version: number;
      expectedBalanceCents: number;
      reference: string;
      transferredAt: string;
      notes: string;
      transferVerified: true;
      requestKey: string;
    },
  ) =>
    request<WithdrawalRequest>("/admin/withdrawals/send", {
      token,
      method: "POST",
      body,
    }),
  attachments: (token: string, parent: ReceiptParent) =>
    request<PayoutAttachment[]>(
      "/admin/withdrawals/attachments?" +
        new URLSearchParams(
          parent.withdrawalId
            ? { withdrawalId: parent.withdrawalId }
            : { payoutId: parent.payoutId! },
        ),
      { token },
    ),
  upload: (
    token: string,
    parent: ReceiptParent,
    file: { name: string; mimeType: string; base64: string },
  ) =>
    request<PayoutAttachment>("/admin/withdrawals/attachments", {
      token,
      method: "POST",
      body: { ...parent, ...file },
      timeoutMs: 60000,
    }),
  content: (token: string, id: string) =>
    request<{ id: string; name: string; mimeType: string; base64: string }>(
      "/admin/withdrawals/attachments/content",
      { token, method: "POST", body: { id }, timeoutMs: 60000 },
    ),
  remove: (token: string, id: string, reason: string) =>
    request("/admin/withdrawals/attachments", {
      token,
      method: "DELETE",
      body: { id, reason },
    }),
};
