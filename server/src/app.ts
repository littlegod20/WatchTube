import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Env } from "./config/env.js";
import type { Logger } from "./lib/logger.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { createErrorHandler, HttpError } from "./middleware/errorHandler.js";
import { passport } from "./passport.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { createVideosRouter } from "./routes/videos.js";
import { createCommentsRouter } from "./routes/comments.js";
import { likesRouter } from "./routes/likes.js";
import { subscriptionsRouter } from "./routes/subscriptions.js";
import type { Server as SocketServer } from "socket.io";

export function createApp(env: Env, logger: Logger, io: SocketServer) {
  const app = express();

  app.set("trust proxy", 1);

  app.use(requestIdMiddleware);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));

  const PgSession = connectPgSimple(session);
  const sessionMiddleware = session({
    store: new PgSession({
      conString: env.DATABASE_URL,
      createTableIfMissing: true,
    }),
    name: "watchtube.sid",
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  });

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  app.use(
    morgan("short", {
      stream: {
        write: (line: string) => {
          logger.info(line.trim(), { type: "http" });
        },
      },
    })
  );

  app.use("/api", healthRouter);
  app.use("/api", authRouter);
  app.use("/api", createVideosRouter(env));
  app.use("/api", createCommentsRouter(io));
  app.use("/api", likesRouter);
  app.use("/api", subscriptionsRouter);

  app.use((req, _res, next) => {
    next(new HttpError(404, `Not found: ${req.method} ${req.originalUrl}`));
  });

  const errorHandler = createErrorHandler(logger);
  app.use(errorHandler);

  return { app };
}
