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
];

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

    // Run each SQL statement
    console.log(`[migrate] Applying ${migration.name}...`);
    for (const stmt of migration.statements) {
      await pool.query(stmt);
    }

    // Mark as applied
    await pool.query(
      `INSERT INTO "_applied_migrations" (name) VALUES ($1)`,
      [migration.name],
    );
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
