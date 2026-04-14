-- CreateEnum
CREATE TYPE "VideoCategory" AS ENUM (
  'MUSIC',
  'GAMING',
  'EDUCATION',
  'ENTERTAINMENT',
  'NEWS',
  'SPORTS',
  'TECH',
  'LIFESTYLE',
  'OTHER'
);

-- AlterTable
ALTER TABLE "Video" ADD COLUMN "category" "VideoCategory" NOT NULL DEFAULT 'OTHER';
