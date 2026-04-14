import { randomUUID } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { VideoCategory, VideoStatus, VideoVisibility } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { routeParamString } from "../lib/routeParams.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { buildPlaybackUrl, createS3Client, presignPutObject } from "../services/s3.js";
import type { Env } from "../config/env.js";

const ALLOWED_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

const initUploadSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).default(""),
  mimeType: z.string().min(3).max(128),
  sizeBytes: z.number().int().positive().max(MAX_BYTES),
  visibility: z.nativeEnum(VideoVisibility).default(VideoVisibility.PUBLIC),
  category: z.nativeEnum(VideoCategory).default(VideoCategory.OTHER),
});

const completeUploadSchema = z.object({
  videoId: z.string().uuid(),
});

export function createVideosRouter(env: Env) {
  const router = Router();
  const s3 = createS3Client(env);

  const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });

  router.get("/videos", async (req, res, next) => {
    try {
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const rawQ = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
      const search =
        rawQ.length > 0
          ? {
              OR: [
                { title: { contains: rawQ, mode: "insensitive" as const } },
                { description: { contains: rawQ, mode: "insensitive" as const } },
              ],
            }
          : {};
      const take = 12;
      const items = await prisma.video.findMany({
        where: {
          status: VideoStatus.READY,
          visibility: VideoVisibility.PUBLIC,
          ...search,
        },
        orderBy: { createdAt: "desc" },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          owner: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
      let nextCursor: string | undefined;
      const page = items;
      if (page.length > take) {
        const last = page.pop()!;
        nextCursor = last.id;
      }
      res.json({
        videos: page.map((v) => ({
          id: v.id,
          title: v.title,
          description: v.description,
          category: v.category,
          playbackUrl: v.playbackUrl,
          viewCount: v.viewCount,
          createdAt: v.createdAt,
          owner: v.owner,
        })),
        nextCursor,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/videos/:id", async (req, res, next) => {
    try {
      const id = routeParamString(req.params.id, "videoId");
      const video = await prisma.video.findUnique({
        where: { id },
        include: {
          owner: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
      if (!video) throw new HttpError(404, "Video not found");
      const isOwner = req.user?.id === video.ownerId;
      if (video.visibility !== VideoVisibility.PUBLIC && !isOwner) {
        throw new HttpError(404, "Video not found");
      }
      if (video.status !== VideoStatus.READY && !isOwner) {
        throw new HttpError(404, "Video not found");
      }
      res.json({
        video: {
          id: video.id,
          title: video.title,
          description: video.description,
          category: video.category,
          playbackUrl: video.playbackUrl,
          viewCount: video.viewCount,
          visibility: video.visibility,
          status: video.status,
          createdAt: video.createdAt,
          owner: video.owner,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/videos/:id/view", async (req, res, next) => {
    try {
      const id = routeParamString(req.params.id, "videoId");
      const video = await prisma.video.updateMany({
        where: { id, status: VideoStatus.READY },
        data: { viewCount: { increment: 1 } },
      });
      if (video.count === 0) throw new HttpError(404, "Video not found");
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.post("/videos/upload/init", uploadLimiter, requireAuth, async (req, res, next) => {
    try {
      const body = initUploadSchema.parse(req.body);
      if (!ALLOWED_MIME.has(body.mimeType)) {
        throw new HttpError(400, "Unsupported media type");
      }
      const video = await prisma.video.create({
        data: {
          ownerId: req.user!.id,
          title: body.title.trim(),
          description: body.description.trim(),
          status: VideoStatus.PENDING_UPLOAD,
          s3Key: `pending-${randomUUID()}`,
          contentType: body.mimeType,
          visibility: body.visibility,
          category: body.category,
        },
      });
      const s3Key = `${req.user!.id}/${video.id}`;
      await prisma.video.update({
        where: { id: video.id },
        data: { s3Key },
      });
      const uploadUrl = await presignPutObject(s3, env, s3Key, body.mimeType);
      res.status(201).json({
        videoId: video.id,
        uploadUrl,
        s3Key,
        headers: { "Content-Type": body.mimeType },
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/videos/upload/complete", requireAuth, async (req, res, next) => {
    try {
      const body = completeUploadSchema.parse(req.body);
      const video = await prisma.video.findFirst({
        where: { id: body.videoId, ownerId: req.user!.id },
      });
      if (!video) throw new HttpError(404, "Video not found");
      if (video.status !== VideoStatus.PENDING_UPLOAD) {
        throw new HttpError(400, "Upload already finalized");
      }
      const playbackUrl = buildPlaybackUrl(env, video.s3Key);
      const updated = await prisma.video.update({
        where: { id: video.id },
        data: {
          status: VideoStatus.READY,
          playbackUrl,
          publishedAt: new Date(),
        },
        include: {
          owner: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
      res.json({
        video: {
          id: updated.id,
          title: updated.title,
          description: updated.description,
          category: updated.category,
          playbackUrl: updated.playbackUrl,
          viewCount: updated.viewCount,
          createdAt: updated.createdAt,
          owner: updated.owner,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/users/:userId/videos", async (req, res, next) => {
    try {
      const userId = routeParamString(req.params.userId, "userId");
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
      const viewerId = req.user?.id;
      const isSelf = viewerId === userId;
      const take = 12;
      const items = await prisma.video.findMany({
        where: {
          ownerId: userId,
          status: VideoStatus.READY,
          ...(isSelf
            ? {}
            : { visibility: { in: [VideoVisibility.PUBLIC, VideoVisibility.UNLISTED] } }),
        },
        orderBy: { createdAt: "desc" },
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          owner: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
      let nextCursor: string | undefined;
      const page = items;
      if (page.length > take) {
        const last = page.pop()!;
        nextCursor = last.id;
      }
      res.json({
        videos: page.map((v) => ({
          id: v.id,
          title: v.title,
          description: v.description,
          category: v.category,
          playbackUrl: v.playbackUrl,
          viewCount: v.viewCount,
          createdAt: v.createdAt,
          owner: v.owner,
        })),
        nextCursor,
      });
    } catch (e) {
      next(e);
    }
  });

  const patchVideoSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    visibility: z.nativeEnum(VideoVisibility).optional(),
    category: z.nativeEnum(VideoCategory).optional(),
  });

  router.patch("/videos/:id", requireAuth, async (req, res, next) => {
    try {
      const id = routeParamString(req.params.id, "videoId");
      const body = patchVideoSchema.parse(req.body);
      if (Object.keys(body).length === 0) {
        throw new HttpError(400, "No fields to update");
      }
      const existing = await prisma.video.findFirst({
        where: { id, ownerId: req.user!.id },
      });
      if (!existing) throw new HttpError(404, "Video not found");
      const updated = await prisma.video.update({
        where: { id },
        data: {
          ...(body.title !== undefined ? { title: body.title.trim() } : {}),
          ...(body.description !== undefined ? { description: body.description.trim() } : {}),
          ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
        },
        include: {
          owner: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      });
      res.json({
        video: {
          id: updated.id,
          title: updated.title,
          description: updated.description,
          category: updated.category,
          playbackUrl: updated.playbackUrl,
          viewCount: updated.viewCount,
          visibility: updated.visibility,
          status: updated.status,
          createdAt: updated.createdAt,
          owner: updated.owner,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  router.delete("/videos/:id", requireAuth, async (req, res, next) => {
    try {
      const id = routeParamString(req.params.id, "videoId");
      const result = await prisma.video.deleteMany({
        where: { id, ownerId: req.user!.id },
      });
      if (result.count === 0) throw new HttpError(404, "Video not found");
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  return router;
}
