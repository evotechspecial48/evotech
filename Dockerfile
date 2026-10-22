# syntax=docker/dockerfile:1
# Сборка: docker compose --profile app up --build (локально) или deploy/docker-compose.prod.yml (сервер)

FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
# Адрес сайта нужен на этапе сборки (sitemap, metadataBase). Секреты сюда не попадают:
# ниже — только заглушки для проверки переменных при сборке, боевые значения приходят из .env при запуске.
ARG APP_URL=http://localhost:3000
ENV NEXT_TELEMETRY_DISABLED=1 APP_URL=$APP_URL     APP_SECRET=build-time-placeholder-not-a-secret     DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npx prisma generate && npm run build

# Веб-приложение (Next.js standalone)
FROM node:24-alpine AS app
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/assets ./assets
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 3000
# Миграции применяет отдельный шаг (сервис migrate на образе воркера с полным набором зависимостей)
CMD ["node", "server.js"]

# Фоновый воркер (AI-задачи, письма, сроки)
FROM build AS worker
ENV NODE_ENV=production
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
CMD ["npx", "tsx", "scripts/worker.ts"]
