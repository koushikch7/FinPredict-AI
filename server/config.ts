import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  COOKIE_SECRET: z.string().min(16).optional(),

  GEMINI_API_KEY: z.string().optional().default(''),
  DEFAULT_AI_PROVIDER: z.enum(['Gemini', 'OpenAI', 'Arbiter']).default('Gemini'),
  DEFAULT_AI_MODEL: z.string().default('gemini-2.5-flash'),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // Arbiter — OpenAI-compatible LLM router/gateway aggregating 12+ providers
  // (Gemini, Groq, Cerebras, Cloudflare Workers AI, OpenRouter, Cohere, HF, …)
  // Used as automatic fallback when the primary provider returns 429/quota errors.
  ARBITER_API_KEY: z.string().optional().default(''),
  ARBITER_BASE_URL: z.string().default('https://arbiter.chkoushik.com/v1'),
  ARBITER_MODEL: z.string().default('auto'),
  AI_FALLBACK_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),

  DB_PATH: z.string().default('./data/finance.db'),
  NEWS_API_KEY: z.string().optional().default(''),
  HUGGINGFACE_API_KEY: z.string().optional().default(''),

  KITE_API_KEY: z.string().optional().default(''),
  KITE_API_SECRET: z.string().optional().default(''),

  ALLOW_FIRST_ADMIN_REGISTRATION: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),

  PLAYGROUND_CRON: z.string().default('*/5 * * * 1-5'),

  // S3 / OCI Object Storage backup
  S3_ENDPOINT: z.string().optional().default(''),
  S3_BUCKET: z.string().optional().default(''),
  S3_REGION: z.string().optional().default('us-east-1'),
  S3_ACCESS_KEY: z.string().optional().default(''),
  S3_SECRET_KEY: z.string().optional().default(''),
  S3_PREFIX: z.string().optional().default('finpredict'),
  BACKUP_STORAGE_LIMIT_GB: z.coerce.number().default(10),
});

const parsed = Schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    // eslint-disable-next-line no-console
    console.error(` • ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isDev: parsed.data.NODE_ENV === 'development',
  isTest: parsed.data.NODE_ENV === 'test',
};

export type AppConfig = typeof config;
