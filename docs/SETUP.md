# Запуск проекта на другом устройстве

Инструкция, чтобы развернуть проект ЭвоТех на новом компьютере, запустить его локально и вносить правки.

## 1. Что установить

| Программа | Зачем | Где взять |
|---|---|---|
| Node.js 22 или новее (LTS) | Запуск приложения | https://nodejs.org |
| Docker Desktop | PostgreSQL и почтовый тестер Mailpit | https://www.docker.com/products/docker-desktop |
| Git | Получение кода и отправка правок | https://git-scm.com |
| VS Code (рекомендуется) | Редактирование | https://code.visualstudio.com |

После установки Docker Desktop запустите его и дождитесь статуса «Engine running».

## 2. Получить код

**Вариант А — из GitHub (рекомендуется: правки можно отправлять обратно):**

```bash
git clone https://github.com/evotechspecial48/evotech.git evotechnology
cd evotechnology
```

**Вариант Б — из архива:** распакуйте `evotech-*.zip` в любую папку, например `D:\evotechnology`, и откройте в ней терминал.

## 3. Первый запуск

Команды одинаковы для Windows (PowerShell), macOS и Linux:

```bash
npm install
npm run setup:env          # создаёт .env из .env.example со случайным APP_SECRET
npm run db:up              # PostgreSQL :5432 и Mailpit :8025
npx prisma migrate deploy  # создаёт таблицы
npm run db:seed            # демо-данные (пароль у всех: Demo2026!)
npm run dev                # http://localhost:3000
```

Во втором терминале (по желанию) — фоновые задачи:

```bash
npm run worker
```

- Сайт: http://localhost:3000, вход в кабинет: http://localhost:3000/login (например, `director@evotech.demo` / `Demo2026!`).
- Письма (коды подписания, подтверждения) приходят в Mailpit: http://localhost:8025.

Остановить базу: `npm run db:down`. Данные базы сохраняются в Docker-томе между запусками.

## 4. Где что править

| Что меняем | Где |
|---|---|
| Тексты сайта: услуги, преимущества, этапы, FAQ, контакты, реквизиты | `src/content/site.ts` |
| Блоки главной страницы | `src/app/(site)/page.tsx` |
| Шапка и подвал | `src/components/site/chrome.tsx` |
| Цвета и шрифты | `src/app/globals.css` (токены в `@theme`) |
| Логотипы | `public/brand/` |
| Ставки калькулятора и быстрых заказов | `src/domain/quick-order.ts` |
| Поля ТЗ | `src/domain/spec.ts` |
| Роли и права | `src/domain/rbac.ts` |
| Шаблоны договора и КП по умолчанию | `prisma/templates.ts` (в работающей системе — «Кабинет → Настройки») |
| Структура базы данных | `prisma/schema.prisma`, затем `npm run db:migrate` |

Полное описание модулей — [SPECIFICATION.md](SPECIFICATION.md).

`npm run dev` перезагружает страницу автоматически при сохранении файла.

Перед отправкой правок проверьте:

```bash
npm run lint
npm run typecheck
npm test
```

## 5. Отправить правки в GitHub

```bash
git add -A
git commit -m "Описание правки"
git push
```

При первом `git push` Git попросит войти в аккаунт GitHub `evotechspecial48`.

## 6. Обновить боевой сервер

Боевой сервер (Timeweb, `129.101.119.178`, каталог `/opt/evotech`) принимает вход только по SSH-ключу. С нового устройства:

1. Создайте ключ: `ssh-keygen -t ed25519`.
2. Добавьте публичный ключ (`~/.ssh/id_ed25519.pub`) на сервер — через панель Timeweb или с устройства, у которого уже есть доступ, в файл `/root/.ssh/authorized_keys`.
3. Загрузите код и пересоберите:

```bash
git archive --format=tar HEAD | ssh root@129.101.119.178 "cd /opt/evotech && tar -xf -"
ssh root@129.101.119.178 "cd /opt/evotech && docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --build app worker && docker builder prune -af"
```

Файл `.env` с секретами на сервере при этом не перезаписывается. Миграции базы применяются автоматически.

## 7. Что не входит в репозиторий и архив

| Что | Почему | Как перенести |
|---|---|---|
| `.env` | Секреты | Создаётся командой `npm run setup:env`; боевые ключи хранятся только на сервере |
| `data/import/*` (выгрузки таблицы учёта, список сотрудников) | Персональные данные клиентов | Вручную, на флешке или через защищённое хранилище. Нужны только для `npm run import:sheet` |
| `node_modules/`, `.next/` | Генерируются | `npm install`, `npm run dev` |
| `storage/` | Загруженные локально файлы | Не нужны для разработки |
| Боевая база данных | Живые данные | Резервные копии на сервере: `/opt/evotech/backups` |
