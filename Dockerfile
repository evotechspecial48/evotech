# syntax=docker/dockerfile:1
# Сборка: docker compose --profile app up --build

FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
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
COPY --from=build /app/node_modules/prisma ./node_modules/prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 3000
# Миграции применяются при старте; затем запускается сервер
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]

# Фоновый воркер (AI-задачи, письма, сроки)
FROM build AS worker
ENV NODE_ENV=production
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
CMD ["npx", "tsx", "scripts/worker.ts"]
