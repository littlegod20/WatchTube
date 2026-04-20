# WatchTube

YouTube-style demo monorepo: **React + Vite + TypeScript + Tailwind** (`client/`), **Express + TypeScript** (`server/`), **PostgreSQL**, **Passport** (local sessions), **S3-compatible presigned uploads** (AWS S3 / Cloudflare R2 / MinIO), **Socket.io** (comment broadcasts), **Winston** logging.

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- Docker (optional, for local Postgres + MinIO; object storage can be Cloudflare R2 or AWS S3 instead—see `.env.example`)

## Quick start (Docker deps)

1. Copy environment file and adjust secrets for anything beyond local dev:

   ```bash
   cp .env.example .env
   ```

2. Start Postgres and MinIO:

   ```bash
   docker compose up -d
   ```

   MinIO API: port **9000** (S3), console: **9001**. The `minio-init` service creates bucket **`watchtube-videos`** and sets CORS for common Vite dev origins. If you use another UI port, update `AllowedOrigins` in [`docker-compose.yml`](docker-compose.yml) and run `docker compose up -d minio-init` again. Copy [`.env.example`](.env.example) **Storage** block into `.env` so `S3_*` and `CDN_PUBLIC_BASE_URL` match that bucket.

3. Install dependencies and apply database migrations (creates `User`, `Video`, session store table, etc.):

   ```bash
   pnpm install
   pnpm db:generate
   pnpm db:migrate
   ```

   Keep `.env` at the **repo root** (same level as `docker-compose.yml`). Prisma CLI loads it via `dotenv-cli` for migrate commands.

   If registration returns **“The table `public.User` does not exist”**, Postgres is reachable but migrations were not applied—run `pnpm db:migrate` again with Docker Postgres running.

   For a new migration during development, from `server/`: `pnpm db:migrate:dev`.

4. Run API + web app together:

   ```bash
   pnpm dev
   ```

- Web UI: [http://localhost:5173](http://localhost:5173) (Vite proxies `/api` and `/socket.io` to the API). If Vite picks another port (e.g. `5174`), set `CLIENT_ORIGIN` in `.env` to that exact origin and restart the server.

### `POST /api/register` (or any `/api/*`) returns 404 from the Vite port

That response is almost always from **Vite**, not Express: the dev/preview server has no route file at `/api/register`, so unless the **proxy** forwards the request to Express, you get **404**.

1. **Run the API** on port 3000 (e.g. `pnpm dev` from the repo root, or `pnpm --filter server dev`). Check `http://localhost:3000/api/health`.
2. Use **`pnpm dev`** or **`vite`** for the UI (not a static file server). The config proxies `/api` → `http://localhost:3000` (override with `VITE_DEV_API_PROXY` in `.env` if needed).
3. If you use **`vite preview`**, the API must still be running; this repo configures `preview.proxy` the same as dev.
4. If the UI is on **`http://localhost:5174`**, set `CLIENT_ORIGIN=http://localhost:5174` in `.env` and restart the **server** (CORS + session cookie `SameSite` behavior).
- API: [http://localhost:3000](http://localhost:3000) (see `VITE_API_BASE_URL` in `.env`).
- MinIO console: [http://localhost:9001](http://localhost:9001) (default `minioadmin` / `minioadmin`).

## Scripts

| Command | Description |
|--------|-------------|
| `pnpm dev` | Run `server` and `client` in watch mode |
| `pnpm build` | Build `packages/shared`, `server`, `client` |
| `pnpm lint` | ESLint in all packages |
| `pnpm test` | Server Vitest + Supertest smoke tests |
| `pnpm db:migrate` | `prisma migrate deploy` (server) |
| `pnpm db:generate` | `prisma generate` (server) |

## Architecture

- **Auth**: `express-session` + `connect-pg-simple` (sessions in Postgres), Passport local strategy, bcrypt password hashes. `GET /api/me` returns the session user; register/login set the session cookie. The Vite dev server proxies `/api` so the browser stays same-origin for cookies.
- **Uploads**: `POST /api/videos/upload/init` creates a `Video` row and returns a presigned `PUT` URL; the browser uploads bytes directly to S3/MinIO; `POST /api/videos/upload/complete` marks the video ready and sets `playbackUrl` from `CDN_PUBLIC_BASE_URL` + object key.
- **Feeds (pagination)**: `GET /api/videos` and `GET /api/users/:userId/videos` return **12** items per request. Pass **`?cursor=<videoId>`** (the previous page’s last item id) for the next page; the response includes **`nextCursor`** when more results exist. **Optional `?q=`** on the global feed searches title/description. The home and channel UIs load more via “Load more”.
- **Realtime**: Socket.io `join` / `leave` with a `videoId`; after `POST` creates a comment, the server emits `comment:created` to room `video:{id}`.
- **Logging**: Winston (JSON-friendly in production, readable in development); HTTP lines via Morgan into the logger.

## Environment variables

See [.env.example](.env.example). Important fields:

- `DATABASE_URL`, `SESSION_SECRET`
- `CLIENT_ORIGIN`, `VITE_API_BASE_URL` (CORS + API base URL)
- `S3_*` and `CDN_PUBLIC_BASE_URL` for storage and playback URLs (configure **bucket CORS** for browser `PUT` + `GET` when not using local MinIO)

## Deploying the client on Vercel

1. In Vercel, set the project **Root Directory** to `client` (or ensure `client/vercel.mjs` is the deployment root).
2. Add **`PUBLIC_API_ORIGIN`** in Vercel → Environment Variables (Production and Preview): your public Railway API URL with **no** trailing slash, e.g. `https://your-service.up.railway.app`.
3. On **Railway**, set **`CLIENT_ORIGIN`** to your Vercel site origin (e.g. `https://watch-tube-client.vercel.app`) so CORS and session cookies match the browser.

[`client/vercel.mjs`](client/vercel.mjs) rewrites `/api/*` and `/socket.io/*` to that origin, then falls back to `/index.html` for the SPA.

## Phase 2 (not in this repo scope)

- **Google OAuth**: `User.googleId` is reserved; add `passport-google-oauth20` and link accounts like local login.
- **Transcoding / HLS**: progressive MP4/WebM from CDN is the v1 path; add a worker queue (e.g. BullMQ + Redis) and ffmpeg for adaptive streaming later.

## Tests

Server tests use Vitest with default env fallbacks in `server/src/test/setup.ts` (override with a real `.env` when needed). Run `pnpm test` from the repo root.
