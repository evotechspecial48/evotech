// Правила доступа к объектам (поверх RBAC): изоляция заказчиков, назначенные проекты,
// условия оплаты и скачивания итогового результата.

import type { RoleCode } from "./rbac";

export interface Viewer {
  id: string;
  role: RoleCode;
}

export interface ProjectAccessInfo {
  customerId: string;
  managerId: string | null;
  salesManagerId: string | null;
  memberIds: string[];
}

export function canViewProject(viewer: Viewer, project: ProjectAccessInfo): boolean {
  switch (viewer.role) {
    case "DIRECTOR":
    case "PROJECT_MANAGER":
      return true;
    case "SALES_MANAGER":
      return project.salesManagerId === viewer.id;
    case "DESIGNER":
      return project.memberIds.includes(viewer.id);
    case "CUSTOMER":
      return project.customerId === viewer.id;
  }
}

/** Может ли пользователь управлять проектом (этапы, сроки, назначения). */
export function canManageProject(viewer: Viewer, project: ProjectAccessInfo): boolean {
  if (viewer.role === "DIRECTOR") return true;
  return viewer.role === "PROJECT_MANAGER" && (project.managerId === viewer.id || project.managerId === null);
}

/** Может ли пользователь работать над результатами этапов проекта. */
export function canWorkOnProject(viewer: Viewer, project: ProjectAccessInfo): boolean {
  if (canManageProject(viewer, project)) return true;
  return viewer.role === "DESIGNER" && project.memberIds.includes(viewer.id);
}

export interface LeadAccessInfo {
  customerId: string | null;
  managerId: string | null;
}

export function canViewLead(viewer: Viewer, lead: LeadAccessInfo): boolean {
  switch (viewer.role) {
    case "DIRECTOR":
    case "SALES_MANAGER":
    case "PROJECT_MANAGER":
      return true;
    case "CUSTOMER":
      return lead.customerId === viewer.id;
    default:
      return false;
  }
}

export type GateResult = { ok: true } | { ok: false; reasons: string[] };

/** Оплата доступна только после подтверждения (подписания) актуальной версии договора. */
export function canPay(input: {
  contractStatus: string | null;
  acceptedVersion: number | null;
  currentVersion: number | null;
  alreadyPaid: boolean;
}): GateResult {
  const reasons: string[] = [];
  if (input.alreadyPaid) reasons.push("Заказ уже оплачен");
  if (input.contractStatus !== "SIGNED") reasons.push("Договор не подтверждён");
  else if (input.acceptedVersion === null || input.acceptedVersion !== input.currentVersion) {
    reasons.push("Подтверждена не актуальная версия договора");
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/**
 * Итоговый архив доступен, только если договор подтверждён или подписан,
 * платёж успешно завершён и результат имеет статус completed.
 */
export function canDownloadResult(input: {
  isOwner: boolean;
  isStaff: boolean;
  contractStatus: string | null;
  paymentRequired: boolean;
  paymentStatus: string | null;
  resultStatus: string | null;
}): GateResult {
  const reasons: string[] = [];
  if (!input.isOwner && !input.isStaff) reasons.push("Нет доступа к заказу");
  if (input.contractStatus !== "SIGNED") reasons.push("Договор не подтверждён");
  if (input.paymentRequired && input.paymentStatus !== "paid") reasons.push("Оплата не завершена");
  if (input.resultStatus !== "completed") reasons.push("Результат ещё не готов");
  return reasons.length ? { ok: false, reasons } : { ok: true };
}
