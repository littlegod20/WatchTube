import { z } from "zod";
import type { Server } from "socket.io";
import type { Logger } from "../lib/logger.js";

const videoIdSchema = z.string().uuid();

export function setupSocketIo(io: Server, logger: Logger) {
  io.on("connection", (socket) => {
    logger.debug("socket connected", { socketId: socket.id });

    socket.on("join", (raw: unknown) => {
      const parsed = videoIdSchema.safeParse(raw);
      if (!parsed.success) return;
      void socket.join(`video:${parsed.data}`);
    });

    socket.on("leave", (raw: unknown) => {
      const parsed = videoIdSchema.safeParse(raw);
      if (!parsed.success) return;
      void socket.leave(`video:${parsed.data}`);
    });

    socket.on("disconnect", (reason) => {
      logger.debug("socket disconnected", { socketId: socket.id, reason });
    });
  });
}
