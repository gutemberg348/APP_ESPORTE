import { serializable } from "../lib/business-rules.js";
import { AppError } from "../lib/errors.js";
import { toMember } from "../lib/serializers.js";
const membership = { membership: { include: { plan: true } } };
export const toAdminAccount = (user) => ({
  ...toMember(user),
  updatedAt: user.updatedAt,
});

// Shared by supporter and employee editing so access and credential rules stay identical.
export async function updateAdminAccount(
  tx,
  actorId,
  { userId, updatedAt, ...data },
  {
    employeeOnly = false,
    include = membership,
    action = "ACCOUNT_UPDATED",
  } = {},
) {
  const old = await tx.user.findUnique({ where: { id: userId } });
  if (
    !old ||
    (employeeOnly && !["ADMIN", "GATE", "CASHIER"].includes(old.role))
  )
    throw new AppError(404, "ACCOUNT_NOT_FOUND", "Conta não encontrada.");
  if (updatedAt && old.updatedAt.toISOString() !== updatedAt)
    throw new AppError(
      409,
      employeeOnly ? "EMPLOYEE_CHANGED" : "ACCOUNT_CHANGED",
      "Esta conta foi alterada. Atualize os dados antes de salvar.",
    );
  if (
    actorId === userId &&
    (data.active === false || (data.role && data.role !== "ADMIN"))
  )
    throw new AppError(
      409,
      "SELF_ACCESS_CHANGE",
      "Use outro administrador para alterar o seu próprio acesso.",
    );
  if (
    old.role === "ADMIN" &&
    old.active &&
    (data.active === false || (data.role && data.role !== "ADMIN")) &&
    (await tx.user.count({
      where: { role: "ADMIN", active: true, id: { not: userId } },
    })) === 0
  )
    throw new AppError(
      409,
      "LAST_ADMIN",
      "É necessário manter pelo menos um administrador ativo.",
    );
  const credentialsChanged =
    Boolean(data.passwordHash) ||
    (data.email !== undefined && data.email !== old.email);
  const roleChanged = data.role !== undefined && data.role !== old.role;
  const user = await tx.user.update({
    where: { id: userId },
    data: {
      ...data,
      updatedAt: new Date(Math.max(Date.now(), old.updatedAt.getTime() + 1)),
    },
    include,
  });
  if (credentialsChanged || roleChanged || data.active === false) {
    const at = new Date();
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: at },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: at },
    });
    await tx.mailDelivery.updateMany({
      where: { reset: { userId }, status: { in: ["QUEUED", "FAILED"] } },
      data: { status: "SKIPPED", payload: null },
    });
  }
  if (roleChanged) {
    await tx.gateAssignmentV1.updateMany({ where: { userId }, data: { active: false } });
    await tx.gateAssignment.updateMany({
      where: { userId },
      data: { active: false },
    });
    await tx.merchantOperator.updateMany({
      where: { userId },
      data: { active: false },
    });
  }
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entityId: userId,
      details: {
        fields: Object.keys(data).filter((key) => key !== "passwordHash" && data[key] !== old[key]),
        passwordChanged: Boolean(data.passwordHash),
        sessionsRevoked:
          credentialsChanged || roleChanged || data.active === false,
      },
    },
  });
  return user;
}
export function createAdminAccountStore(db) {
  return {
    async detail(userId) {
      const user = await db.user.findUnique({
        where: { id: userId },
        include: membership,
      });
      if (!user)
        throw new AppError(404, "ACCOUNT_NOT_FOUND", "Conta não encontrada.");
      return toAdminAccount(user);
    },
    update: (actorId, input) =>
      serializable(db, async (tx) =>
        toAdminAccount(await updateAdminAccount(tx, actorId, input)),
      ),
  };
}
