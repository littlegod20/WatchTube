import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const id = (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
};
