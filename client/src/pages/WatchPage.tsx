import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/auth/AuthContext";
import type { CommentItem, VideoSummary } from "@/types/api";

type VideoDetail = VideoSummary & {
  visibility: string;
  status: string;
};

export function WatchPage() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const viewedRef = useRef(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState("PUBLIC");
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  const videoQuery = useQuery({
    queryKey: ["video", videoId],
    enabled: Boolean(videoId),
    queryFn: () => apiFetch<{ video: VideoDetail }>(`/api/videos/${videoId}`),
  });

  const playbackUrl = videoQuery.data?.video.playbackUrl;
  useEffect(() => {
    setPlaybackError(null);
  }, [videoId, playbackUrl]);

  const commentsQuery = useQuery({
    queryKey: ["comments", videoId],
    enabled: Boolean(videoId),
    queryFn: () =>
      apiFetch<{ comments: CommentItem[] }>(`/api/videos/${videoId}/comments`),
  });

  const likeMeQuery = useQuery({
    queryKey: ["likeMe", videoId],
    enabled: Boolean(videoId && user),
    queryFn: () => apiFetch<{ liked: boolean }>(`/api/videos/${videoId}/likes/me`),
  });

  const likeCountQuery = useQuery({
    queryKey: ["likeCount", videoId],
    enabled: Boolean(videoId),
    queryFn: () => apiFetch<{ count: number }>(`/api/videos/${videoId}/likes/count`),
  });

  useEffect(() => {
    if (!videoId || !videoQuery.data?.video.playbackUrl || viewedRef.current) return;
    viewedRef.current = true;
    void apiFetch(`/api/videos/${videoId}/view`, { method: "POST", body: "{}" }).catch(() => {
      viewedRef.current = false;
    });
    void queryClient.invalidateQueries({ queryKey: ["video", videoId] });
  }, [videoId, videoQuery.data, queryClient]);

  useEffect(() => {
    if (!videoId) return;
    const s = io(
      import.meta.env.VITE_API_BASE_URL,
      {
      path: "/socket.io",
      withCredentials: true,
    });
    s.emit("join", videoId);
    setSocket(s);
    return () => {
      s.emit("leave", videoId);
      s.close();
      setSocket(null);
    };
  }, [videoId]);

  useEffect(() => {
    if (!socket || !videoId) return;
    const onCreated = (payload: CommentItem & { videoId?: string }) => {
      if (payload.videoId && payload.videoId !== videoId) return;
      const entry: CommentItem = {
        id: payload.id,
        body: payload.body,
        createdAt: payload.createdAt,
        user: payload.user,
      };
      queryClient.setQueryData<{ comments: CommentItem[] }>(
        ["comments", videoId],
        (prev) => {
          const list = prev?.comments ?? [];
          if (list.some((c) => c.id === entry.id)) return prev ?? { comments: list };
          return { comments: [...list, entry] };
        }
      );
    };
    const onDeleted = (payload: { id: string; videoId: string }) => {
      if (payload.videoId !== videoId) return;
      queryClient.setQueryData<{ comments: CommentItem[] }>(
        ["comments", videoId],
        (prev) => ({
          comments: (prev?.comments ?? []).filter((c) => c.id !== payload.id),
        })
      );
    };
    socket.on("comment:created", onCreated);
    socket.on("comment:deleted", onDeleted);
    return () => {
      socket.off("comment:created", onCreated);
      socket.off("comment:deleted", onDeleted);
    };
  }, [socket, videoId, queryClient]);

  const postComment = useMutation({
    mutationFn: async () => {
      if (!videoId) throw new Error("Missing video");
      return apiFetch<{ comment: CommentItem }>(`/api/videos/${videoId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body: commentBody }),
      });
    },
    onSuccess: () => {
      setCommentBody("");
      void queryClient.invalidateQueries({ queryKey: ["comments", videoId] });
    },
  });

  const toggleLike = useMutation({
    mutationFn: () =>
      apiFetch<{ liked: boolean; count: number }>(`/api/videos/${videoId}/likes/toggle`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["likeMe", videoId], { liked: data.liked });
      queryClient.setQueryData(["likeCount", videoId], { count: data.count });
    },
  });

  const deleteComment = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/comments/${id}`, { method: "DELETE", body: "{}" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["comments", videoId] });
    },
  });

  const patchVideo = useMutation({
    mutationFn: () => {
      if (!videoId) throw new Error("Missing video");
      return apiFetch<{ video: VideoDetail }>(`/api/videos/${videoId}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription,
          visibility: editVisibility,
        }),
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["video", videoId], data);
    },
  });

  const deleteVideo = useMutation({
    mutationFn: () => {
      if (!videoId) throw new Error("Missing video");
      return apiFetch(`/api/videos/${videoId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
      navigate("/");
    },
  });

  const video = videoQuery.data?.video;
  const comments = commentsQuery.data?.comments ?? [];
  const liked = likeMeQuery.data?.liked ?? false;
  const likeCount = likeCountQuery.data?.count ?? 0;

  const ownerActions = useMemo(() => {
    if (!user || !video) return false;
    return user.id === video.owner.id;
  }, [user, video]);

  useEffect(() => {
    if (!video) return;
    setEditTitle(video.title);
    setEditDescription(video.description);
    setEditVisibility(video.visibility);
  }, [video?.id, video?.title, video?.description, video?.visibility]);

  if (videoQuery.isPending) {
    return <div className="text-zinc-400">Loading video…</div>;
  }
  if (videoQuery.error || !video) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-red-200">
        {(videoQuery.error as Error)?.message ?? "Video not found"}
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <div className="space-y-2">
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black aspect-video">
            {video.playbackUrl ? (
              <video
                key={video.playbackUrl}
                className="h-full w-full"
                src={video.playbackUrl}
                controls
                playsInline
                preload="auto"
                onError={(e) => {
                  const code = e.currentTarget.error?.code;
                  const msg =
                    code === MediaError.MEDIA_ERR_NETWORK
                      ? "Network error loading the video. If you use MinIO locally, re-apply bucket CORS (docker-compose minio-init) so GET/Range from your dev origin is allowed."
                      : code === MediaError.MEDIA_ERR_DECODE
                        ? "Decode error — try H.264/AAC in an MP4 or WebM container."
                        : code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
                          ? "This URL is not playable (unsupported format or 403/404 from storage)."
                          : "Playback failed.";
                  setPlaybackError(msg);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-500">
                Processing or unavailable
              </div>
            )}
          </div>
          {playbackError && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {playbackError}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{video.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-zinc-400">
            <Link to={`/channel/${video.owner.id}`} className="hover:text-white">
              {video.owner.displayName}
            </Link>
            <span>{video.viewCount.toLocaleString()} views</span>
            {user && (
              <button
                type="button"
                onClick={() => toggleLike.mutate()}
                disabled={toggleLike.isPending}
                className={`rounded-full border px-4 py-1 font-medium transition ${
                  liked
                    ? "border-red-500 bg-red-950/40 text-red-200"
                    : "border-zinc-600 text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {liked ? "Liked" : "Like"} · {likeCount}
              </button>
            )}
            {!user && <span>{likeCount} likes</span>}
          </div>
          <p className="mt-4 whitespace-pre-wrap text-zinc-300">{video.description}</p>
          {ownerActions && (
            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="text-sm font-semibold text-white">Edit video</h2>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs text-zinc-500" htmlFor="edit-title">
                    Title
                  </label>
                  <input
                    id="edit-title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500" htmlFor="edit-desc">
                    Description
                  </label>
                  <textarea
                    id="edit-desc"
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500" htmlFor="edit-vis">
                    Visibility
                  </label>
                  <select
                    id="edit-vis"
                    value={editVisibility}
                    onChange={(e) => setEditVisibility(e.target.value)}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-red-500"
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="UNLISTED">Unlisted</option>
                    <option value="PRIVATE">Private</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => patchVideo.mutate()}
                    disabled={patchVideo.isPending}
                    className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                  >
                    {patchVideo.isPending ? "Saving…" : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this video permanently? This cannot be undone."
                        )
                      ) {
                        deleteVideo.mutate();
                      }
                    }}
                    disabled={deleteVideo.isPending}
                    className="rounded-md border border-red-800 px-4 py-2 text-sm text-red-300 hover:bg-red-950/50 disabled:opacity-50"
                  >
                    {deleteVideo.isPending ? "Deleting…" : "Delete video"}
                  </button>
                </div>
                <p className="text-xs text-zinc-500">Status: {video.status}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="font-semibold text-white">Comments</h2>
          {user ? (
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!commentBody.trim()) return;
                postComment.mutate();
              }}
            >
              <textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Add a public comment…"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white outline-none focus:border-red-500"
              />
              <button
                type="submit"
                disabled={postComment.isPending}
                className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
              >
                {postComment.isPending ? "Posting…" : "Comment"}
              </button>
            </form>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">
              <Link to="/login" className="text-red-400 hover:underline">
                Sign in
              </Link>{" "}
              to comment.
            </p>
          )}
        </div>
        <ul className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-200">{c.user.displayName}</span>
                {user?.id === c.user.id && (
                  <button
                    type="button"
                    onClick={() => deleteComment.mutate(c.id)}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-1 text-zinc-300">{c.body}</p>
              <p className="mt-1 text-xs text-zinc-600">
                {new Date(c.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
          {comments.length === 0 && (
            <li className="text-sm text-zinc-500">No comments yet.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
