import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/** Backend for dev + preview proxies (browser calls same origin: /api → proxied here). */
const defaultApi = "http://localhost:3000";

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const clientEnv = loadEnv(mode, __dirname, "");
  const apiTarget =
    clientEnv.VITE_DEV_API_PROXY || rootEnv.VITE_DEV_API_PROXY || defaultApi;

  const apiProxy = {
    target: apiTarget,
    changeOrigin: true,
  };

  const socketProxy = {
    target: apiTarget,
    changeOrigin: true,
    ws: true,
  };

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        "/api": apiProxy,
        "/socket.io": socketProxy,
      },
    },
    // `vite preview` does NOT inherit `server.proxy` — without this, /api/* returns 404.
    preview: {
      port: 4173,
      strictPort: false,
      proxy: {
        "/api": apiProxy,
        "/socket.io": socketProxy,
      },
    },
  };
});
