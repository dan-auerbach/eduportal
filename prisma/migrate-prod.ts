/**
 * Production migration script.
 *
 * Runs pending SQL migrations directly against the Neon database.
 * Uses @neondatabase/serverless Pool for direct SQL execution.
 *
 * Each migration is tracked in a `_applied_migrations` table.
 * Idempotent — safe to run on every deploy.
 */

import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

interface Migration {
  name: string;
  statements: string[];
}

// Register all migrations here. Each SQL statement runs separately.
const MIGRATIONS: Migration[] = [
  {
    name: "20260213100000_add_document_support",
    statements: [
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DOCUMENT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MediaAssetType')) THEN ALTER TYPE "MediaAssetType" ADD VALUE 'DOCUMENT'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'VERCEL_BLOB' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MediaProvider')) THEN ALTER TYPE "MediaProvider" ADD VALUE 'VERCEL_BLOB'; END IF; END $$;`,
      `ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "blobUrl" TEXT;`,
      `ALTER TABLE "MediaAsset" ADD COLUMN IF NOT EXISTS "extractedText" TEXT;`,
    ],
  },
  {
    name: "20260214120000_add_asset_cleanup_statuses",
    statements: [
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DELETE_PENDING' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MediaAssetStatus')) THEN ALTER TYPE "MediaAssetStatus" ADD VALUE 'DELETE_PENDING'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DELETE_FAILED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'MediaAssetStatus')) THEN ALTER TYPE "MediaAssetStatus" ADD VALUE 'DELETE_FAILED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MODULE_DELETED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'MODULE_DELETED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ASSET_BULK_DELETED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'ASSET_BULK_DELETED'; END IF; END $$;`,
    ],
  },
  {
    name: "20260219100000_gamification_suggestions_compliance",
    statements: [
      // ── New enums ──
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'XpSourceType') THEN CREATE TYPE "XpSourceType" AS ENUM ('MODULE_COMPLETED','QUIZ_HIGH_SCORE','MENTOR_CONFIRMATION','TOP_SUGGESTION','COMPLIANCE_RENEWAL','MANUAL'); END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReputationRank') THEN CREATE TYPE "ReputationRank" AS ENUM ('BRONZE','SILVER','GOLD','ELITE'); END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RedemptionStatus') THEN CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED'); END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SuggestionStatus') THEN CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN','APPROVED','REJECTED','CONVERTED'); END IF; END $$;`,

      // ── New AuditAction values ──
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'XP_AWARDED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'XP_AWARDED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'XP_DEDUCTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'XP_DEDUCTED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REWARD_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'REWARD_CREATED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REWARD_UPDATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'REWARD_UPDATED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REWARD_REDEEMED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'REWARD_REDEEMED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REWARD_APPROVED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'REWARD_APPROVED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REWARD_REJECTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'REWARD_REJECTED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUGGESTION_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'SUGGESTION_CREATED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUGGESTION_VOTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'SUGGESTION_VOTED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUGGESTION_STATUS_CHANGED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'SUGGESTION_STATUS_CHANGED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUGGESTION_CONVERTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'SUGGESTION_CONVERTED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MODULE_VALIDITY_EXPIRED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'MODULE_VALIDITY_EXPIRED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MODULE_REASSIGNED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'MODULE_REASSIGNED'; END IF; END $$;`,

      // ── New NotificationType values ──
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'XP_EARNED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')) THEN ALTER TYPE "NotificationType" ADD VALUE 'XP_EARNED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REWARD_APPROVED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')) THEN ALTER TYPE "NotificationType" ADD VALUE 'REWARD_APPROVED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'REWARD_REJECTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')) THEN ALTER TYPE "NotificationType" ADD VALUE 'REWARD_REJECTED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUGGESTION_POPULAR' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')) THEN ALTER TYPE "NotificationType" ADD VALUE 'SUGGESTION_POPULAR'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUGGESTION_STATUS_CHANGED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')) THEN ALTER TYPE "NotificationType" ADD VALUE 'SUGGESTION_STATUS_CHANGED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MODULE_EXPIRING' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')) THEN ALTER TYPE "NotificationType" ADD VALUE 'MODULE_EXPIRING'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MODULE_EXPIRED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')) THEN ALTER TYPE "NotificationType" ADD VALUE 'MODULE_EXPIRED'; END IF; END $$;`,

      // ── New Permission values ──
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MANAGE_REWARDS' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Permission')) THEN ALTER TYPE "Permission" ADD VALUE 'MANAGE_REWARDS'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'VIEW_MANAGER_DASHBOARD' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Permission')) THEN ALTER TYPE "Permission" ADD VALUE 'VIEW_MANAGER_DASHBOARD'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MANAGE_SUGGESTIONS' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Permission')) THEN ALTER TYPE "Permission" ADD VALUE 'MANAGE_SUGGESTIONS'; END IF; END $$;`,

      // ── Module: add validityMonths ──
      `ALTER TABLE "Module" ADD COLUMN IF NOT EXISTS "validityMonths" INTEGER;`,

      // ── ModuleGroup: add renewalXpBonus ──
      `ALTER TABLE "ModuleGroup" ADD COLUMN IF NOT EXISTS "renewalXpBonus" INTEGER NOT NULL DEFAULT 0;`,

      // ── XpTransaction table ──
      `CREATE TABLE IF NOT EXISTS "XpTransaction" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "amount" INTEGER NOT NULL,
        "source" "XpSourceType" NOT NULL,
        "sourceEntityId" TEXT,
        "description" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "XpTransaction_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "XpTransaction_tenantId_userId_createdAt_idx" ON "XpTransaction"("tenantId", "userId", "createdAt");`,
      `CREATE INDEX IF NOT EXISTS "XpTransaction_tenantId_createdAt_idx" ON "XpTransaction"("tenantId", "createdAt");`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'XpTransaction_tenantId_fkey') THEN ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'XpTransaction_userId_fkey') THEN ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,

      // ── UserXpBalance table ──
      `CREATE TABLE IF NOT EXISTS "UserXpBalance" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "totalXp" INTEGER NOT NULL DEFAULT 0,
        "rank" "ReputationRank" NOT NULL DEFAULT 'BRONZE',
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "UserXpBalance_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "UserXpBalance_userId_tenantId_key" ON "UserXpBalance"("userId", "tenantId");`,
      `CREATE INDEX IF NOT EXISTS "UserXpBalance_tenantId_totalXp_idx" ON "UserXpBalance"("tenantId", "totalXp");`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserXpBalance_tenantId_fkey') THEN ALTER TABLE "UserXpBalance" ADD CONSTRAINT "UserXpBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserXpBalance_userId_fkey') THEN ALTER TABLE "UserXpBalance" ADD CONSTRAINT "UserXpBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,

      // ── Reward table ──
      `CREATE TABLE IF NOT EXISTS "Reward" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "costXp" INTEGER NOT NULL,
        "monthlyLimit" INTEGER,
        "quantityAvailable" INTEGER,
        "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "imageUrl" TEXT,
        "createdById" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "Reward_tenantId_active_idx" ON "Reward"("tenantId", "active");`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reward_tenantId_fkey') THEN ALTER TABLE "Reward" ADD CONSTRAINT "Reward_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Reward_createdById_fkey') THEN ALTER TABLE "Reward" ADD CONSTRAINT "Reward_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE; END IF; END $$;`,

      // ── RewardRedemption table ──
      `CREATE TABLE IF NOT EXISTS "RewardRedemption" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "rewardId" TEXT NOT NULL,
        "xpSpent" INTEGER NOT NULL,
        "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
        "reviewedById" TEXT,
        "reviewedAt" TIMESTAMP(3),
        "rejectReason" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "RewardRedemption_tenantId_userId_createdAt_idx" ON "RewardRedemption"("tenantId", "userId", "createdAt");`,
      `CREATE INDEX IF NOT EXISTS "RewardRedemption_tenantId_status_idx" ON "RewardRedemption"("tenantId", "status");`,
      `CREATE INDEX IF NOT EXISTS "RewardRedemption_rewardId_createdAt_idx" ON "RewardRedemption"("rewardId", "createdAt");`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardRedemption_tenantId_fkey') THEN ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardRedemption_userId_fkey') THEN ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardRedemption_rewardId_fkey') THEN ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RewardRedemption_reviewedById_fkey') THEN ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;`,

      // ── KnowledgeSuggestion table ──
      `CREATE TABLE IF NOT EXISTS "KnowledgeSuggestion" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "link" TEXT,
        "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
        "status" "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
        "voteCount" INTEGER NOT NULL DEFAULT 0,
        "reviewedById" TEXT,
        "reviewedAt" TIMESTAMP(3),
        "convertedModuleId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "KnowledgeSuggestion_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "KnowledgeSuggestion_tenantId_status_createdAt_idx" ON "KnowledgeSuggestion"("tenantId", "status", "createdAt");`,
      `CREATE INDEX IF NOT EXISTS "KnowledgeSuggestion_tenantId_voteCount_idx" ON "KnowledgeSuggestion"("tenantId", "voteCount");`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestion_tenantId_fkey') THEN ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestion_userId_fkey') THEN ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestion_reviewedById_fkey') THEN ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestion_convertedModuleId_fkey') THEN ALTER TABLE "KnowledgeSuggestion" ADD CONSTRAINT "KnowledgeSuggestion_convertedModuleId_fkey" FOREIGN KEY ("convertedModuleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;`,

      // ── KnowledgeSuggestionVote table ──
      `CREATE TABLE IF NOT EXISTS "KnowledgeSuggestionVote" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "suggestionId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "KnowledgeSuggestionVote_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeSuggestionVote_userId_suggestionId_key" ON "KnowledgeSuggestionVote"("userId", "suggestionId");`,
      `CREATE INDEX IF NOT EXISTS "KnowledgeSuggestionVote_suggestionId_idx" ON "KnowledgeSuggestionVote"("suggestionId");`,
      `CREATE INDEX IF NOT EXISTS "KnowledgeSuggestionVote_tenantId_idx" ON "KnowledgeSuggestionVote"("tenantId");`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestionVote_tenantId_fkey') THEN ALTER TABLE "KnowledgeSuggestionVote" ADD CONSTRAINT "KnowledgeSuggestionVote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestionVote_userId_fkey') THEN ALTER TABLE "KnowledgeSuggestionVote" ADD CONSTRAINT "KnowledgeSuggestionVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestionVote_suggestionId_fkey') THEN ALTER TABLE "KnowledgeSuggestionVote" ADD CONSTRAINT "KnowledgeSuggestionVote_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "KnowledgeSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,

      // ── KnowledgeSuggestionComment table ──
      `CREATE TABLE IF NOT EXISTS "KnowledgeSuggestionComment" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "suggestionId" TEXT NOT NULL,
        "body" TEXT NOT NULL,
        "parentId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "KnowledgeSuggestionComment_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "KnowledgeSuggestionComment_suggestionId_createdAt_idx" ON "KnowledgeSuggestionComment"("suggestionId", "createdAt");`,
      `CREATE INDEX IF NOT EXISTS "KnowledgeSuggestionComment_tenantId_idx" ON "KnowledgeSuggestionComment"("tenantId");`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestionComment_tenantId_fkey') THEN ALTER TABLE "KnowledgeSuggestionComment" ADD CONSTRAINT "KnowledgeSuggestionComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestionComment_userId_fkey') THEN ALTER TABLE "KnowledgeSuggestionComment" ADD CONSTRAINT "KnowledgeSuggestionComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestionComment_suggestionId_fkey') THEN ALTER TABLE "KnowledgeSuggestionComment" ADD CONSTRAINT "KnowledgeSuggestionComment_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "KnowledgeSuggestion"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'KnowledgeSuggestionComment_parentId_fkey') THEN ALTER TABLE "KnowledgeSuggestionComment" ADD CONSTRAINT "KnowledgeSuggestionComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgeSuggestionComment"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;`,
    ],
  },
  {
    name: "20260219120000_rename_reputation_ranks",
    statements: [
      // PostgreSQL doesn't support renaming enum values directly.
      // Strategy: add new values, update data, then recreate without old values.

      // Step 1: Add new enum values
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'VAJENEC' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ReputationRank')) THEN ALTER TYPE "ReputationRank" ADD VALUE 'VAJENEC'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'POMOCNIK' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ReputationRank')) THEN ALTER TYPE "ReputationRank" ADD VALUE 'POMOCNIK'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MOJSTER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ReputationRank')) THEN ALTER TYPE "ReputationRank" ADD VALUE 'MOJSTER'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MENTOR' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ReputationRank')) THEN ALTER TYPE "ReputationRank" ADD VALUE 'MENTOR'; END IF; END $$;`,

      // Step 2: Migrate existing data from old values to new values
      `UPDATE "UserXpBalance" SET "rank" = 'VAJENEC' WHERE "rank" = 'BRONZE';`,
      `UPDATE "UserXpBalance" SET "rank" = 'POMOCNIK' WHERE "rank" = 'SILVER';`,
      `UPDATE "UserXpBalance" SET "rank" = 'MOJSTER' WHERE "rank" = 'GOLD';`,
      `UPDATE "UserXpBalance" SET "rank" = 'MENTOR' WHERE "rank" = 'ELITE';`,

      // Step 3: Remove default so we can drop the enum type
      `ALTER TABLE "UserXpBalance" ALTER COLUMN "rank" DROP DEFAULT;`,

      // Step 4: Convert column to TEXT, drop old enum, recreate with new values only
      `ALTER TABLE "UserXpBalance" ALTER COLUMN "rank" TYPE TEXT;`,
      `DROP TYPE "ReputationRank";`,
      `CREATE TYPE "ReputationRank" AS ENUM ('VAJENEC', 'POMOCNIK', 'MOJSTER', 'MENTOR');`,
      `ALTER TABLE "UserXpBalance" ALTER COLUMN "rank" TYPE "ReputationRank" USING "rank"::"ReputationRank";`,
      `ALTER TABLE "UserXpBalance" ALTER COLUMN "rank" SET DEFAULT 'VAJENEC'::"ReputationRank";`,
    ],
  },
  {
    name: "20260219130000_add_lifetime_xp",
    statements: [
      // Add lifetimeXp column (cumulative, never decreases — determines rank)
      `ALTER TABLE "UserXpBalance" ADD COLUMN IF NOT EXISTS "lifetimeXp" INTEGER NOT NULL DEFAULT 0;`,
      // Backfill: compute lifetimeXp from sum of positive XP transactions (ignoring deductions)
      `UPDATE "UserXpBalance" b SET "lifetimeXp" = COALESCE((SELECT SUM(amount) FROM "XpTransaction" t WHERE t."userId" = b."userId" AND t."tenantId" = b."tenantId" AND t.amount > 0), 0) WHERE "lifetimeXp" = 0;`,
      // Index for leaderboard ordering by lifetime XP
      `CREATE INDEX IF NOT EXISTS "UserXpBalance_tenantId_lifetimeXp_idx" ON "UserXpBalance"("tenantId", "lifetimeXp");`,
    ],
  },
  {
    name: "20260220100000_system_error_table",
    statements: [
      `CREATE TABLE IF NOT EXISTS "SystemError" (
        "id" TEXT NOT NULL,
        "tenantId" TEXT,
        "tenantSlug" TEXT,
        "route" TEXT NOT NULL,
        "userId" TEXT,
        "requestId" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "stack" TEXT,
        "meta" JSONB,
        "severity" TEXT NOT NULL DEFAULT 'ERROR',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SystemError_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "SystemError_createdAt_idx" ON "SystemError"("createdAt");`,
      `CREATE INDEX IF NOT EXISTS "SystemError_tenantId_createdAt_idx" ON "SystemError"("tenantId", "createdAt");`,
      `CREATE INDEX IF NOT EXISTS "SystemError_route_createdAt_idx" ON "SystemError"("route", "createdAt");`,
      `CREATE INDEX IF NOT EXISTS "SystemError_requestId_idx" ON "SystemError"("requestId");`,
    ],
  },
  {
    name: "20260220120000_live_events_v2_attendance_suggestion_xp",
    statements: [
      // ── New enums ──
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LiveEventLocationType') THEN CREATE TYPE "LiveEventLocationType" AS ENUM ('ONLINE','PHYSICAL','HYBRID'); END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttendanceStatus') THEN CREATE TYPE "AttendanceStatus" AS ENUM ('REGISTERED','CANCELLED','ATTENDED','NO_SHOW'); END IF; END $$;`,

      // ── New XpSourceType values ──
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUGGESTION_CREATED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'XpSourceType')) THEN ALTER TYPE "XpSourceType" ADD VALUE 'SUGGESTION_CREATED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUGGESTION_APPROVED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'XpSourceType')) THEN ALTER TYPE "XpSourceType" ADD VALUE 'SUGGESTION_APPROVED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EVENT_ATTENDED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'XpSourceType')) THEN ALTER TYPE "XpSourceType" ADD VALUE 'EVENT_ATTENDED'; END IF; END $$;`,

      // ── New AuditAction values ──
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ATTENDANCE_REGISTERED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_REGISTERED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ATTENDANCE_CANCELLED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_CANCELLED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ATTENDANCE_CONFIRMED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_CONFIRMED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ATTENDANCE_REVOKED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_REVOKED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'LIVE_EVENT_MATERIAL_ADDED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'LIVE_EVENT_MATERIAL_ADDED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'LIVE_EVENT_MATERIAL_REMOVED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'LIVE_EVENT_MATERIAL_REMOVED'; END IF; END $$;`,

      // ── New NotificationType values ──
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EVENT_ATTENDANCE_CONFIRMED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')) THEN ALTER TYPE "NotificationType" ADD VALUE 'EVENT_ATTENDANCE_CONFIRMED'; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'EVENT_REMINDER_ATTENDANCE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NotificationType')) THEN ALTER TYPE "NotificationType" ADD VALUE 'EVENT_REMINDER_ATTENDANCE'; END IF; END $$;`,

      // ── MentorLiveEvent: add locationType, onlineUrl, physicalLocation ──
      `ALTER TABLE "MentorLiveEvent" ADD COLUMN IF NOT EXISTS "locationType" "LiveEventLocationType" NOT NULL DEFAULT 'ONLINE';`,
      `ALTER TABLE "MentorLiveEvent" ADD COLUMN IF NOT EXISTS "onlineUrl" TEXT;`,
      `ALTER TABLE "MentorLiveEvent" ADD COLUMN IF NOT EXISTS "physicalLocation" TEXT;`,
      // Backfill onlineUrl from meetUrl for existing rows
      `UPDATE "MentorLiveEvent" SET "onlineUrl" = "meetUrl" WHERE "onlineUrl" IS NULL AND "meetUrl" IS NOT NULL;`,

      // ── LiveEventMaterial table ──
      `CREATE TABLE IF NOT EXISTS "LiveEventMaterial" (
        "id" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "assetId" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "visibleBeforeEvent" BOOLEAN NOT NULL DEFAULT false,
        "addedById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "LiveEventMaterial_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE INDEX IF NOT EXISTS "LiveEventMaterial_eventId_idx" ON "LiveEventMaterial"("eventId");`,
      `CREATE INDEX IF NOT EXISTS "LiveEventMaterial_tenantId_idx" ON "LiveEventMaterial"("tenantId");`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LiveEventMaterial_eventId_fkey') THEN ALTER TABLE "LiveEventMaterial" ADD CONSTRAINT "LiveEventMaterial_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MentorLiveEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LiveEventMaterial_assetId_fkey') THEN ALTER TABLE "LiveEventMaterial" ADD CONSTRAINT "LiveEventMaterial_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LiveEventMaterial_tenantId_fkey') THEN ALTER TABLE "LiveEventMaterial" ADD CONSTRAINT "LiveEventMaterial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LiveEventMaterial_addedById_fkey') THEN ALTER TABLE "LiveEventMaterial" ADD CONSTRAINT "LiveEventMaterial_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;`,

      // ── LiveEventAttendance table ──
      `CREATE TABLE IF NOT EXISTS "LiveEventAttendance" (
        "id" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "tenantId" TEXT NOT NULL,
        "status" "AttendanceStatus" NOT NULL DEFAULT 'REGISTERED',
        "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "confirmedById" TEXT,
        "confirmedAt" TIMESTAMP(3),
        "xpAwarded" BOOLEAN NOT NULL DEFAULT false,
        "xpTransactionId" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "LiveEventAttendance_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "LiveEventAttendance_eventId_userId_key" ON "LiveEventAttendance"("eventId", "userId");`,
      `CREATE INDEX IF NOT EXISTS "LiveEventAttendance_tenantId_eventId_status_idx" ON "LiveEventAttendance"("tenantId", "eventId", "status");`,
      `CREATE INDEX IF NOT EXISTS "LiveEventAttendance_userId_tenantId_idx" ON "LiveEventAttendance"("userId", "tenantId");`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LiveEventAttendance_eventId_fkey') THEN ALTER TABLE "LiveEventAttendance" ADD CONSTRAINT "LiveEventAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MentorLiveEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LiveEventAttendance_userId_fkey') THEN ALTER TABLE "LiveEventAttendance" ADD CONSTRAINT "LiveEventAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LiveEventAttendance_tenantId_fkey') THEN ALTER TABLE "LiveEventAttendance" ADD CONSTRAINT "LiveEventAttendance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE; END IF; END $$;`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LiveEventAttendance_confirmedById_fkey') THEN ALTER TABLE "LiveEventAttendance" ADD CONSTRAINT "LiveEventAttendance_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE; END IF; END $$;`,

      // ── XpTransaction: partial unique index for idempotency ──
      `CREATE UNIQUE INDEX IF NOT EXISTS "XpTransaction_idempotency_idx" ON "XpTransaction"("tenantId", "userId", "source", "sourceEntityId") WHERE "sourceEntityId" IS NOT NULL;`,
    ],
  },
  {
    name: "20260220140000_suggestion_deleted_action",
    statements: [
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUGGESTION_DELETED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AuditAction')) THEN ALTER TYPE "AuditAction" ADD VALUE 'SUGGESTION_DELETED'; END IF; END $$;`,
    ],
  },
  {
    name: "20260221100000_tenant_config",
    statements: [
      `ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "config" JSONB;`,
    ],
  },
];

/**
 * Detect if a SQL statement is an ALTER TYPE ... ADD VALUE (cannot run in transactions).
 */
function isEnumAddValue(stmt: string): boolean {
  return /ALTER\s+TYPE\s+.*ADD\s+VALUE/i.test(stmt);
}

async function main() {
  // Ensure tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "_applied_migrations" (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const migration of MIGRATIONS) {
    // Check if already applied
    const { rows } = await pool.query(
      `SELECT name FROM "_applied_migrations" WHERE name = $1`,
      [migration.name],
    );

    if (rows.length > 0) {
      console.log(`[migrate] ✓ ${migration.name} (already applied)`);
      continue;
    }

    console.log(`[migrate] Applying ${migration.name}...`);

    // Split statements: ALTER TYPE ... ADD VALUE cannot run inside transactions in PostgreSQL.
    // Run enum additions first (outside transaction), then everything else inside a transaction.
    const enumStatements = migration.statements.filter(isEnumAddValue);
    const txStatements = migration.statements.filter((s) => !isEnumAddValue(s));

    // Phase 1: Run enum value additions outside transaction (idempotent via IF NOT EXISTS)
    for (const stmt of enumStatements) {
      await pool.query(stmt);
    }

    // Phase 2: Run remaining statements + mark as applied inside a transaction
    await pool.query("BEGIN");
    try {
      for (const stmt of txStatements) {
        await pool.query(stmt);
      }
      await pool.query(
        `INSERT INTO "_applied_migrations" (name) VALUES ($1)`,
        [migration.name],
      );
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }

    console.log(`[migrate] ✓ ${migration.name} applied`);
  }

  console.log("[migrate] All migrations up to date.");
}

main()
  .catch((e) => {
    console.error("[migrate] Migration failed:", e);
    process.exit(1);
  })
  .finally(() => pool.end());
