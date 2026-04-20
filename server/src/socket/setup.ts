import { z } from "zod";
import type { Server } from "socket.io";
import type { Logger } from "../lib/logger.js";

const videoIdSchema = z.string().uuid();

export function setupSocketIo(io: Server, logger: Logger) {
  io.on("connection", (socket) => {
    logger.debug("socket connected", { socketId: socket.id });

    // Backward-compatible room events for video pages.
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

    // Explicit room events for channel subscription updates.
    socket.on("join:channel", (raw: unknown) => {
      const parsed = videoIdSchema.safeParse(raw);
      if (!parsed.success) return;
      void socket.join(`channel:${parsed.data}`);
    });

    socket.on("leave:channel", (raw: unknown) => {
      const parsed = videoIdSchema.safeParse(raw);
      if (!parsed.success) return;
      void socket.leave(`channel:${parsed.data}`);
    });

    socket.on("disconnect", (reason) => {
      logger.debug("socket disconnected", { socketId: socket.id, reason });
    });
  });
} 
