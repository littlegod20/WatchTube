import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { routeParamString } from "../lib/routeParams.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { HttpError } from "../middleware/errorHandler.js";
import type { Server as SocketServer } from "socket.io";

export function createSubscriptionsRouter(io: SocketServer) {
  const subscriptionsRouter = Router();

subscriptionsRouter.get("/users/:channelId/subscription/me", requireAuth, async (req, res, next) => {
  try {
    const channelId = routeParamString(req.params.channelId, "channelId");
    const sub = await prisma.subscription.findUnique({
      where: {
        subscriberId_channelId: { subscriberId: req.user!.id, channelId },
      },
    });
    res.json({ subscribed: Boolean(sub) });
  } catch (e) {
    next(e);
  }
});

subscriptionsRouter.post("/users/:channelId/subscription/toggle", requireAuth, async (req, res, next) => {
  try {
    const channelId = routeParamString(req.params.channelId, "channelId");
    if (channelId === req.user!.id) throw new HttpError(400, "Cannot subscribe to yourself");
    const channel = await prisma.user.findUnique({ where: { id: channelId } });
    if (!channel) throw new HttpError(404, "Channel not found");
    const existing = await prisma.subscription.findUnique({
      where: {
        subscriberId_channelId: { subscriberId: req.user!.id, channelId },
      },
    });
    if (existing) {
      await prisma.subscription.delete({
        where: {
          subscriberId_channelId: { subscriberId: req.user!.id, channelId },
        },
      });
    } else {
      await prisma.subscription.create({
        data: { subscriberId: req.user!.id, channelId },
      });
    }
    const subscriberCount = await prisma.subscription.count({ where: { channelId } });
    io.to(`channel:${channelId}`).emit("subscription:updated", {
      channelId,
      subscriberCount,
      userId: req.user!.id,
      subscribed: !existing,
    });
    res.json({
      subscribed: !existing,
      subscriberCount,
    });
  } catch (e) {
    next(e);
  }
});

  return subscriptionsRouter;
}
