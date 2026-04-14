import winston from "winston";
import type { Env } from "../config/env.js";

export function createLogger(env: Env) {
  const isProd = env.NODE_ENV === "production";

  const jsonFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  );

  const devFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "HH:mm:ss" }),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      return `${String(timestamp)} ${level}: ${message}${rest}`;
    })
  );

  return winston.createLogger({
    level: env.NODE_ENV === "development" ? "debug" : "info",
    format: isProd ? jsonFormat : devFormat,
    defaultMeta: { service: "watchtube-server" },
    transports: [new winston.transports.Console({ stderrLevels: ["error"] })],
  });
}

export type Logger = ReturnType<typeof createLogger>;
