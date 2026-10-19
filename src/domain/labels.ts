// Русские подписи для статусов. Статус всегда показывается текстом,
// цвет — только дополнительный признак (WCAG: не полагаться только на цвет).

export type Tone = "neutral" | "info" | "progress" | "warning" | "success" | "danger";

export const LEAD_STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: "Новая", tone: "info" },
  qualification: { label: "Квалификация", tone: "progress" },
  tz_preparation: { label: "Подготовка ТЗ", tone: "progress" },
  commercial_offer: { label: "Коммерческое предложение", tone: "progress" },
  contract_approval: { label: "Согласование договора", tone: "warning" },
  awaiting_signature: { label: "Ожидает подписания", tone: "warning" },
  won: { label: "Договор заключён", tone: "success" },
  lost: { label: "Отказ", tone: "danger" },
};

export const LEAD_SOURCE: Record<string, string> = {
  site_form: "Форма на сайте",
  site_calculator: "Калькулятор на сайте",
  site_contact: "Контактная форма",
  cabinet: "Личный кабинет",
  quick_order: "Быстрый заказ",
  manual: "Вручную",
  phone: "Телефон",
};

export const PROJECT_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "В работе", tone: "progress" },
  ON_HOLD: { label: "Приостановлен", tone: "warning" },
  COMPLETED: { label: "Завершён", tone: "success" },
  CANCELLED: { label: "Отменён", tone: "danger" },
};

export const STAGE_STATUS: Record<string, { label: string; tone: Tone }> = {
  not_started: { label: "Не начат", tone: "neutral" },
  in_progress: { label: "В работе", tone: "progress" },
  internal_review: { label: "Внутренняя проверка", tone: "info" },
  customer_review: { label: "На согласовании у заказчика", tone: "warning" },
  changes_requested: { label: "Возвращён на доработку", tone: "danger" },
  approved: { label: "Согласован", tone: "success" },
  completed: { label: "Завершён", tone: "success" },
};

export const VERSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  INTERNAL_REVIEW: { label: "Внутренняя проверка", tone: "info" },
  CUSTOMER_REVIEW: { label: "У заказчика", tone: "warning" },
  CHANGES_REQUESTED: { label: "Замечания", tone: "danger" },
  APPROVED: { label: "Согласована", tone: "success" },
};

export const SPEC_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  SUBMITTED: { label: "На проверке", tone: "info" },
  CLARIFICATION: { label: "Запрошены уточнения", tone: "warning" },
  APPROVED: { label: "Утверждено", tone: "success" },
};

export const TIMER_STATE: Record<string, { label: string; tone: Tone }> = {
  not_started: { label: "Не запущен", tone: "neutral" },
  running: { label: "Идёт отсчёт", tone: "progress" },
  paused_waiting_customer: { label: "Пауза: ждём заказчика", tone: "warning" },
  completed: { label: "Завершён", tone: "success" },
  overdue: { label: "Просрочен", tone: "danger" },
};

export const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: "Ожидает ответа", tone: "warning" },
  ANSWERED: { label: "Получен ответ", tone: "success" },
  CANCELLED: { label: "Отменён", tone: "neutral" },
};

export const CONTRACT_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  AWAITING_SIGNATURE: { label: "Ожидает подписания", tone: "warning" },
  SIGNED: { label: "Подписан", tone: "success" },
  CANCELLED: { label: "Аннулирован", tone: "danger" },
};

export const OFFER_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  SENT: { label: "Отправлено", tone: "info" },
  ACCEPTED: { label: "Принято", tone: "success" },
  REJECTED: { label: "Отклонено", tone: "danger" },
};

export const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Ожидает оплаты", tone: "warning" },
  authorized: { label: "Авторизован", tone: "info" },
  paid: { label: "Оплачен", tone: "success" },
  cancelled: { label: "Отменён", tone: "neutral" },
  failed: { label: "Ошибка оплаты", tone: "danger" },
  refunded: { label: "Возвращён", tone: "neutral" },
};

export const QUICK_ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Черновик", tone: "neutral" },
  GENERATING: { label: "Генерация вариантов", tone: "progress" },
  AWAITING_SELECTION: { label: "Выбор варианта", tone: "warning" },
  CONTRACT: { label: "Подтверждение договора", tone: "warning" },
  AWAITING_PAYMENT: { label: "Ожидает оплаты", tone: "warning" },
  PAID: { label: "Оплачен", tone: "info" },
  PROCESSING: { label: "Формирование документации", tone: "progress" },
  COMPLETED: { label: "Готов", tone: "success" },
  CANCELLED: { label: "Отменён", tone: "danger" },
};

export const AI_JOB_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Черновик", tone: "neutral" },
  queued: { label: "В очереди", tone: "info" },
  processing: { label: "Обработка", tone: "progress" },
  awaiting_selection: { label: "Ожидает выбора", tone: "warning" },
  selected: { label: "Вариант выбран", tone: "info" },
  generating_package: { label: "Формирование пакета", tone: "progress" },
  completed: { label: "Завершено", tone: "success" },
  failed: { label: "Ошибка", tone: "danger" },
};

export const STRUCTURE_TYPE: Record<string, string> = {
  CANOPY: "Навес",
  GARAGE: "Гараж",
  TERRACE: "Терраса",
  GAZEBO: "Беседка",
  HANGAR: "Ангар / склад",
};

export const FILE_CATEGORY: Record<string, string> = {
  SOURCE: "Исходные данные",
  PHOTO: "Фотографии",
  SKETCH: "Эскиз",
  MODEL: "3D-модель",
  DRAWING: "Чертежи",
  SPECIFICATION: "Спецификации и ведомости",
  DOCUMENT: "Документы",
  CONTRACT: "Договор",
  ARCHIVE: "Архив",
  OTHER: "Прочее",
};
