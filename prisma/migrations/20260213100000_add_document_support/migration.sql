-- AlterEnum: Add DOCUMENT to MediaAssetType
ALTER TYPE "MediaAssetType" ADD VALUE 'DOCUMENT';

-- AlterEnum: Add VERCEL_BLOB to MediaProvider
ALTER TYPE "MediaProvider" ADD VALUE 'VERCEL_BLOB';

-- AlterTable: Add blobUrl and extractedText to MediaAsset
ALTER TABLE "MediaAsset" ADD COLUMN "blobUrl" TEXT;
ALTER TABLE "MediaAsset" ADD COLUMN "extractedText" TEXT;
