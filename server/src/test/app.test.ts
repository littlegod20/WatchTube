import { describe, it, expect, afterAll } from "vitest";
import { createServer } from "node:http";
import { Server } from "socket.io";
import request from "supertest";
import { getEnv } from "../config/env.js";
import { createLogger } from "../lib/logger.js";
import { createApp } from "../app.js";

describe("HTTP API", () => {
  const httpServer = createServer();
  const io = new Server(httpServer);
  const env = getEnv();
  const logger = createLogger(env);
  const { app } = createApp(env, logger, io);

  afterAll(() => {
    io.close();
  });

  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /api/me returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("GET /api/unknown-route returns 404", async () => {
    const res = await request(app).get("/api/this-route-should-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: expect.stringMatching(/Not found: GET \/api\//) });
  });

  it("POST /api/register is routed (not 404)", async () => {
    const res = await request(app)
      .post("/api/register")
      .send({ email: `e${Date.now()}@example.com`, password: "password123", displayName: "Test" });
    expect(res.status).not.toBe(404);
    expect([200, 201, 400, 409, 500]).toContain(res.status);
  });
});
