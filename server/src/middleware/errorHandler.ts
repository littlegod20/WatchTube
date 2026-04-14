import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import type { Logger } from "../lib/logger.js";

export class HttpError extends Error {
  status: number;
  expose: boolean;

  constructor(status: number, message: string, expose = true) {
    super(message);
    this.status = status;
    this.expose = expose;
  }
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Validation failed", details: err.flatten() });
    }
    const status = err instanceof HttpError ? err.status : 500;
    const message =
      err instanceof HttpError && err.expose
        ? err.message
        : status === 500
          ? "Internal Server Error"
          : err instanceof Error
            ? err.message
            : "Error";
    if (status >= 500) {
      logger.error("Unhandled error", {
        err: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined,
        requestId: req.requestId,
        path: req.path,
      });
    }
    if (res.headersSent) {
      return;
    }
    res.status(status).json({ error: message });
  };
}
