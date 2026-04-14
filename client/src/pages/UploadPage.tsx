import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";

const ALLOWED = new Set(["video/mp4", "video/webm", "video/quicktime"]);

export function UploadPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose a video file.");
      return;
    }
    if (!ALLOWED.has(file.type)) {
      setError("Use MP4, WebM, or MOV (video/quicktime).");
      return;
    }
    setProgress("Preparing upload…");
    try {
      const init = await apiFetch<{
        videoId: string;
        uploadUrl: string;
        headers: { "Content-Type": string };
      }>("/api/videos/upload/init", {
        method: "POST",
        body: JSON.stringify({
          title,
          description,
          mimeType: file.type,
          sizeBytes: file.size,
          visibility: "PUBLIC",
        }),
      });

      setProgress("Uploading to storage…");
      const putRes = await fetch(init.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": init.headers["Content-Type"],
        },
        body: file,
      });
      if (!putRes.ok) {
        const detail = (await putRes.text()).slice(0, 300);
        const hint =
          putRes.status === 403
            ? " Check bucket policy / credentials."
            : putRes.status === 0
              ? " Network or CORS blocked the browser PUT—ensure MinIO bucket CORS allows your UI origin (see .env.example)."
              : "";
        throw new Error(
          `Storage PUT failed (${putRes.status} ${putRes.statusText}).${hint}${detail ? ` ${detail}` : ""}`
        );
      }

      setProgress("Finalizing…");
      await apiFetch("/api/videos/upload/complete", {
        method: "POST",
        body: JSON.stringify({ videoId: init.videoId }),
      });
      navigate(`/watch/${init.videoId}`);
    } catch (err) {
      setProgress(null);
      setError((err as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-zinc-800 bg-zinc-900/60 p-8">
      <h1 className="text-2xl font-bold text-white">Upload video</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Files go directly to your S3-compatible bucket via a presigned URL.
      </p>
      <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm text-zinc-400" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-red-500"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400" htmlFor="desc">
            Description
          </label>
          <textarea
            id="desc"
            rows={4}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none focus:border-red-500"
          />
        </div>
        <div>
          <label className="block text-sm text-zinc-400" htmlFor="file">
            Video file
          </label>
          <input
            id="file"
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full text-sm text-zinc-300 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-white"
          />
        </div>
        {progress && <p className="text-sm text-zinc-300">{progress}</p>}
        {error && (
          <div className="rounded-md border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
        <button
          type="submit"
          className="w-full rounded-md bg-brand py-2.5 font-medium text-white hover:bg-brand-dark"
        >
          Upload
        </button>
      </form>
    </div>
  );
}
