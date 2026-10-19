// Жизненный цикл AI-задачи (одна задача ведёт заказ от генерации вариантов до пакета документации).

export type AIJobStatusT =
  | "draft"
  | "queued"
  | "processing"
  | "awaiting_selection"
  | "selected"
  | "generating_package"
  | "completed"
  | "failed";

const TRANSITIONS: Record<AIJobStatusT, AIJobStatusT[]> = {
  draft: ["queued"],
  queued: ["processing", "failed"],
  processing: ["awaiting_selection", "failed"],
  awaiting_selection: ["selected", "queued"],
  selected: ["generating_package"],
  generating_package: ["completed", "failed"],
  completed: [],
  failed: ["queued", "generating_package"],
};

export function canTransitionJob(from: AIJobStatusT, to: AIJobStatusT): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Статус, в который задача возвращается при повторном запуске после ошибки. */
export function retryTarget(failedPhase: AIJobStatusT | null): AIJobStatusT {
  return failedPhase === "generating_package" ? "generating_package" : "queued";
}

export const MAX_JOB_ATTEMPTS = 3;
