import { z } from "zod";

// Проверка переменных окружения при старте. Секреты не логируются.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(16, "APP_SECRET должен быть не короче 16 символов"),
  DATABASE_URL: z.string().min(1),
  MAIL_TRANSPORT: z.enum(["console", "smtp"]).default("console"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default("EvoTechnology <no-reply@evotechnology.su>"),
  STORAGE_DRIVER: z.enum(["local", "webdav", "s3"]).default("local"),
  WEBDAV_URL: z.string().optional(),
  WEBDAV_USER: z.string().optional(),
  WEBDAV_PASSWORD: z.string().optional(),
  WEBDAV_ROOT: z.string().default("/EvoTech"),
  STORAGE_DIR: z.string().default("./storage"),
  FILE_MAX_SIZE_MB: z.coerce.number().default(500),
  FILE_LINK_TTL_SECONDS: z.coerce.number().default(300),
  AI_PROVIDER: z.enum(["mock", "claude"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default("claude-opus-5-5"),
  MOCK_AI_DELAY_MS: z.coerce.number().default(2500),
  PAYMENT_PROVIDER: z.enum(["mock", "tbank"]).default("mock"),
  TBANK_TERMINAL_KEY: z.string().optional(),
  TBANK_PASSWORD: z.string().optional(),
  TBANK_API_URL: z.string().default("https://securepay.tinkoff.ru/v2"),
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === "production";
