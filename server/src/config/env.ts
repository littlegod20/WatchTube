import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/** Load `.env` from monorepo root, then `server/.env` (cwd is often `server/` so default dotenv misses root). */
function loadEnvFiles() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const serverRoot = path.resolve(here, "../..");
  const repoRoot = path.resolve(here, "../../..");
  loadDotenv({ path: path.join(repoRoot, ".env") });
  loadDotenv({ path: path.join(serverRoot, ".env"), override: true });
}

loadEnvFiles();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),
  SERVER_URL: z.string().url(),
  CLIENT_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  CDN_PUBLIC_BASE_URL: z.string().url(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration");
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache() {
  cached = null;
}
