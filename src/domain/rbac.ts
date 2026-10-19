// Ролевая модель доступа (RBAC). Матрица — единственный источник правды
// для серверных проверок и для отображения меню. См. docs/RBAC.md.

export const ROLES = ["DIRECTOR", "PROJECT_MANAGER", "SALES_MANAGER", "DESIGNER", "CUSTOMER"] as const;
export type RoleCode = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  DIRECTOR: "Директор",
  PROJECT_MANAGER: "Руководитель проектов",
  SALES_MANAGER: "Менеджер проектов",
  DESIGNER: "Проектировщик",
  CUSTOMER: "Заказчик",
};

export const STAFF_ROLES: RoleCode[] = ["DIRECTOR", "PROJECT_MANAGER", "SALES_MANAGER", "DESIGNER"];

export type Permission =
  | "leads.view_all"
  | "leads.view_own"
  | "leads.manage"
  | "leads.create"
  | "offers.manage"
  | "projects.view_all"
  | "projects.view_assigned"
  | "projects.view_own"
  | "projects.create"
  | "projects.manage"
  | "projects.assign"
  | "spec.edit"
  | "spec.approve"
  | "stages.work"
  | "stages.review_internal"
  | "stages.manage"
  | "stages.customer_decide"
  | "requests.create"
  | "requests.answer"
  | "timer.manage"
  | "timer.delete_pause"
  | "files.upload"
  | "files.download"
  | "files.view_internal"
  | "contracts.manage"
  | "contracts.accept"
  | "payments.view_all"
  | "payments.pay"
  | "quick_orders.create"
  | "quick_orders.view_all"
  | "users.manage"
  | "analytics.view"
  | "settings.manage"
  | "audit.view"
  | "data.export";

const ALL: Permission[] = [
  "leads.view_all", "leads.manage", "leads.create", "offers.manage",
  "projects.view_all", "projects.create", "projects.manage", "projects.assign",
  "spec.edit", "spec.approve", "stages.work", "stages.review_internal", "stages.manage",
  "requests.create", "timer.manage", "timer.delete_pause",
  "files.upload", "files.download", "files.view_internal",
  "contracts.manage", "payments.view_all", "quick_orders.view_all",
  "users.manage", "analytics.view", "settings.manage", "audit.view", "data.export",
];

export const ROLE_PERMISSIONS: Record<RoleCode, ReadonlySet<Permission>> = {
  DIRECTOR: new Set(ALL),
  PROJECT_MANAGER: new Set<Permission>([
    "leads.view_all",
    "projects.view_all", "projects.create", "projects.manage", "projects.assign",
    "spec.edit", "spec.approve",
    "stages.work", "stages.review_internal", "stages.manage",
    "requests.create", "timer.manage",
    "files.upload", "files.download", "files.view_internal",
    "payments.view_all", "quick_orders.view_all", "analytics.view", "data.export",
  ]),
  SALES_MANAGER: new Set<Permission>([
    "leads.view_all", "leads.manage", "leads.create", "offers.manage",
    "projects.view_assigned", "projects.create",
    "spec.edit", "requests.create",
    "files.upload", "files.download", "files.view_internal",
    "contracts.manage", "payments.view_all", "quick_orders.view_all", "data.export",
  ]),
  DESIGNER: new Set<Permission>([
    "projects.view_assigned",
    "stages.work", "stages.review_internal",
    "requests.create",
    "files.upload", "files.download", "files.view_internal",
  ]),
  CUSTOMER: new Set<Permission>([
    "leads.view_own", "leads.create",
    "projects.view_own",
    "spec.edit",
    "stages.customer_decide",
    "requests.answer",
    "files.upload", "files.download",
    "contracts.accept",
    "payments.pay",
    "quick_orders.create",
  ]),
};

export function can(role: RoleCode, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function isStaff(role: RoleCode): boolean {
  return role !== "CUSTOMER";
}

export class ForbiddenError extends Error {
  constructor(message = "Недостаточно прав для выполнения действия") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: RoleCode, permission: Permission): void {
  if (!can(role, permission)) throw new ForbiddenError();
}

// Разделы кабинета и разрешение, необходимое для их отображения.
// Пустой список разрешений — раздел доступен всем авторизованным.
export type NavItem = { href: string; label: string; permission: Permission[] };

export const NAV_ITEMS: NavItem[] = [
  { href: "/cabinet", label: "Дашборд", permission: [] },
  { href: "/cabinet/leads", label: "Заявки", permission: ["leads.view_all", "leads.view_own"] },
  { href: "/cabinet/projects", label: "Проекты", permission: ["projects.view_all", "projects.view_assigned", "projects.view_own"] },
  { href: "/cabinet/quick-orders", label: "Быстрые заказы", permission: ["quick_orders.create", "quick_orders.view_all"] },
  { href: "/cabinet/specs", label: "Технические задания", permission: ["spec.edit"] },
  { href: "/cabinet/approvals", label: "Согласования", permission: ["stages.review_internal", "stages.customer_decide", "spec.approve"] },
  { href: "/cabinet/requests", label: "Запросы", permission: ["requests.create", "requests.answer"] },
  { href: "/cabinet/files", label: "Файлы", permission: ["files.download"] },
  { href: "/cabinet/offers", label: "Коммерческие предложения", permission: ["offers.manage"] },
  { href: "/cabinet/contracts", label: "Договоры", permission: ["contracts.manage", "contracts.accept"] },
  { href: "/cabinet/payments", label: "Платежи", permission: ["payments.view_all", "payments.pay"] },
  { href: "/cabinet/notifications", label: "Уведомления", permission: [] },
  { href: "/cabinet/users", label: "Пользователи", permission: ["users.manage"] },
  { href: "/cabinet/analytics", label: "Аналитика", permission: ["analytics.view"] },
  { href: "/cabinet/audit", label: "Журнал действий", permission: ["audit.view"] },
  { href: "/cabinet/settings", label: "Настройки", permission: ["settings.manage"] },
];

export function navFor(role: RoleCode): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.permission.length === 0 || item.permission.some((p) => can(role, p)),
  );
}
