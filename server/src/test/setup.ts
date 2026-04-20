import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { resetEnvCache } from "../config/env.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "../..");
const repoRoot = path.resolve(here, "../../..");
config({ path: path.join(repoRoot, ".env") });
config({ path: path.join(serverRoot, ".env"), override: true });

const defaults: Record<string, string> = {
  NODE_ENV: "test",
  PORT: "3000",
  VITE_API_BASE_URL: "http://localhost:3000",
  CLIENT_ORIGIN: "http://localhost:5173",
  DATABASE_URL: "postgresql://watchtube:watchtube@localhost:5432/watchtube",
  SESSION_SECRET: "test-session-secret-not-for-production",
  S3_REGION: "us-east-1",
  S3_BUCKET: "watchtube-videos",
  S3_ACCESS_KEY: "minioadmin",
  S3_SECRET_KEY: "minioadmin",
  S3_ENDPOINT: "http://localhost:9000",
  S3_FORCE_PATH_STYLE: "true",
  CDN_PUBLIC_BASE_URL: "http://localhost:9000/watchtube-videos",
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined || process.env[key] === "") {
    process.env[key] = value;
  }
}

resetEnvCache();
