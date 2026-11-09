import { randomUUID } from "node:crypto";
import { serializable } from "../lib/business-rules.js";
import { AppError } from "../lib/errors.js";
const userSelect = {
  id: true,
  name: true,
  email: true,
  active: true,
  role: true,
};
export function createPartnerStore(db, tenantSlug) {
  const include = {
    benefits: { orderBy: [{ createdAt: "desc" }, { id: "asc" }] },
    merchant: {
      include: {
        offers: { where: { tenant: { slug: tenantSlug } } },
        operators: { include: { user: { select: userSelect } } },
      },
    },
  };
  const audit = (tx, actorId, action, id, details = {}) =>
    tx.auditLog.create({ data: { actorId, action, entityId: id, details } });
  async function current(tx, id, updatedAt, archived = false) {
    const row = await tx.partner.findUnique({ where: { id }, include });
    if (!row || (!archived && row.archivedAt))
      throw new AppError(
        404,
        "PARTNER_NOT_FOUND",
        "Parceiro não encontrado ou arquivado.",
      );
    if (row.updatedAt.toISOString() !== updatedAt)
      throw new AppError(
        409,
        "PARTNER_CHANGED",
        "Este parceiro foi alterado. Atualize a página antes de salvar.",
      );
    return row;
  }
  async function offerSave(tx, merchantId, offer) {
    if (!offer) return;
    const tenant = await tx.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant?.active)
      throw new AppError(
        409,
        "TENANT_INACTIVE",
        "O clube precisa estar ativo para configurar cashback.",
      );
    await tx.merchantOffer.upsert({
      where: { tenantId_merchantId: { tenantId: tenant.id, merchantId } },
      update: offer,
      create: { tenantId: tenant.id, merchantId, ...offer },
    });
  }
  async function merchant(tx, row) {
    return (
      row.merchant ||
      tx.merchant.create({
        data: {
          slug: `partner-${row.id}`,
          name: row.name,
          active: row.active,
          partnerId: row.id,
        },
      })
    );
  }
  return {
    async list({ search, status = "all", limit = 30, offset = 0 } = {}) {
      const where = {
        ...(status === "archived"
          ? { archivedAt: { not: null } }
          : { archivedAt: null }),
        ...(["active", "inactive"].includes(status)
          ? { active: status === "active" }
          : {}),
        ...(search
          ? {
              OR: ["name", "category", "contact"].map((key) => ({
                [key]: { contains: search, mode: "insensitive" },
              })),
            }
          : {}),
      };
      const [items, total] = await db.$transaction([
        db.partner.findMany({
          where,
          include,
          take: limit,
          skip: offset,
          orderBy: [{ name: "asc" }, { id: "asc" }],
        }),
        db.partner.count({ where }),
      ]);
      return { items, total, limit, offset };
    },
    create(actorId, { offer, ...data }) {
      return serializable(db, async (tx) => {
        const id = randomUUID(),
          row = await tx.partner.create({
            data: { ...data, id, slug: `partner-${id}` },
          });
        const account = await merchant(tx, row);
        await offerSave(tx, account.id, offer);
        await audit(tx, actorId, "PARTNER_CREATED", id);
        return tx.partner.findUnique({ where: { id }, include });
      });
    },
    update(actorId, { id, updatedAt, offer, ...data }) {
      return serializable(db, async (tx) => {
        const row = await current(tx, id, updatedAt),
          account = await merchant(tx, row);
        await tx.partner.update({ where: { id }, data });
        await tx.merchant.update({
          where: { id: account.id },
          data: { name: data.name, active: data.active },
        });
        await offerSave(tx, account.id, offer);
        await audit(tx, actorId, "PARTNER_UPDATED", id, {
          fields: Object.keys(data),
          offerChanged: Boolean(offer),
        });
        return tx.partner.findUnique({ where: { id }, include });
      });
    },
    archive(actorId, { id, updatedAt }, restore = false) {
      return serializable(db, async (tx) => {
        const row = await current(tx, id, updatedAt, restore);
        await tx.partner.update({
          where: { id },
          data: { active: false, archivedAt: restore ? null : new Date() },
        });
        if (row.merchant) {
          await tx.merchant.update({
            where: { id: row.merchant.id },
            data: { active: false },
          });
          await tx.merchantOperator.updateMany({
            where: { merchantId: row.merchant.id },
            data: { active: false },
          });
        }
        await audit(
          tx,
          actorId,
          restore ? "PARTNER_RESTORED" : "PARTNER_ARCHIVED",
          id,
        );
        return tx.partner.findUnique({ where: { id }, include });
      });
    },
    benefit(actorId, { id, updatedAt, partnerId, ...data }) {
      return serializable(db, async (tx) => {
        const partner = await tx.partner.findFirst({
          where: { id: partnerId, archivedAt: null },
        });
        if (!partner)
          throw new AppError(
            404,
            "PARTNER_NOT_FOUND",
            "Parceiro não encontrado.",
          );
        if (id) {
          const old = await tx.partnerBenefit.findFirst({
            where: { id, partnerId },
          });
          if (!old || old.updatedAt.toISOString() !== updatedAt)
            throw new AppError(
              409,
              "BENEFIT_CHANGED",
              "Oferta alterada. Atualize a página.",
            );
        }
        const row = id
          ? await tx.partnerBenefit.update({ where: { id }, data })
          : await tx.partnerBenefit.create({ data: { partnerId, ...data } });
        await tx.partner.update({
          where: { id: partnerId },
          data: { updatedAt: new Date() },
        });
        await audit(
          tx,
          actorId,
          id ? "PARTNER_BENEFIT_UPDATED" : "PARTNER_BENEFIT_CREATED",
          row.id,
          { partnerId },
        );
        return row;
      });
    },
    operators(actorId, { partnerId, updatedAt, userIds }) {
      return serializable(db, async (tx) => {
        const row = await current(tx, partnerId, updatedAt),
          account = await merchant(tx, row);
        if (
          (await tx.user.count({
            where: {
              id: { in: userIds },
              role: { in: ["ADMIN", "CASHIER"] },
              active: true,
            },
          })) !== userIds.length
        )
          throw new AppError(
            422,
            "INVALID_CASHIER",
            "Selecione somente administradores ou caixas ativos.",
          );
        await tx.merchantOperator.updateMany({
          where: { merchantId: account.id },
          data: { active: false },
        });
        for (const userId of userIds)
          await tx.merchantOperator.upsert({
            where: { userId_merchantId: { userId, merchantId: account.id } },
            update: { active: true },
            create: { userId, merchantId: account.id },
          });
        await tx.partner.update({
          where: { id: partnerId },
          data: { updatedAt: new Date() },
        });
        await audit(tx, actorId, "PARTNER_OPERATORS_CHANGED", partnerId, {
          userIds,
        });
        return tx.partner.findUnique({ where: { id: partnerId }, include });
      });
    },
    publicList({ category, search, limit = 100, offset = 0 } = {}) {
      const now = new Date();
      return db.partner.findMany({
        where: {
          active: true,
          archivedAt: null,
          ...(category ? { category } : {}),
          ...(search
            ? { name: { contains: search, mode: "insensitive" } }
            : {}),
        },
        select: {
          id: true,
          name: true,
          category: true,
          discount: true,
          icon: true,
          description: true,
          conditions: true,
          location: true,
          contact: true,
          website: true,
          benefits: {
            where: {
              active: true,
              AND: [
                { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
              ],
            },
            select: {
              id: true,
              title: true,
              description: true,
              conditions: true,
              startsAt: true,
              endsAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      });
    },
  };
}
