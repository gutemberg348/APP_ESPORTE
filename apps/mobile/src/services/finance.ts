import type {
  FinancialSettings,
  FinancialSummary,
  ClubPayout,
  TicketFinancial,
} from "@nacional/shared/finance";
import { request } from "./api";
export const financeApi = {
  settings: (token: string) =>
    request<FinancialSettings>("/admin/finance/settings", { token }),
  saveSettings: (
    token: string,
    body: Omit<FinancialSettings, "id" | "updatedAt">,
  ) =>
    request<FinancialSettings>("/admin/finance/settings", {
      token,
      method: "PUT",
      body,
    }),
  summary: (token: string) =>
    request<FinancialSummary>("/admin/finance/summary", { token }),
  receipts: (token: string, filters: Record<string, string>) =>
    request<{ items: TicketFinancial[]; total: number }>(
      `/admin/finance/receipts?${new URLSearchParams(filters)}`,
      { token },
    ),
  payouts: (token: string, filters: Record<string, string>) =>
    request<{ items: ClubPayout[]; total: number }>(
      `/admin/finance/payouts?${new URLSearchParams(filters)}`,
      { token },
    ),
  refundCosts: (token: string, filters: Record<string, string>) =>
    request<{
      items: {
        id: string;
        grossCents: number;
        refundedCents: number;
        gatewayFeeCents: number;
        createdAt: string;
        intent: { providerReference: string; ticketId: string };
      }[];
      total: number;
    }>(`/admin/finance/refund-costs?${new URLSearchParams(filters)}`, {
      token,
    }),
  payout: (
    token: string,
    body: {
      amountCents: number;
      expectedBalanceCents: number;
      reference: string;
      recipient: string;
      transferredAt: string;
      notes: string;
      transferVerified: true;
      requestKey: string;
    },
  ) =>
    request<ClubPayout>("/admin/finance/payouts", {
      token,
      method: "POST",
      body,
    }),
  voidPayout: (token: string, id: string, reason: string) =>
    request<ClubPayout>("/admin/finance/payouts/void", {
      token,
      method: "POST",
      body: { id, reason, confirmed: true },
    }),
  adoptLegacy: (token: string, reason: string) =>
    request<{ adopted: number }>("/admin/finance/legacy", {
      token,
      method: "POST",
      body: { reason, confirmed: true },
    }),
};
