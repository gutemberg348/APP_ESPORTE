export type Tab = 'home' | 'card' | 'fanzone' | 'benefits' | 'profile';
export interface Preferences { family: boolean; personalize: boolean; notifications: boolean; ranking: boolean }
export interface AuthTokens {
  accessToken: string; refreshToken: string; accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string; expiresIn: number; tokenType: 'Bearer';
}
export interface AuthResponse extends AuthTokens { member: Member }
export interface AuthSession { id: string; createdAt: string; lastUsedAt: string; expiresAt: string; current: boolean }
export interface Member {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'GATE';
  active: boolean;
  avatar: string | null;
  points: number;
  city: string;
  contact: string;
  preferences: Preferences;
  schoolInterested: boolean;
  membership: {
    memberId: string;
    status: 'ACTIVE' | 'PENDING' | 'EXPIRED';
    validUntil: string;
    plan: { name: string; discountPercent: number; priceCents: number };
  } | null;
}
export interface Sector { id: string; name: string; priceCents: number; capacity?: number; available?: number; salesEnabled?: boolean }
export interface Match {
  id: string;
  serverTime?: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  stadium: string;
  competition: string;
  isHome: boolean;
  published?: boolean;
  salesEnabled?: boolean;
  salesOpenAt?: string | null;
  salesCloseAt?: string | null;
  entryEnabled?: boolean;
  gateOpenAt?: string | null;
  gateCloseAt?: string | null;
  sectors: Sector[];
}
export interface Partner { id: string; name: string; discount: string; category: string; icon?: string; description?: string; conditions?: string; location?: string }
export interface Ticket {
  id: string;
  serverTime?: string;
  status: 'PENDING' | 'ISSUED' | 'USED' | 'CANCELED' | 'EXPIRED';
  priceCents: number;
  quantity: number;
  expiresAt: string | null;
  createdAt: string;
  usedQuantity?: number;
  remainingQuantity?: number;
  entryQr?: string | null;
  payment?: { method: 'MANUAL' | 'FREE'; amountCents: number; confirmedAt: string } | null;
  match: Match;
  sector: Sector;
}
export interface CardToken { token: string; expiresAt: string }
export interface TicketQr { token: string; qr: string; code: string; ticketId: string; expiresAt: string; serverTime: string; remainingQuantity: number }
export interface TicketQuote {
  match: Match; sector: Sector; quantity: number; available: number;
  unitPriceCents: number; subtotalCents: number; discountPercent: number; discountCents: number; totalCents: number;
  serverTime: string; expiresAt: string; paymentInstructions: string;
}
export interface GateCredential { token?: string; code?: string }
export interface Employee { id: string; name: string; email: string; role: 'GATE'; active: boolean; assignments: { sectorId: string; sectorName: string; matchId: string; matchLabel: string; active: boolean }[] }
export interface TicketReview extends Ticket { holder: string; qrExpiresAt: string; serverTime: string; decision: 'REVIEW'; message: string }
export interface AdmissionResult { ticket: Ticket & { holder: string }; duplicate: boolean; decision: 'ALLOW' | 'ALREADY_RECORDED'; admission: { id: string; quantity: number; createdAt: string } }
export interface PointEntry { id: string; amount: number; reason: string; createdAt: string }
export interface Reward { id: string; title: string; description: string; cost: number; stock: number; icon: string }
export interface Redemption { id: string; rewardId: string; cost: number; createdAt: string; reward: Reward }
export interface Engagement { checkedIn: boolean; day: string; ledger: PointEntry[]; rewards: Reward[]; redemptions: Redemption[]; ranking: { name: string; points: number; you: boolean }[] }
export interface Prediction { matchId: string; homeScore: number; awayScore: number }
export interface Dashboard { member: Member; nextMatch: Match | null; matches: Match[]; partners: Partner[]; tickets: Ticket[]; engagement: Engagement; predictions: Prediction[] }
export interface AdminOverview { users: number; matches: number; issuedTickets: number; pendingReservations: number }
export interface AdminTicket extends Ticket { revision: string; user: { id: string; name: string; email: string } }
export interface AdminSaleQuote {
  revision: string; sector: Sector; quantity: number; available: number; discountPercent: number;
  totalCents: number; unitPriceCents: number; serverTime: string; expiresAt: string;
}
export interface ClubPlan { id: string; name: string; priceCents: number; discountPercent: number }
export interface AuditEvent { id: string; action: string; entityId: string; createdAt: string; actor: { name: string }; details: Record<string, unknown> }
export interface CashCharge {
  id: string; tenant: { slug: string; name: string }; merchant: { name: string };
  channel: 'CASHIER_QR' | 'CUSTOMER_QR'; status: 'PENDING' | 'PAID' | 'REFUNDED' | 'CANCELED' | 'EXPIRED';
  amountCents: number; cashbackCents: number; merchantCents: number; commissionCents: number; gatewayFeeCents: number;
  customerLinked: boolean; demo: boolean; pixPayload: string | null; saleCode: string; saleQr: string;
  expiresAt: string; createdAt: string; paidAt: string | null;
}
export interface CashWallet {
  tenant: { slug: string; name: string }; customerCode: string; availableCents: number; debtCents: number; demo: boolean;
  entries: { id: string; kind: 'CASHBACK' | 'REVERSAL'; amountCents: number; balanceAfterCents: number; merchant: string; createdAt: string }[];
  charges: CashCharge[];
}
export interface MerchantSetup {
  demo: boolean; enabled: boolean;
  merchants: { id: string; name: string; fixedQr: string; offers: { id: string; tenant: { slug: string; name: string }; cashbackBps: number; commissionBps: number; customerQrEnabled: boolean }[] }[];
}
