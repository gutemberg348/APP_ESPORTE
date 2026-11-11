import { db } from "../config/database.js";
import { serializable } from "../lib/business-rules.js";
import { AppError } from "../lib/errors.js";
import { updateAdminAccount } from "./admin-account.store.js";
const include = {
  gateAssignmentsV1: { include: { alocacao: { include: { partida: true, setor: true } } } },
  gateAssignments: {
    include: { sector: { include: { match: true } } },
    orderBy: { createdAt: "asc" },
  },
};
function safe(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    contact: user.contact,
    city: user.city,
    updatedAt: user.updatedAt,
    active: user.active,
    role: user.role,
    assignmentsV1: (user.gateAssignmentsV1 || []).map((item) => ({ allocationId: item.alocacaoId, sectorName: item.alocacao.setor.nome, matchId: item.alocacao.partidaId, matchLabel: `${item.alocacao.partida.timeMandante} × ${item.alocacao.partida.timeVisitante}`, active: item.active })),
    assignments: user.gateAssignments.map((item) => ({
      sectorId: item.sectorId,
      sectorName: item.sector.name,
      matchId: item.sector.matchId,
      matchLabel: `${item.sector.match.homeTeam} × ${item.sector.match.awayTeam}`,
      active: item.active,
    })),
  };
}
async function employee(tx, id) {
  const user = await tx.user.findFirst({
    where: { id, role: { in: ["GATE", "ADMIN", "CASHIER"] } },
  });
  if (!user)
    throw new AppError(
      404,
      "EMPLOYEE_NOT_FOUND",
      "Funcionário não encontrado.",
    );
  return user;
}
const audit = (tx, actorId, action, entityId, details) =>
  tx.auditLog.create({ data: { actorId, action, entityId, details } });
export function createStaffModel(db) {
  return {
    async list({ limit = 50, offset = 0, search } = {}) {
      const where = {
        role: { in: ["GATE", "ADMIN", "CASHIER"] },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      return (
        await db.user.findMany({
          where,
          include,
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: limit,
          skip: offset,
        })
      ).map(safe);
    },
    create(actorId, data) {
      return serializable(db, async (tx) => {
        const user = await tx.user.create({
          data: { role: "GATE", ...data, active: true },
          include,
        });
        await audit(tx, actorId, "EMPLOYEE_CREATED", user.id, {
          email: user.email,
        });
        return safe(user);
      });
    },
    update(actorId, input) {
      return serializable(db, async (tx) =>
        safe(
          await updateAdminAccount(tx, actorId, input, {
            employeeOnly: true,
            include,
            action: "EMPLOYEE_UPDATED",
          }),
        ),
      );
    },
    password(actorId, userId, passwordHash) {
      return serializable(db, async (tx) => {
        await updateAdminAccount(
          tx,
          actorId,
          { userId, passwordHash },
          { employeeOnly: true, include, action: "EMPLOYEE_PASSWORD_RESET" },
        );
      });
    },
    assignments(actorId, { userId, sectorIds }) {
      return serializable(db, async (tx) => {
        const user = await employee(tx, userId);
        if (user.role !== "GATE")
          throw new AppError(
            422,
            "GATE_ROLE_REQUIRED",
            "Escalas são atribuídas somente à portaria.",
          );
        if (
          (await tx.sector.count({ where: { id: { in: sectorIds } } })) !==
          sectorIds.length
        )
          throw new AppError(
            422,
            "INVALID_ASSIGNMENT_SECTOR",
            "Um dos setores informados não existe.",
          );
        await tx.gateAssignment.updateMany({
          where: { userId },
          data: { active: false },
        });
        for (const sectorId of sectorIds)
          await tx.gateAssignment.upsert({
            where: { userId_sectorId: { userId, sectorId } },
            update: { active: true },
            create: { userId, sectorId, active: true },
          });
        await audit(tx, actorId, "EMPLOYEE_ASSIGNMENTS_CHANGED", userId, {
          sectorIds,
        });
        return safe(
          await tx.user.findUnique({ where: { id: userId }, include }),
        );
      });
    },
    gateMatches(user) {
      return db.match.findMany({
        where:
          user.role === "ADMIN"
            ? {}
            : {
                sectors: {
                  some: {
                    gateAssignments: {
                      some: { userId: user.id, active: true },
                    },
                  },
                },
              },
        include: {
          sectors: {
            where:
              user.role === "ADMIN"
                ? {}
                : {
                    gateAssignments: {
                      some: { userId: user.id, active: true },
                    },
                  },
            orderBy: { name: "asc" },
          },
        },
        orderBy: { startsAt: "desc" },
        take: 100,
      });
    },
  };
}
export const staffModel = createStaffModel(db);
