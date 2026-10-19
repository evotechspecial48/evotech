# Замена MockAIProvider на ClaudeProvider

## Интерфейс

```ts
// src/lib/ai/provider.ts
interface AIProvider {
  readonly name: string;
  readonly demo: boolean;                                   // true → интерфейс показывает «демонстрационный режим»
  generateVariants(req: VariantRequest): Promise<VariantDraft[]>;   // варианты конструкции
  generatePackage(req: PackageRequest): Promise<PackageFile[]>;     // файлы итогового пакета
}
```

Интерфейс и сервисы не зависят от конкретной модели: провайдер выбирает только `src/lib/ai/index.ts → aiProvider()` по переменной `AI_PROVIDER`.

## Что уже сделано

`src/lib/ai/claude-provider.ts` — рабочая заготовка на официальном SDK `@anthropic-ai/sdk`:

- `generateVariants` вызывает `client.beta.messages.parse` с `output_config.format = betaZodOutputFormat(схема)` и получает структурированный JSON: название, описание, шаг колонн, уклон, профили, шаг прогонов, надбавка к цене. Значения проверяются и ограничиваются допустимыми диапазонами, затем эскиз рисуется тем же параметрическим рендерером (`sketch.ts`), что и в демо-режиме.
- `generatePackage` запрашивает у модели текст пояснительной записки. Чертежи, IFC и спецификации собирает `package-builder.ts`.
- Модель по умолчанию — `claude-opus-5-5` (переменная `CLAUDE_MODEL`), `output_config.effort = "medium"`.
- Включены серверные резервные модели: `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`. Если классификатор отклонит запрос, API сам повторит его на резервной модели. Ответ со `stop_reason: "refusal"` обрабатывается как ошибка задачи, которую можно перезапустить.

## Как включить

1. В `.env`:
   ```
   AI_PROVIDER=claude
   ANTHROPIC_API_KEY=sk-ant-...      # или профиль `ant auth login` на сервере
   CLAUDE_MODEL=claude-opus-5-5
   ```
2. Перезапустите приложение и воркер. В «Настройки → Интеграции» должно быть «Claude».
3. Создайте быстрый заказ. AI-задача пройдёт тот же путь статусов (queued → processing → awaiting_selection …), а признак «демонстрационный режим» исчезнет, так как `demo=false`.

## Что потребуется для настоящей генерации документации (этап 3)

- Варианты по изображениям участка: передавать фото из `FileAsset` (category PHOTO) блоками `image` в `generateVariants`.
- Рабочие чертежи и IFC: модель формирует параметры, а геометрию строит CAD/BIM-движок (Tekla Open API, IfcOpenShell, FreeCAD) — это отдельный сервис за тем же интерфейсом `generatePackage`.
- Длительные генерации: воркер уже работает асинхронно; для больших запросов перейти на `messages.stream(...).finalMessage()`.
- Оценка качества: собрать набор эталонных заказов и сравнивать варианты до переключения в production.
- Стоимость: логировать `response.usage` в `AIJob.output`.

## Тестирование без API

`MockAIProvider` детерминирован и не требует ключей. Задержка задаётся `MOCK_AI_DELAY_MS`. Слово `ошибка-ai` в примечаниях заказа вызывает сбой генерации — так проверяется сценарий ошибки и повторного запуска.
