# API и интеграции

## HTTP-маршруты (`src/app/api`)

Все маршруты, кроме webhook и health, требуют сессии (cookie `evo_session`).

| Метод и путь | Назначение | Защита |
|---|---|---|
| `POST /api/files` | Загрузка файлов (multipart: `files[]`, `projectId` / `leadId` / `quickOrderId`, `stageCode`, `category`, `internal`) | Сессия, Origin (CSRF), право на объект, формат, размер, антивирус |
| `GET /api/files/:id/link[?inline=1]` | Проверка прав и редирект на временную ссылку | Сессия, право на файл |
| `GET /api/files/dl/:token` | Скачивание по подписанной ссылке (HMAC, 5 минут) | Подпись и срок; запись в журнал |
| `GET /api/quick-orders/:id/archive` | Итоговый архив | Договор подписан, платёж прошёл, результат completed |
| `GET /api/contracts/:id/pdf[?v=N]` | PDF редакции договора с отметкой о подписании | Владелец или сотрудник с правом |
| `GET /api/offers/:id/pdf` | PDF коммерческого предложения | Менеджер или заказчик (если КП отправлено) |
| `GET /api/export/leads`, `/api/export/projects` | CSV-выгрузки | `data.export` |
| `GET /api/export/me` | JSON с персональными данными текущего пользователя | Сессия |
| `GET /api/jobs/:id` | Статус AI-задачи | Владелец заказа или сотрудник |
| `POST /api/payments/tbank/webhook` | Уведомления Т-Банка | Token, сумма, идемпотентность |
| `GET /api/health` | Проверка доступности приложения и БД | — |

## Server Actions

Мутации интерфейса выполняются через server actions (`src/app/actions/public.ts`, `src/app/actions/cabinet.ts`). Next.js проверяет Origin для каждого из них. Каждое действие возвращает `ActionState`: `ok`, `error`, `fieldErrors`, `message`, `data.redirect`. Ошибки бизнес-правил (`UserError`) показываются пользователю, остальные пишутся в лог и показываются общим сообщением.

## Т-Банк Эквайринг

- **Создание платежа** (`services/payments.ts → createQuickOrderPayment`). Сначала проверяется `canPay`. Затем создаётся `Payment` (OrderId — уникальный, суммы в копейках) и вызывается `Init` с `SuccessURL`, `FailURL`, `NotificationURL=/api/payments/tbank/webhook`. Повторный запрос в течение 20 минут возвращает тот же неоплаченный платёж.
- **Подпись** (`domain/tbank.ts`). Берутся параметры корневого уровня без вложенных объектов, добавляется `Password`, ключи сортируются, значения склеиваются, от строки считается SHA-256. Покрыто тестами.
- **Уведомления**: подпись → поиск по OrderId → сверка суммы → `PaymentEvent(eventKey=PaymentId:Status)` с уникальным индексом (идемпотентность) → `canApplyPaymentStatus` (финальный статус не откатывается) → побочные действия после транзакции. Ответ `OK`; при внутренней ошибке — 500, и банк повторит уведомление.
- **Статусы**: AUTHORIZED → authorized, CONFIRMED → paid, CANCELED/REVERSED → cancelled, REJECTED → failed, REFUNDED → refunded.
- **Тестовый режим**: `PAYMENT_PROVIDER=tbank`, `TBANK_TERMINAL_KEY` и `TBANK_PASSWORD` от тестового терминала (в личном кабинете Т-Бизнес). `NotificationURL` должен быть доступен из интернета: на стенде или через туннель.
- **Демо-режим** (`PAYMENT_PROVIDER=mock`, по умолчанию). Страница `/pay/mock/:orderId` имитирует форму банка и отправляет уведомление того же формата, подписанное паролем, который выводится из `APP_SECRET`.
- **Возвраты**: `PaymentProvider.cancel` (метод `Cancel`), кнопка «Возврат» у директора. Статус refunded приходит уведомлением.

## Почта

Переменная `MAIL_TRANSPORT=smtp` включает отправку по SMTP (`SMTP_*`); в dev это Mailpit (`localhost:1025`, веб-интерфейс `:8025`). `console` пишет письма в лог. Все письма проходят через таблицу `OutboundEmail`.

## Файловое хранилище

`STORAGE_DRIVER=local` (каталог `STORAGE_DIR`) или `s3` (заготовка `S3Storage`). Имена файлов в хранилище — случайные UUID; исходное имя хранится в БД и отдаётся в `Content-Disposition`.

## AI

См. [AI_PROVIDER.md](AI_PROVIDER.md).
