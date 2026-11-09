export interface FinancialSettings {
  id: string;
  companyName: string;
  companyBps: number;
  commissionBase: "NET" | "GROSS";
  gatewayBps: number;
  gatewayFixedCents: number;
  payoutWeekday: number;
  clubRecipient: string;
  clubPixKey: string;
  version: number;
  updatedAt: string;
}
export interface ClubPayout {
  id: string;
  amountCents: number;
  balanceBeforeCents: number;
  recipient: string;
  reference: string;
  transferredAt: string;
  notes: string;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  actor?: { name: string; email: string };
  withdrawal?: { id: string } | null;
}
export type WithdrawalStatus = 'PENDING' | 'SENT' | 'CANCELED' | 'VOIDED';
export interface WithdrawalRequest { id: string; amountCents: number; recipient: string; pixKey: string; notes: string; status: WithdrawalStatus; version: number; payoutId: string | null; createdAt: string; resolvedAt: string | null; resolutionReason: string | null; actor: { name: string; email: string }; payout: { id: string; reference: string; transferredAt: string; voidedAt: string | null } | null; _count: { attachments: number } }
export interface WithdrawalSummary { availableCents: number; availableToRequestCents: number; pendingCents: number; pendingCount: number; totalSentCents: number; outstandingCents: number }
export type ReceiptParent = { withdrawalId: string; payoutId?: never } | { payoutId: string; withdrawalId?: never };
export interface PayoutAttachment { id: string; name: string; mimeType: string; byteLength: number; sha256: string; createdAt: string; removedAt: string | null; removalReason: string | null }
export interface FinancialSummary {
  grossCents: number;
  refundedCents: number;
  gatewayFeeCents: number;
  companyCents: number;
  clubEarnedCents: number;
  totalSentCents: number;
  outstandingCents: number;
  availableCents: number;
  pendingFeeCount: number;
  blockedCount: number;
  legacyCount: number;
  legacyGrossCents: number;
  schedule: { due: boolean; scheduledDay: string; nextDay: string };
  lastPayout: ClubPayout | null;
  serverTime: string;
}
export interface TicketFinancial {
  id: string;
  policy: {
    companyBps: number;
    commissionBase: "NET" | "GROSS";
    settingsVersion: number;
  };
  grossCents: number;
  refundedCents: number;
  gatewayFeeCents: number;
  feeSource: "PROVIDER" | "MANUAL" | "ESTIMATED";
  companyCents: number;
  clubCents: number;
  blocked: boolean;
  version: number;
  createdAt: string;
  payment?: {
    method: string;
    reference: string;
    confirmedAt: string;
    ticket: {
      id: string;
      quantity: number;
      match: { homeTeam: string; awayTeam: string };
      user: { name: string; email: string };
    };
  };
}
