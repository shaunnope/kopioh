import { API_CONSTANTS } from "https://deno.land/x/grammy@v1.42.0/mod.ts";
import z, { ZodError } from "zod"

function parseJsonSafe(path: string) {
  return (value: unknown) => {
    try {
      return JSON.parse(String(value))
    }
    catch {
      throw new ZodError([
        {
          code: "invalid_format",
          path: [path],
          message: "Invalid JSON",
          format: "json_string"
        },
      ])
    }
  }
}

const configSchema = z.object({
  DEPLOY_ENV: z.enum(["development", "production", "test"]).default("production"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  BOT_ALLOWED_UPDATES: z
    .preprocess(arg => parseJsonSafe(arg as string), z.array(z.enum(API_CONSTANTS.ALL_UPDATE_TYPES)))
    .catch([]),
  BOT_TOKEN: z.string(),
  BOT_OWNER_ID: z.coerce.number().int(),
  PLATFORM: z.enum(["supabase", "deno-deploy"]).default("supabase"),
  PROJECT_ID: z.string(),
  PLATFORM_KEY: z.string(),
  DATABASE: z.enum(["postgres"]).default("postgres"),
  DB_PASSWORD:z.string().default("password"),
  DB_URL:z.string(),
})

export function parseConfig(env: Deno.Env) {
  const config = configSchema.parse(env.toObject())
  const hydrated = {
    ...config,
    env_isTest: config.DEPLOY_ENV === "test",
    env_isProd: config.DEPLOY_ENV === "production",
  }
  const DB_URL = hydrated.env_isTest 
    ? config.DB_URL // use the provided url as-is when testing
    : `postgresql://postgres.${config.PROJECT_ID}:${config.DB_PASSWORD}@${config.DB_URL}`

  return {
    ...hydrated,
    PROJECT_URL: config.PLATFORM == "supabase" ? `https://${config.PROJECT_ID}.supabase.co` : "",
    DB_URL: DB_URL
  }
}

export type Config = ReturnType<typeof parseConfig>
export const config = parseConfig(Deno.env)

export type LogLevel = typeof config.LOG_LEVEL