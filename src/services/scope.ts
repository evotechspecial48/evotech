import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import type { SessionUser } from "@/lib/auth";
import { canManageProject, canViewLead, canViewProject, canWorkOnProject } from "@/domain/access";
import { ForbiddenError } from "@/domain/rbac";
import type { ActorKind } from "@/domain/stage";

// Фильтры выборок по роли — изоляция данных на уровне запросов к БД.

export function projectScope(user: SessionUser): Prisma.ProjectWhereInput {
  switch (user.role) {
    case "DIRECTOR":
    case "PROJECT_MANAGER":
      return {};
    case "SALES_MANAGER":
      return { salesManagerId: user.id };
    case "DESIGNER":
      return { members: { some: { userId: user.id } } };
    case "CUSTOMER":
      return { customerId: user.id };
  }
}

export function leadScope(user: SessionUser): Prisma.LeadWhereInput {
  if (user.role === "CUSTOMER") return { customerId: user.id };
  if (user.role === "DESIGNER") return { id: "__none__" };
  return {};
}

export function quickOrderScope(user: SessionUser): Prisma.QuickOrderWhereInput {
  if (user.role === "CUSTOMER") return { customerId: user.id };
  if (user.role === "DESIGNER") return { id: "__none__" };
  return {};
}

export async function loadProjectAccess(user: SessionUser, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, customerId: true, managerId: true, salesManagerId: true, title: true, number: true, status: true, members: { select: { userId: true } } },
  });
  if (!project) throw new NotFoundError("Проект");
  const info = {
    customerId: project.customerId,
    managerId: project.managerId,
    salesManagerId: project.salesManagerId,
    memberIds: project.members.map((m) => m.userId),
  };
  const viewer = { id: user.id, role: user.role };
  if (!canViewProject(viewer, info)) throw new ForbiddenError("Нет доступа к проекту");
  const actorKind: ActorKind | null =
    user.role === "CUSTOMER"
      ? "customer"
      : canManageProject(viewer, info)
        ? "manager"
        : canWorkOnProject(viewer, info)
          ? "designer"
          : null;
  return {
    project,
    info,
    canManage: canManageProject(viewer, info),
    canWork: canWorkOnProject(viewer, info),
    actorKind,
  };
}

export async function loadLeadAccess(user: SessionUser, leadId: string) {
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new NotFoundError("Заявка");
  if (!canViewLead({ id: user.id, role: user.role }, { customerId: lead.customerId, managerId: lead.managerId })) {
    throw new ForbiddenError("Нет доступа к заявке");
  }
  return lead;
}
