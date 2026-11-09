import type { AdminPartner, PartnerBenefit } from "@nacional/shared/types";
import { request } from "./api";
export interface PartnerInput {
  name: string;
  discount: string;
  category: string;
  icon: string;
  description: string;
  conditions: string;
  location: string;
  contact: string;
  website: string;
  active: boolean;
  offer: {
    cashbackBps: number;
    commissionBps: number;
    active: boolean;
    customerQrEnabled: boolean;
  };
}
export type BenefitInput = Pick<
  PartnerBenefit,
  "title" | "description" | "conditions" | "startsAt" | "endsAt"
> & { partnerId: string; active: boolean };
export const partnersApi = {
  list: (token: string, search: string, status: string, offset = 0) =>
    request<{ items: AdminPartner[]; total: number }>(
      "/admin/partners?" +
        new URLSearchParams({
          search,
          status,
          offset: String(offset),
          limit: "20",
        }),
      { token },
    ),
  save: (token: string, body: PartnerInput, current?: AdminPartner | null) =>
    request<AdminPartner>("/admin/partners", {
      token,
      method: current ? "PATCH" : "POST",
      body: {
        ...body,
        ...(current ? { id: current.id, updatedAt: current.updatedAt } : {}),
      },
    }),
  archive: (token: string, current: AdminPartner, restore = false) =>
    request<AdminPartner>(
      restore ? "/admin/partners/restore" : "/admin/partners",
      {
        token,
        method: restore ? "POST" : "DELETE",
        body: { id: current.id, updatedAt: current.updatedAt },
      },
    ),
  benefit: (
    token: string,
    body: BenefitInput,
    current?: PartnerBenefit | null,
  ) =>
    request<PartnerBenefit>("/admin/partners/benefits", {
      token,
      method: current ? "PATCH" : "POST",
      body: {
        ...body,
        ...(current ? { id: current.id, updatedAt: current.updatedAt } : {}),
      },
    }),
  operators: (token: string, current: AdminPartner, userIds: string[]) =>
    request<AdminPartner>("/admin/partners/operators", {
      token,
      method: "PUT",
      body: { partnerId: current.id, updatedAt: current.updatedAt, userIds },
    }),
};
