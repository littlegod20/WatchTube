export type PublicUser = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type VideoCategory =
  | "MUSIC"
  | "GAMING"
  | "EDUCATION"
  | "ENTERTAINMENT"
  | "NEWS"
  | "SPORTS"
  | "TECH"
  | "LIFESTYLE"
  | "OTHER";

export type VideoSummary = {
  id: string;
  title: string;
  description: string;
  category: VideoCategory;
  playbackUrl: string | null;
  viewCount: number;
  createdAt: string;
  owner: PublicUser;
};

export type ChannelProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  subscriberCount: number;
  videoCount: number;
};

export type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  user: PublicUser;
  videoId?: string;
};
