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
}
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
