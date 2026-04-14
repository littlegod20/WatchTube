import bcrypt from "bcrypt";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import passport from "passport";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { routeParamString } from "../lib/routeParams.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { HttpError } from "../middleware/errorHandler.js";

const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64),
});

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

authRouter.post("/register", authLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new HttpError(409, "Email already registered");
    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: body.displayName.trim(),
      },
      select: { id: true, email: true, displayName: true, avatarUrl: true },
    });
    await new Promise<void>((resolve, reject) => {
      req.login(user, (err) => (err ? reject(err) : resolve()));
    });
    res.status(201).json({ user });
  } catch (e) {
    next(e);
  }
});

authRouter.post("/login", authLimiter, (req, res, next) => {
  passport.authenticate("local", (err: unknown, user: Express.User | false, info: { message?: string }) => {
    if (err) return next(err);
    if (!user) return next(new HttpError(401, info?.message ?? "Invalid credentials"));
    req.login(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.json({ user });
    });
  })(req, res, next);
});

authRouter.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

authRouter.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  res.json({ user: req.user });
});

authRouter.get("/users/:id", async (req, res, next) => {
  try {
    const id = routeParamString(req.params.id, "userId");
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
        _count: { select: { subscribers: true, videos: true } },
      },
    });
    if (!user) throw new HttpError(404, "User not found");
    res.json({
      user: {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        subscriberCount: user._count.subscribers,
        videoCount: user._count.videos,
      },
    });
  } catch (e) {
    next(e);
  }
});

authRouter.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      displayName: z.string().min(1).max(64).optional(),
      avatarUrl: z.string().url().max(2048).nullable().optional(),
    });
    const body = schema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(body.displayName !== undefined ? { displayName: body.displayName.trim() } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      },
      select: { id: true, email: true, displayName: true, avatarUrl: true },
    });
    await new Promise<void>((resolve, reject) => {
      req.login(user, (err) => (err ? reject(err) : resolve()));
    });
    res.json({ user });
  } catch (e) {
    next(e);
  }
});
