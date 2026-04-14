import { Router } from "express";
import { z } from "zod";
import { VideoStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { routeParamString } from "../lib/routeParams.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const likesRouter = Router();

likesRouter.get("/videos/:videoId/likes/me", requireAuth, async (req, res, next) => {
  try {
    const videoId = routeParamString(req.params.videoId, "videoId");
    const like = await prisma.like.findUnique({
      where: { userId_videoId: { userId: req.user!.id, videoId } },
    });
    res.json({ liked: Boolean(like) });
  } catch (e) {
    next(e);
  }
});

likesRouter.get("/videos/:videoId/likes/count", async (req, res, next) => {
  try {
    const videoId = routeParamString(req.params.videoId, "videoId");
    const count = await prisma.like.count({ where: { videoId } });
    res.json({ count });
  } catch (e) {
    next(e);
  }
});

likesRouter.post("/videos/:videoId/likes/toggle", requireAuth, async (req, res, next) => {
  try {
    const videoId = routeParamString(req.params.videoId, "videoId");
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.status !== VideoStatus.READY) throw new HttpError(404, "Video not found");
    const existing = await prisma.like.findUnique({
      where: { userId_videoId: { userId: req.user!.id, videoId } },
    });
    if (existing) {
      await prisma.like.delete({
        where: { userId_videoId: { userId: req.user!.id, videoId } },
      });
      const count = await prisma.like.count({ where: { videoId } });
      return res.json({ liked: false, count });
    }
    await prisma.like.create({
      data: { userId: req.user!.id, videoId },
    });
    const count = await prisma.like.count({ where: { videoId } });
    res.json({ liked: true, count });
  } catch (e) {
    next(e);
  }
});

const videoIdsSchema = z.object({ videoIds: z.array(z.string().uuid()).max(50) });

likesRouter.post("/likes/batch", async (req, res, next) => {
  try {
    const body = videoIdsSchema.parse(req.body);
    const userId = req.user?.id;
    const counts = await prisma.like.groupBy({
      by: ["videoId"],
      where: { videoId: { in: body.videoIds } },
      _count: { videoId: true },
    });
    const countMap = Object.fromEntries(counts.map((c) => [c.videoId, c._count.videoId]));
    let likedSet = new Set<string>();
    if (userId) {
      const likes = await prisma.like.findMany({
        where: { userId, videoId: { in: body.videoIds } },
        select: { videoId: true },
      });
      likedSet = new Set(likes.map((l) => l.videoId));
    }
    res.json({
      counts: body.videoIds.map((id) => ({ videoId: id, count: countMap[id] ?? 0 })),
      liked: body.videoIds.map((id) => ({ videoId: id, liked: likedSet.has(id) })),
    });
  } catch (e) {
    next(e);
  }
});
