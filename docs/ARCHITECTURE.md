# Архитектура

## Слои

```
src/
  domain/      Чистая бизнес-логика без БД и фреймворка: RBAC, переходы статусов, таймер,
               правила доступа к оплате и архиву, подпись Т-Банка, цены, поля ТЗ. Покрыта юнит-тестами.
  services/    Бизнес-операции: проверка прав на объект → транзакция Prisma → журнал → уведомления.
  lib/         Инфраструктура: db, env, auth (сессии), crypto, audit, mailer, notify, storage,
               rate-limit, pdf, ai/* (провайдеры), payments/* (провайдеры), logger.
  app/         Next.js: (site) — публичные страницы, cabinet — кабинет, api — маршруты,
               actions — server actions (тонкий слой: валидация формы → сервис).
  components/  UI: дизайн-система (ui.tsx), клиентские формы (client.tsx), виджеты кабинета.
prisma/        Схема, миграции, seed, шаблоны документов.
scripts/       worker.ts — фоновый воркер.
tests/         Vitest: юнит-тесты домена и интеграционные сквозные сценарии.
```

Правило зависимостей: `app → services → domain`, а `services → lib`. Интерфейс не обращается к внешним API напрямую: AI и платежи доступны только через интерфейсы `AIProvider` и `PaymentProvider`.

## Ключевые потоки

**Заявка.** Публичная форма вызывает `submitLeadAction`: проверяет honeypot, время заполнения, лимит запросов по IP и согласие на обработку ПДн, затем `createLead` сохраняет заявку. Заявка записывается в БД до любых внешних вызовов. Далее назначается свободный менеджер, отправляются уведомление и письмо. UTM-метки берутся из cookie, которую middleware ставит при первом визите.

**Воронка.** Статусы: new → qualification → tz_preparation → commercial_offer → contract_approval → awaiting_signature → won/lost. Переходы задаёт `domain/lead.ts`. Статус «won» ставится только при конвертации в проект, и только если договор подписан.

**ТЗ.** Каждое сохранение с изменениями создаёт версию: автор, время, список изменённых полей, контрольная сумма. Цикл: DRAFT → SUBMITTED → CLARIFICATION → APPROVED. При утверждении создаётся неизменяемая версия-снимок (`isSnapshot`), этап «ТЗ» закрывается и стартует «Эскиз».

**Этапы.** Шесть этапов из ТЗ, статусы и правила переходов — в `domain/stage.ts`:

```
not_started → in_progress → (версия) → internal_review → [проверку подтверждает проектировщик] → customer_review
customer_review → approved (версия блокируется, сохраняется checksum файлов) → completed → следующий этап
customer_review → changes_requested (комментарий обязателен) → новая версия, связанная с предыдущей
```

**Таймер** (`domain/timer.ts`). Срок отсчитывается от даты подписания договора; режим — календарные или рабочие дни с учётом праздников из настроек. Паузы исключаются из затраченного времени и сдвигают прогнозную дату. Автоматическая пауза открывается, когда от заказчика что-то ожидается: открытый запрос или этап на его согласовании. Закрывается она, когда ожиданий не остаётся (`syncAutoPause`, идемпотентно). Ручные паузы ставит руководитель проекта и обязательно указывает причину. Удалить запись о паузе может только директор, с основанием и записью в журнал.

**Быстрый заказ.** Мастер создаёт QuickOrder и AIJob (queued). `MockAIProvider` генерирует три варианта: параметры конструкции и SVG-эскиз. Заказчик выбирает вариант; система рассчитывает цену и формирует типовой договор. Договор подписывается кодом, затем — оплата. Webhook банка (`handlePaymentNotification`) переводит заказ в PAID, а задачу — в generating_package. Собирается ZIP-архив: эскиз, визуализация, IFC, PDF чертежей, CSV спецификаций и ведомостей, PDF пояснительной записки. Заказ получает статус COMPLETED.

**Очередь AI-задач.** Хранится в таблице `AIJob`. Задачу захватывает атомарный `updateMany` по статусу или блокировке, поэтому её можно обрабатывать из веб-процесса (`kickJob`) и воркера одновременно без двойного выполнения. Блокировка старше 10 минут считается зависшей, и задача возвращается в очередь. Повторный запуск — `retryJob`, с фазы, на которой произошла ошибка.

**Уведомления.** `notify()` создаёт внутреннее уведомление и письмо в очереди `OutboundEmail`. Если SMTP недоступен, письмо не теряется: его повторит воркер (до 5 попыток). Каналы Telegram и SMS добавляются в `lib/notify.ts`.

## Модель данных (основные сущности)

`User` (роль, статус, задел под 2FA) · `Company` · `Session` · `AuthToken` (подтверждение почты, сброс пароля, приглашение, код договора) · `Lead` · `Comment` · `Task` · `CommercialOffer` · `TechnicalSpecification` / `TechnicalSpecificationVersion` · `Project` · `ProjectMember` · `ProjectStage` · `StageVersion` (цепочка previous/next, lockedAt, checksum) · `Approval` · `StatusChange` · `CustomerRequest` · `Timer` / `TimerPause` · `FileAsset` · `DocumentTemplate` (версии) · `Contract` / `ContractVersion` / `ContractAcceptance` · `Payment` / `PaymentEvent` · `QuickOrder` · `DesignVariant` · `AIJob` · `Notification` · `OutboundEmail` · `AuditEvent` · `Setting` · `RateLimit`.

Отличия от предложенного в ТЗ списка:
- `Role` и `Permission` реализованы матрицей в коде (`domain/rbac.ts`), а не таблицами: роли фиксированы, и так проверки прав остаются типобезопасными. Если понадобятся настраиваемые роли — добавить таблицу переопределений.
- `CustomerProfile` и `EmployeeProfile` объединены в `User` (поля position и phone) и `Company`.
- `LeadComment` объединён с комментариями проекта в `Comment` (поля leadId/projectId и флаг internal).
- `Document` — это `ContractVersion`, `CommercialOffer` и сформированные `FileAsset`; PDF генерируется по запросу.

## Безопасность

| Требование | Реализация |
|---|---|
| Проверки прав на сервере | Каждое server action вызывает `actor(permission)`; сервисы повторно проверяют доступ к объекту (`loadProjectAccess`, `loadLeadAccess`) |
| Изоляция заказчиков | Фильтры `projectScope`, `leadScope`, `quickOrderScope` в каждом запросе; чужой объект отдаёт 404 без раскрытия данных; внутренние комментарии и файлы, а также неотправленные версии скрыты от заказчика |
| Пароли | bcrypt (12 раундов); блокировка после 5 неудачных попыток на 15 минут; лимит частоты по IP и почте |
| Сессии | Случайный токен в httpOnly-cookie (SameSite=Lax, Secure в production); в БД хранится только его SHA-256 |
| CSRF | Server Actions проверяют Origin (встроено в Next.js); API загрузки файлов проверяет Origin/Referer; cookie SameSite=Lax |
| XSS | React экранирует вывод; SVG эскизов генерируется сервером из чисел и экранированных строк; файлы отдаются с `Content-Disposition` и строгим CSP |
| SQL injection | Prisma с параметризованными запросами; сырые запросы — только шаблонные литералы `$queryRaw` |
| Webhook | Проверка Token (SHA-256) с `timingSafeEqual`, сверка суммы, идемпотентность по `PaymentId:Status`, запрет отката финального статуса |
| Файлы | Белый список расширений, лимит размера (настройка), точка антивирусной проверки (`VirusScanner`; тестовая сигнатура EICAR), выдача по подписанным ссылкам со сроком 5 минут, журнал скачиваний |
| Банковские карты | Не обрабатываются и не хранятся — только `providerPaymentId` и статус |
| Логи | Структурированный JSON; поля password, token, email, phone и подобные маскируются |
| ПДн | Выгрузка своих данных (JSON), обезличивание директором; договоры и платежи сохраняются |
| Журнал | `AuditEvent`: вход, договоры, платежи, файлы, таймер, статусы, настройки; через интерфейс записи не редактируются |
| Заголовки | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy |

Резервное копирование: том PostgreSQL `pgdata` — ежедневный `pg_dump` (cron или managed-БД); файлы — версионирование бакета S3 или снапшоты тома `files`. Метаданные файлов лежат в БД, поэтому восстановление согласовано.

## Точки расширения

| Что | Где |
|---|---|
| Claude API | `lib/ai/claude-provider.ts`, переключение `AI_PROVIDER=claude` (см. AI_PROVIDER.md) |
| Т-Банк (боевой) | `PAYMENT_PROVIDER=tbank` и ключи терминала; возвраты — `PaymentProvider.cancel` |
| ЭП / ЭДО | `SignMethod.EXTERNAL_EDO` и `ContractAcceptance`; новый сервис подписания вызывается вместо OTP в `services/contracts.ts` |
| S3 | `lib/storage/index.ts` → `S3Storage` |
| Антивирус | `lib/storage/index.ts` → `scanner` (ClamAV) |
| 2FA | `User.twoFactorEnabled` / `twoFactorSecret`; второй шаг — в `services/users.ts → authenticate` |
| Telegram / SMS | `lib/notify.ts` |
| CRM, 1С, CAD/BIM | Сервисный слой; выгрузки CSV (`/api/export/*`) |
