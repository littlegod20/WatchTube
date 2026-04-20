import { createServer } from "node:http";
import { Server } from "socket.io";
import { getEnv } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createApp } from "./app.js";
import { setupSocketIo } from "./socket/setup.js";

const env = getEnv();
const logger = createLogger(env);

const io = new Server({
  cors: {
    origin: env.CLIENT_ORIGIN,
    credentials: true,
  },
});

const { app } = createApp(env, logger, io);
const httpServer = createServer(app);
io.attach(httpServer);

setupSocketIo(io, logger);

const port = env.PORT;
httpServer.listen(port, () => {
  logger.info(`Server listening on ${env.VITE_API_BASE_URL}`, { port });
});
