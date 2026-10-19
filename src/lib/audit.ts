import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { logger } from "./logger";

export interface AuditInput {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  projectId?: string | null;
  ip?: string | null;
  meta?: Prisma.InputJsonValue;
}

/** Журнал критичных действий. Ошибка записи журнала не прерывает бизнес-операцию. */
export async function audit(input: AuditInput, tx: Prisma.TransactionClient = db): Promise<void> {
  try {
    await tx.auditEvent.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        projectId: input.projectId ?? null,
        ip: input.ip ?? null,
        meta: input.meta,
      },
    });
  } catch (err) {
    logger.error("audit.write_failed", { action: input.action, err });
  }
}

export const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "Вход в систему",
  "auth.login_failed": "Неудачная попытка входа",
  "auth.logout": "Выход",
  "auth.register": "Регистрация",
  "auth.password_reset": "Сброс пароля",
  "auth.email_verified": "Подтверждение почты",
  "user.invite": "Приглашение сотрудника",
  "user.update": "Изменение пользователя",
  "user.block": "Блокировка пользователя",
  "user.unblock": "Разблокировка пользователя",
  "user.export": "Экспорт персональных данных",
  "user.anonymize": "Обезличивание персональных данных",
  "lead.create": "Создание заявки",
  "lead.status": "Смена статуса заявки",
  "lead.assign": "Назначение менеджера",
  "lead.convert": "Создание проекта из заявки",
  "offer.create": "Коммерческое предложение",
  "spec.save": "Изменение ТЗ",
  "spec.submit": "ТЗ отправлено на проверку",
  "spec.clarify": "Запрос уточнений по ТЗ",
  "spec.approve": "ТЗ утверждено",
  "project.create": "Создание проекта",
  "project.assign": "Назначение участников",
  "project.update": "Изменение проекта",
  "stage.transition": "Изменение статуса этапа",
  "stage.version": "Новая версия результата",
  "request.create": "Запрос заказчику",
  "request.answer": "Ответ заказчика",
  "timer.start": "Запуск таймера",
  "timer.pause": "Пауза таймера",
  "timer.resume": "Возобновление таймера",
  "timer.pause_deleted": "Удаление паузы",
  "timer.update": "Изменение сроков",
  "file.upload": "Загрузка файла",
  "file.download": "Скачивание файла",
  "file.delete": "Удаление файла",
  "file.rejected": "Файл отклонён",
  "contract.create": "Формирование договора",
  "contract.otp": "Запрошен код подтверждения",
  "contract.accept": "Договор подтверждён",
  "payment.create": "Создание платежа",
  "payment.webhook": "Уведомление банка",
  "payment.status": "Изменение статуса платежа",
  "quick_order.create": "Быстрый заказ",
  "quick_order.select": "Выбор варианта",
  "ai.retry": "Повторный запуск AI-задачи",
  "archive.download": "Скачивание итогового архива",
  "settings.update": "Изменение настроек",
  "template.update": "Изменение шаблона",
};
