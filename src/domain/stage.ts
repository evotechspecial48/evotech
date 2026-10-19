// Этапы проектирования и правила их переходов.

export type StageCodeT = "brief" | "sketch" | "model" | "drawings" | "documentation" | "delivery";
export type StageStatusT =
  | "not_started"
  | "in_progress"
  | "internal_review"
  | "customer_review"
  | "changes_requested"
  | "approved"
  | "completed";

export const STAGES: { code: StageCodeT; title: string; weight: number; approvalObject: string }[] = [
  { code: "brief", title: "Сбор и утверждение технического задания", weight: 10, approvalObject: "Техническое задание" },
  { code: "sketch", title: "Разработка и согласование эскиза", weight: 15, approvalObject: "Эскиз" },
  { code: "model", title: "Разработка и согласование 3D-модели", weight: 25, approvalObject: "3D-модель" },
  { code: "drawings", title: "Разработка и согласование чертежей", weight: 30, approvalObject: "Чертежи" },
  { code: "documentation", title: "Подготовка ведомостей и итоговой документации", weight: 10, approvalObject: "Итоговый комплект" },
  { code: "delivery", title: "Передача результата заказчику", weight: 10, approvalObject: "Итоговый комплект" },
];

// Доля готовности этапа по его статусу (для общего процента готовности проекта).
const STATUS_PROGRESS: Record<StageStatusT, number> = {
  not_started: 0,
  in_progress: 0.3,
  changes_requested: 0.4,
  internal_review: 0.6,
  customer_review: 0.75,
  approved: 0.9,
  completed: 1,
};

export function projectProgress(stages: { code: StageCodeT; status: StageStatusT }[]): number {
  const total = STAGES.reduce((s, st) => s + st.weight, 0);
  const done = stages.reduce((sum, st) => {
    const def = STAGES.find((d) => d.code === st.code);
    return sum + (def ? def.weight * STATUS_PROGRESS[st.status] : 0);
  }, 0);
  return Math.round((done / total) * 100);
}

export type StageAction =
  | "start"
  | "upload_version"
  | "submit_internal"
  | "confirm_internal"
  | "return_internal"
  | "customer_approve"
  | "customer_request_changes"
  | "complete";

export type ActorKind = "designer" | "manager" | "customer";

type Rule = { from: StageStatusT[]; to: StageStatusT; actors: ActorKind[]; commentRequired?: boolean };

export const STAGE_RULES: Record<StageAction, Rule> = {
  start: { from: ["not_started"], to: "in_progress", actors: ["designer", "manager"] },
  upload_version: { from: ["in_progress", "changes_requested"], to: "in_progress", actors: ["designer", "manager"] },
  submit_internal: { from: ["in_progress"], to: "internal_review", actors: ["designer", "manager"] },
  // Проектировщик подтверждает внутреннюю проверку — версия уходит заказчику
  confirm_internal: { from: ["internal_review"], to: "customer_review", actors: ["designer", "manager"] },
  return_internal: { from: ["internal_review"], to: "in_progress", actors: ["designer", "manager"], commentRequired: true },
  customer_approve: { from: ["customer_review"], to: "approved", actors: ["customer"] },
  customer_request_changes: { from: ["customer_review"], to: "changes_requested", actors: ["customer"], commentRequired: true },
  complete: { from: ["approved"], to: "completed", actors: ["designer", "manager"] },
};

export const STAGE_ACTION_LABELS: Record<StageAction, string> = {
  start: "Начать этап",
  upload_version: "Загрузить новую версию",
  submit_internal: "Отправить на внутреннюю проверку",
  confirm_internal: "Подтвердить проверку и отправить заказчику",
  return_internal: "Вернуть на доработку",
  customer_approve: "Согласовать",
  customer_request_changes: "Вернуть с замечаниями",
  complete: "Завершить этап",
};

export type TransitionResult = { ok: true; to: StageStatusT } | { ok: false; reason: string };

export function checkStageTransition(
  status: StageStatusT,
  action: StageAction,
  actor: ActorKind,
  opts: { comment?: string; hasVersion?: boolean; previousCompleted?: boolean } = {},
): TransitionResult {
  const rule = STAGE_RULES[action];
  if (!rule.actors.includes(actor)) return { ok: false, reason: "Действие недоступно для вашей роли" };
  if (!rule.from.includes(status)) return { ok: false, reason: "Действие недоступно в текущем статусе этапа" };
  if (rule.commentRequired && (!opts.comment || opts.comment.trim().length < 3)) {
    return { ok: false, reason: "Комментарий обязателен" };
  }
  if (action === "start" && opts.previousCompleted === false) {
    return { ok: false, reason: "Предыдущий этап ещё не завершён" };
  }
  if (action === "submit_internal" && !opts.hasVersion) {
    return { ok: false, reason: "Сначала загрузите версию результата" };
  }
  return { ok: true, to: rule.to };
}

export function availableActions(status: StageStatusT, actor: ActorKind): StageAction[] {
  return (Object.keys(STAGE_RULES) as StageAction[]).filter((a) => {
    const r = STAGE_RULES[a];
    return r.actors.includes(actor) && r.from.includes(status);
  });
}
