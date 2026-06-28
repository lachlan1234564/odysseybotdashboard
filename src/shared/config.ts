import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
if (process.env.COREPANEL_DISABLE_DOTENV !== "true") {
  dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });
}

const baseSchema = z.object({
  DATABASE_URL: z.string().default("file:./data/bot.db"),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  DASHBOARD_PORT: z.coerce.number().int().min(1).max(65535).default(3210),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  DASHBOARD_HOST: z.string().default("127.0.0.1"),
  UPLOADS_DIR: z.string().default("./uploads"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  COREPANEL_SECRET_KEY: z.string().min(16).optional(),
  DASHBOARD_SESSION_SECRET: z.string().min(16).optional(),
  PUBLIC_BASE_URL: z.string().url().optional(),
  VERIFY_PUBLIC_BASE_URL: z.string().url().optional()
});

const discordSchema = baseSchema.extend({
  DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
  DISCORD_CLIENT_ID: z.string().min(1, "DISCORD_CLIENT_ID is required"),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
  DISCORD_OAUTH_REDIRECT_URI: z.string().url().optional()
});

const dashboardSchema = baseSchema.extend({
  DISCORD_TOKEN: z.string().min(1).optional(),
  DISCORD_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  DASHBOARD_PASSWORD: z.string().min(8, "DASHBOARD_PASSWORD must be at least 8 characters").optional(),
  DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
  DISCORD_OAUTH_REDIRECT_URI: z.string().url().optional(),
  VPN_CHECK_URL_TEMPLATE: z.string().min(1).optional(),
  VPN_CHECK_API_KEY: z.string().min(1).optional()
});

function formatConfigError(error: z.ZodError): Error {
  const details = error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  return new Error(`Invalid environment configuration: ${details}`);
}

export function loadBaseConfig() {
  const result = baseSchema.safeParse(process.env);
  if (!result.success) throw formatConfigError(result.error);
  return { ...result.data, projectRoot };
}

export function loadDiscordConfig() {
  const result = discordSchema.safeParse(process.env);
  if (!result.success) throw formatConfigError(result.error);
  return { ...result.data, projectRoot };
}

export function loadDashboardConfig() {
  const result = dashboardSchema.safeParse(process.env);
  if (!result.success) throw formatConfigError(result.error);
  return { ...result.data, projectRoot };
}

export function resolveDatabasePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("DATABASE_URL must use the SQLite file: format");
  }

  const filePath = databaseUrl.slice("file:".length);
  return path.resolve(projectRoot, filePath);
}

export function resolveUploadsPath(uploadsDir: string): string {
  return path.resolve(projectRoot, uploadsDir);
}
