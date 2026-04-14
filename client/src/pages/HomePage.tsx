import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { VideoThumbnail } from "@/components/VideoThumbnail";
import { apiFetch } from "@/lib/api";
import type { VideoSummary } from "@/types/api";

function buildVideosListUrl(q: string, cursor: string | undefined) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `/api/videos?${qs}` : "/api/videos";
}

export function HomePage() {
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");

  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ["videos", q],
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam }) =>
        apiFetch<{ videos: VideoSummary[]; nextCursor?: string }>(
          buildVideosListUrl(q, pageParam)
        ),
      getNextPageParam: (last) => last.nextCursor,
    });

  const videos = useMemo(() => data?.pages.flatMap((p) => p.videos) ?? [], [data?.pages]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(qInput);
  }

  function onClear() {
    setQInput("");
    setQ("");
  }

  if (isPending) {
    return (
      <div className="space-y-6">
        <SearchBar
          qInput={qInput}
          setQInput={setQInput}
          onSearch={onSearch}
          onClear={onClear}
        />
        <div className="text-zinc-400">Loading feed…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        <SearchBar
          qInput={qInput}
          setQInput={setQInput}
          onSearch={onSearch}
          onClear={onClear}
        />
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-red-200">
          {(error as Error).message}
        </div>
      </div>
    );
  }

  if (videos.length === 0 && !isPending) {
    return (
      <div className="space-y-6">
        <SearchBar
          qInput={qInput}
          setQInput={setQInput}
          onSearch={onSearch}
          onClear={onClear}
        />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-10 text-center text-zinc-400">
          {q.trim()
            ? `No videos match “${q.trim()}”.`
            : "No videos yet. Sign in and upload the first one."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SearchBar
        qInput={qInput}
        setQInput={setQInput}
        onSearch={onSearch}
        onClear={onClear}
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <Link
            key={v.id}
            to={`/watch/${v.id}`}
            className="group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60 shadow-lg transition hover:border-zinc-600"
          >
            <div className="aspect-video bg-zinc-800 relative">
              {v.playbackUrl ? (
                <VideoThumbnail
                  src={v.playbackUrl}
                  className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-zinc-500 text-sm">
                  No preview
                </div>
              )}
            </div>
            <div className="p-4">
              <h2 className="font-semibold text-white line-clamp-2 group-hover:text-red-100 transition">
                {v.title}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                {v.owner.displayName} · {v.viewCount.toLocaleString()} views
              </p>
            </div>
          </Link>
        ))}
      </div>
      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-md border border-zinc-600 bg-zinc-900 px-6 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}

function SearchBar({
  qInput,
  setQInput,
  onSearch,
  onClear,
}: {
  qInput: string;
  setQInput: (v: string) => void;
  onSearch: (e: React.FormEvent) => void;
  onClear: () => void;
}) {
  return (
    <form
      onSubmit={onSearch}
      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex w-full max-w-xl gap-2">
        <input
          type="search"
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder="Search titles and descriptions…"
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-red-500"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white"
        >
          Search
        </button>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Clear
        </button>
      </div>
    </form>
  );
}
