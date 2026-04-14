import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import bcrypt from "bcrypt";
import {
  PrismaClient,
  VideoCategory,
  VideoStatus,
  VideoVisibility,
} from "@prisma/client";
import { getEnv } from "../src/config/env.js";
import { buildPlaybackUrl, createS3Client } from "../src/services/s3.js";

const prisma = new PrismaClient();

const SEED_USER_EMAIL = "curator@seed.watchtube.local";

/**
 * Each row downloads a different public MP4 and uploads it to R2 so titles, thumbnails, and playback
 * are not all the same clip. `sourceUrl` is chosen for stable hosting; mapping to the title is illustrative.
 */
const seedVideos: Array<{
  title: string;
  description: string;
  category: VideoCategory;
  viewCount: number;
  sourceUrl: string;
}> = [
  {
    title: "Lo-fi beats for studying",
    description: "Instrumental focus session.",
    category: VideoCategory.MUSIC,
    viewCount: 12040,
    sourceUrl:
      "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
  },
  {
    title: "Speedrun highlights",
    description: "Best moments from last week's tournament.",
    category: VideoCategory.GAMING,
    viewCount: 8932,
    sourceUrl: "https://download.samplelib.com/mp4/sample-5s.mp4",
  },
  {
    title: "Intro to databases",
    description: "Tables, keys, and why normalization matters.",
    category: VideoCategory.EDUCATION,
    viewCount: 5621,
    sourceUrl:
      "https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-mp4-file.mp4",
  },
  {
    title: "Sketch comedy: coffee shop",
    description: "A very patient barista.",
    category: VideoCategory.ENTERTAINMENT,
    viewCount: 22100,
    sourceUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
  },
  {
    title: "Morning headlines",
    description: "What moved markets overnight.",
    category: VideoCategory.NEWS,
    viewCount: 3102,
    sourceUrl: "https://download.samplelib.com/mp4/sample-10s.mp4",
  },
  {
    title: "Training drills for beginners",
    description: "Warm-up, form, and cooldown.",
    category: VideoCategory.SPORTS,
    viewCount: 4450,
    sourceUrl: "https://download.samplelib.com/mp4/sample-15s.mp4",
  },
  {
    title: "Rust vs Go in 12 minutes",
    description: "Trade-offs, not flame wars.",
    category: VideoCategory.TECH,
    viewCount: 17890,
    sourceUrl: "https://download.samplelib.com/mp4/sample-20s.mp4",
  },
  {
    title: "Weekend kitchen reset",
    description: "Prep, storage, and a calmer Monday.",
    category: VideoCategory.LIFESTYLE,
    viewCount: 6700,
    sourceUrl: "https://filesamples.com/samples/video/mp4/sample_640x360.mp4",
  },
  {
    title: "Synthwave drive mix",
    description: "Neon roads, steady tempo.",
    category: VideoCategory.MUSIC,
    viewCount: 9901,
    sourceUrl: "https://filesamples.com/samples/video/mp4/sample_960x540.mp4",
  },
  {
    title: "Boss fight strategy guide",
    description: "Phase-by-phase breakdown.",
    category: VideoCategory.GAMING,
    viewCount: 15400,
    sourceUrl: "https://filesamples.com/samples/video/mp4/sample_1280x720.mp4",
  },
  {
    title: "How Wi-Fi actually works",
    description: "Frames, channels, and interference.",
    category: VideoCategory.TECH,
    viewCount: 8233,
    sourceUrl: "https://filesamples.com/samples/video/mp4/sample_1920x1080.mp4",
  },
  {
    title: "Community spotlight",
    description: "Shout-outs and upcoming events.",
    category: VideoCategory.OTHER,
    viewCount: 888,
    sourceUrl: "https://download.samplelib.com/mp4/sample-30s.mp4",
  },
];

async function fetchVideoBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to download seed video (${res.status}): ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const env = getEnv();
  const s3 = createS3Client(env);

  await prisma.user.deleteMany({ where: { email: SEED_USER_EMAIL } });

  const passwordHash = await bcrypt.hash("seedpassword123", 12);
  const owner = await prisma.user.create({
    data: {
      email: SEED_USER_EMAIL,
      passwordHash,
      displayName: "Seed Curator",
    },
  });

  const now = new Date();
  let n = 0;
  for (const v of seedVideos) {
    const id = randomUUID();
    const s3Key = `seed/${owner.id}/${id}/video.mp4`;

    console.log(`[${n + 1}/${seedVideos.length}] Downloading: ${v.title}`);
    const bytes = await fetchVideoBytes(v.sourceUrl);

    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: s3Key,
        Body: bytes,
        ContentType: "video/mp4",
      })
    );

    const playbackUrl = buildPlaybackUrl(env, s3Key);
    await prisma.video.create({
      data: {
        id,
        ownerId: owner.id,
        title: v.title,
        description: v.description,
        status: VideoStatus.READY,
        s3Key,
        contentType: "video/mp4",
        playbackUrl,
        durationSeconds: null,
        visibility: VideoVisibility.PUBLIC,
        category: v.category,
        viewCount: v.viewCount,
        publishedAt: now,
      },
    });
    n += 1;
    console.log(`Uploaded: ${v.title}`);
  }

  console.log(`Seeded ${seedVideos.length} videos for ${SEED_USER_EMAIL} (R2 bucket: ${env.S3_BUCKET})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
