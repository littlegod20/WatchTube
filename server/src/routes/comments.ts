import { Router } from "express";
import { z } from "zod";
import { VideoStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { routeParamString } from "../lib/routeParams.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { HttpError } from "../middleware/errorHandler.js";
import type { Server as SocketServer } from "socket.io";

const createSchema = z.object({
  body: z.string().min(1).max(2000),
});

export function createCommentsRouter(io: SocketServer) {
  const router = Router();

  router.get("/videos/:videoId/comments", async (req, res, next) => {
    try {
      const videoId = routeParamString(req.params.videoId, "videoId");
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.status !== VideoStatus.READY) throw new HttpError(404, "Video not found");
      const comments = await prisma.comment.findMany({
        where: { videoId },
        orderBy: { createdAt: "asc" },
        take: 200,
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
      res.json({
        comments: comments.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt,
          user: c.user,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/videos/:videoId/comments", requireAuth, async (req, res, next) => {
    try {
      const videoId = routeParamString(req.params.videoId, "videoId");
      const parsed = createSchema.parse(req.body);
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.status !== VideoStatus.READY) throw new HttpError(404, "Video not found");
      const comment = await prisma.comment.create({
        data: {
          videoId,
          userId: req.user!.id,
          body: parsed.body.trim(),
        },
        include: {
          user: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
      const payload = {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        user: comment.user,
        videoId,
      };
      io.to(`video:${videoId}`).emit("comment:created", payload);
      res.status(201).json({ comment: payload });
    } catch (e) {
      next(e);
    }
  });

  router.delete("/comments/:id", requireAuth, async (req, res, next) => {
    try {
      const id = routeParamString(req.params.id, "commentId");
      const existing = await prisma.comment.findFirst({
        where: { id, userId: req.user!.id },
      });
      if (!existing) throw new HttpError(404, "Comment not found");
      await prisma.comment.delete({ where: { id } });
      io.to(`video:${existing.videoId}`).emit("comment:deleted", { id, videoId: existing.videoId });
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
