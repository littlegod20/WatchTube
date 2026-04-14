/**
 * Vercel routing: proxy same-origin `/api` and `/socket.io` to the Railway API.
 * Set `PUBLIC_API_ORIGIN` in the Vercel project (Production + Preview) to your API base URL.
 * @see https://vercel.com/docs/project-configuration
 */

const raw = (process.env.PUBLIC_API_ORIGIN ?? process.env.SERVER_URL ?? "").trim();
const origin = raw.replace(/\/$/, "");

if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
  throw new Error(
    "Vercel: set PUBLIC_API_ORIGIN (or SERVER_URL) to your Railway API origin, e.g. https://your-service.up.railway.app — no trailing slash."
  );
}

export const config = {
  rewrites: [
    { source: "/api/:path*", destination: `${origin}/api/:path*` },
    // Engine.IO — list more specific pattern first
    { source: "/socket.io/(.*)", destination: `${origin}/socket.io/$1` },
    { source: "/socket.io", destination: `${origin}/socket.io` },
    { source: "/(.*)", destination: "/index.html" },
  ],
};
