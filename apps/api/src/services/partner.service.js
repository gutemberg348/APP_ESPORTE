import { partnerModel } from "../models/partner.model.js";
import { assertAdmin } from "../lib/ticket-rules.js";
export const partnerService = Object.fromEntries(
  ["list", "create", "update", "archive", "operators", "benefit"].map(
    (method) => [
      method,
      (user, ...args) => {
        assertAdmin(user);
        return partnerModel[method](
          ...(method === "list" ? args : [user.id, ...args]),
        );
      },
    ],
  ),
);
