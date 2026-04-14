import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { VideoThumbnail } from "@/components/VideoThumbnail";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import type { ChannelProfile, VideoSummary } from "@/types/api";

export function ChannelPage() {
  const { userId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["channel", userId],
    enabled: Boolean(userId),
    queryFn: () => apiFetch<{ user: ChannelProfile }>(`/api/users/${userId}`),
  });

  const videosQuery = useInfiniteQuery({
    queryKey: ["channelVideos", userId],
    enabled: Boolean(userId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam);
      const qs = params.toString();
      return apiFetch<{ videos: VideoSummary[]; nextCursor?: string }>(
        `/api/users/${userId}/videos${qs ? `?${qs}` : ""}`
      );
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const subQuery = useQuery({
    queryKey: ["subMe", userId],
    enabled: Boolean(userId && user && user.id !== userId),
    queryFn: () =>
      apiFetch<{ subscribed: boolean }>(`/api/users/${userId}/subscription/me`),
  });

  const toggleSub = useMutation({
    mutationFn: () =>
      apiFetch<{ subscribed: boolean; subscriberCount: number }>(
        `/api/users/${userId}/subscription/toggle`,
        { method: "POST", body: "{}" }
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(["subMe", userId], { subscribed: data.subscribed });
      queryClient.setQueryData(["channel", userId], (old: { user: ChannelProfile } | undefined) =>
        old
          ? {
              user: { ...old.user, subscriberCount: data.subscriberCount },
            }
          : old
      );
    },
  });

  const ch = profileQuery.data?.user;
  const videos = videosQuery.data?.pages.flatMap((p) => p.videos) ?? [];
  const subscribed = subQuery.data?.subscribed ?? false;

  if (profileQuery.isPending) {
    return <div className="text-zinc-400">Loading channel…</div>;
  }
  if (profileQuery.error || !ch) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-red-200">
        {(profileQuery.error as Error)?.message ?? "Channel not found"}
      </div>
    );
  }

  const isSelf = user?.id === ch.id;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{ch.displayName}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {ch.subscriberCount.toLocaleString()} subscribers · {ch.videoCount.toLocaleString()}{" "}
            videos
          </p>
        </div>
        {user && !isSelf && (
          <button
            type="button"
            onClick={() => toggleSub.mutate()}
            disabled={toggleSub.isPending}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
              subscribed
                ? "border border-zinc-600 bg-zinc-800 text-white hover:bg-zinc-700"
                : "bg-white text-zinc-900 hover:bg-zinc-200"
            }`}
          >
            {subscribed ? "Subscribed" : "Subscribe"}
          </button>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white">Videos</h2>
        {videosQuery.error && (
          <p className="mt-2 text-sm text-red-300">{(videosQuery.error as Error).message}</p>
        )}
        {videosQuery.isPending && videos.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">Loading videos…</p>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {videos.map((v) => (
                <Link
                  key={v.id}
                  to={`/watch/${v.id}`}
                  className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/60 hover:border-zinc-600"
                >
                  <div className="aspect-video bg-zinc-800">
                    {v.playbackUrl ? (
                      <VideoThumbnail src={v.playbackUrl} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-white line-clamp-2">{v.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">{v.viewCount.toLocaleString()} views</p>
                  </div>
                </Link>
              ))}
              {videos.length === 0 && (
                <p className="text-sm text-zinc-500">No public videos on this channel.</p>
              )}
            </div>
            {videosQuery.hasNextPage && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => void videosQuery.fetchNextPage()}
                  disabled={videosQuery.isFetchingNextPage}
                  className="rounded-md border border-zinc-600 bg-zinc-900 px-6 py-2.5 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {videosQuery.isFetchingNextPage ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
