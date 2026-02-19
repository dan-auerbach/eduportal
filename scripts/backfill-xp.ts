/**
 * Backfill XP script: retroactively award XP for existing achievements.
 *
 * Scans certificates, quiz attempts (score >= 90%), and confirmed chat answers
 * for a given tenant, then creates XpTransaction records and UserXpBalance
 * entries for any achievements that haven't been rewarded yet.
 *
 * Idempotent — checks for existing XpTransaction duplicates before awarding.
 *
 * Usage: npx dotenv-cli -e .env.local -- npx tsx scripts/backfill-xp.ts
 */

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import type { XpSourceType, ReputationRank } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL!;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const adapter = new PrismaNeon({ connectionString });
const prisma = new PrismaClient({ adapter });

// ── XP Rules (mirrors src/lib/xp.ts) ────────────────────────────────────────

const XP_RULES = {
  MODULE_COMPLETED: 100,
  QUIZ_HIGH_SCORE: 50,
  MENTOR_CONFIRMATION: 25,
} as const;

const RANK_THRESHOLDS: Record<ReputationRank, number> = {
  VAJENEC: 0,
  POMOCNIK: 1500,
  MOJSTER: 3500,
  MENTOR: 6000,
};

function computeRank(totalXp: number): ReputationRank {
  if (totalXp >= RANK_THRESHOLDS.MENTOR) return "MENTOR";
  if (totalXp >= RANK_THRESHOLDS.MOJSTER) return "MOJSTER";
  if (totalXp >= RANK_THRESHOLDS.POMOCNIK) return "POMOCNIK";
  return "VAJENEC";
}

// ── Target tenant ────────────────────────────────────────────────────────────

const TENANT_ID = "cmlcfzqid000004l4uyu8ut1r"; // Moji Mediji

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Check if an XP transaction already exists for (user, source, entity) */
async function alreadyAwarded(
  userId: string,
  source: XpSourceType,
  sourceEntityId: string,
): Promise<boolean> {
  const existing = await prisma.xpTransaction.findFirst({
    where: {
      tenantId: TENANT_ID,
      userId,
      source,
      sourceEntityId,
    },
  });
  return !!existing;
}

interface PendingAward {
  userId: string;
  amount: number;
  source: XpSourceType;
  sourceEntityId: string;
  description: string;
}

async function main() {
  console.log("[backfill-xp] Starting XP backfill for tenant:", TENANT_ID);

  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { name: true },
  });
  if (!tenant) {
    console.error("[backfill-xp] Tenant not found!");
    process.exit(1);
  }
  console.log(`[backfill-xp] Tenant: ${tenant.name}\n`);

  const pending: PendingAward[] = [];

  // ── 1. Certificates → MODULE_COMPLETED (100 XP) ─────────────────────────

  console.log("[backfill-xp] Scanning certificates...");
  const certificates = await prisma.certificate.findMany({
    where: { tenantId: TENANT_ID },
    include: { module: { select: { title: true } } },
  });
  console.log(`  Found ${certificates.length} certificates`);

  for (const cert of certificates) {
    if (await alreadyAwarded(cert.userId, "MODULE_COMPLETED", cert.moduleId)) {
      continue;
    }
    pending.push({
      userId: cert.userId,
      amount: XP_RULES.MODULE_COMPLETED,
      source: "MODULE_COMPLETED",
      sourceEntityId: cert.moduleId,
      description: `Zaključen modul: ${cert.module.title} (backfill)`,
    });
  }

  // ── 2. Quiz attempts with score >= 90 → QUIZ_HIGH_SCORE (50 XP) ─────────

  console.log("[backfill-xp] Scanning quiz attempts (score >= 90%)...");
  const quizAttempts = await prisma.quizAttempt.findMany({
    where: {
      tenantId: TENANT_ID,
      score: { gte: 90 },
      passed: true,
    },
    include: { quiz: { select: { title: true } } },
    orderBy: { startedAt: "asc" },
  });
  console.log(`  Found ${quizAttempts.length} high-score attempts`);

  // Only award once per user+quiz combo (first high-score attempt)
  const awardedQuizzes = new Set<string>();
  for (const attempt of quizAttempts) {
    const key = `${attempt.userId}:${attempt.quizId}`;
    if (awardedQuizzes.has(key)) continue;
    awardedQuizzes.add(key);

    if (
      await alreadyAwarded(attempt.userId, "QUIZ_HIGH_SCORE", attempt.quizId)
    ) {
      continue;
    }
    pending.push({
      userId: attempt.userId,
      amount: XP_RULES.QUIZ_HIGH_SCORE,
      source: "QUIZ_HIGH_SCORE",
      sourceEntityId: attempt.quizId,
      description: `Kviz ${attempt.score}%: ${attempt.quiz.title} (backfill)`,
    });
  }

  // ── 3. Confirmed chat answers → MENTOR_CONFIRMATION (25 XP) ─────────────

  console.log("[backfill-xp] Scanning confirmed chat answers...");
  const confirmedMessages = await prisma.chatMessage.findMany({
    where: {
      tenantId: TENANT_ID,
      isConfirmedAnswer: true,
      userId: { not: null },
      // Only award to author, not the confirmer
      NOT: {
        confirmedById: null,
      },
    },
    select: {
      id: true,
      userId: true,
      confirmedById: true,
      displayName: true,
    },
  });
  console.log(`  Found ${confirmedMessages.length} confirmed answers`);

  for (const msg of confirmedMessages) {
    // Skip if the author confirmed their own answer
    if (!msg.userId || msg.userId === msg.confirmedById) continue;

    if (
      await alreadyAwarded(msg.userId, "MENTOR_CONFIRMATION", msg.id)
    ) {
      continue;
    }
    pending.push({
      userId: msg.userId,
      amount: XP_RULES.MENTOR_CONFIRMATION,
      source: "MENTOR_CONFIRMATION",
      sourceEntityId: msg.id,
      description: `Odgovor potrjen s strani mentorja (backfill)`,
    });
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  console.log("\n[backfill-xp] === Summary ===");

  // Group by user
  const byUser = new Map<string, PendingAward[]>();
  for (const award of pending) {
    const list = byUser.get(award.userId) ?? [];
    list.push(award);
    byUser.set(award.userId, list);
  }

  const moduleCount = pending.filter(
    (a) => a.source === "MODULE_COMPLETED",
  ).length;
  const quizCount = pending.filter(
    (a) => a.source === "QUIZ_HIGH_SCORE",
  ).length;
  const mentorCount = pending.filter(
    (a) => a.source === "MENTOR_CONFIRMATION",
  ).length;

  console.log(`  New MODULE_COMPLETED awards: ${moduleCount}`);
  console.log(`  New QUIZ_HIGH_SCORE awards:  ${quizCount}`);
  console.log(`  New MENTOR_CONFIRMATION awards: ${mentorCount}`);
  console.log(`  Total awards to create: ${pending.length}`);
  console.log(`  Users affected: ${byUser.size}`);

  if (pending.length === 0) {
    console.log("\n[backfill-xp] Nothing to backfill. All XP already awarded.");
    return;
  }

  // ── Execute ────────────────────────────────────────────────────────────────

  console.log("\n[backfill-xp] Creating XP transactions and updating balances...\n");

  let created = 0;
  for (const [userId, awards] of byUser) {
    const totalNewXp = awards.reduce((sum, a) => sum + a.amount, 0);

    // Get user name for logging
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const userName = user
      ? `${user.firstName} ${user.lastName}`
      : userId;

    // Create all XP transactions for this user in a single batch
    const transactions = awards.map((a) => ({
      tenantId: TENANT_ID,
      userId: a.userId,
      amount: a.amount,
      source: a.source,
      sourceEntityId: a.sourceEntityId,
      description: a.description,
    }));

    // Get current balance
    const existing = await prisma.userXpBalance.findUnique({
      where: { userId_tenantId: { userId, tenantId: TENANT_ID } },
    });
    const newLifetime = (existing?.lifetimeXp ?? 0) + totalNewXp;
    const newTotal = (existing?.totalXp ?? 0) + totalNewXp;
    const newRank = computeRank(newLifetime);

    // Atomic: create all transactions + upsert balance
    await prisma.$transaction([
      ...transactions.map((t) => prisma.xpTransaction.create({ data: t })),
      prisma.userXpBalance.upsert({
        where: { userId_tenantId: { userId, tenantId: TENANT_ID } },
        create: {
          tenantId: TENANT_ID,
          userId,
          lifetimeXp: totalNewXp,
          totalXp: totalNewXp,
          rank: computeRank(totalNewXp),
        },
        update: { lifetimeXp: newLifetime, totalXp: newTotal, rank: newRank },
      }),
    ]);

    const awardBreakdown = awards
      .map((a) => `${a.source}(+${a.amount})`)
      .join(", ");
    console.log(
      `  ✓ ${userName}: +${totalNewXp} XP → ${newTotal} total (${newRank}) [${awardBreakdown}]`,
    );
    created += awards.length;
  }

  console.log(
    `\n[backfill-xp] Done! Created ${created} XP transactions for ${byUser.size} users.`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill-xp] Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
