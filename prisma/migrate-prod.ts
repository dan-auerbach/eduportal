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
