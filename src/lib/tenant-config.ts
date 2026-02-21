/**
 * Per-tenant configuration stored as JSON in the Tenant.config column.
 *
 * null config = all defaults. Only overridden keys are stored.
 * Adding new keys requires NO migration — just add a default here.
 */

import type { ReputationRank } from "@/generated/prisma/client";

// ── Types ────────────────────────────────────────────────────────────────────

export type TenantFeatures = {
  chat: boolean;
  radar: boolean;
  suggestions: boolean;
  rewards: boolean;
  leaderboard: boolean;
  liveEvents: boolean;
  aiBuilder: boolean;
};

export type RankThreshold = {
  rank: ReputationRank;
  minXp: number;
  label: string;
};

export type TenantConfig = {
  /** XP points awarded per action */
  xpRules: Record<string, number>;
  /** Rank thresholds and display labels */
  rankThresholds: RankThreshold[];
  /** Quiz score percentage to earn high-score XP bonus */
  quizHighScorePercent: number;
  /** Number of votes required for suggestion to earn TOP_SUGGESTION XP */
  suggestionVoteThreshold: number;
  /** Feature toggles */
  features: TenantFeatures;
  /** IANA timezone for cron jobs and date formatting */
  timezone: string;
};

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_TENANT_CONFIG: TenantConfig = {
  xpRules: {
    MODULE_COMPLETED: 100,
    QUIZ_HIGH_SCORE: 50,
    MENTOR_CONFIRMATION: 25,
    TOP_SUGGESTION: 75,
    COMPLIANCE_RENEWAL: 50,
    SUGGESTION_CREATED: 10,
    SUGGESTION_APPROVED: 30,
    EVENT_ATTENDED: 20,
  },
  rankThresholds: [
    { rank: "VAJENEC", minXp: 0, label: "Vajenec" },
    { rank: "POMOCNIK", minXp: 1500, label: "Pomočnik" },
    { rank: "MOJSTER", minXp: 3500, label: "Mojster" },
    { rank: "MENTOR", minXp: 6000, label: "Mentor" },
  ],
  quizHighScorePercent: 90,
  suggestionVoteThreshold: 5,
  features: {
    chat: true,
    radar: true,
    suggestions: true,
    rewards: true,
    leaderboard: true,
    liveEvents: true,
    aiBuilder: true,
  },
  timezone: "Europe/Ljubljana",
};

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Deep-merge tenant config JSON with defaults.
 * Missing keys fall back to DEFAULT_TENANT_CONFIG.
 */
export function resolveTenantConfig(raw: unknown): TenantConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_TENANT_CONFIG;

  const partial = raw as Record<string, unknown>;

  return {
    xpRules: {
      ...DEFAULT_TENANT_CONFIG.xpRules,
      ...(typeof partial.xpRules === "object" && partial.xpRules !== null
        ? (partial.xpRules as Record<string, number>)
        : {}),
    },
    rankThresholds: Array.isArray(partial.rankThresholds)
      ? (partial.rankThresholds as RankThreshold[])
      : DEFAULT_TENANT_CONFIG.rankThresholds,
    quizHighScorePercent:
      typeof partial.quizHighScorePercent === "number"
        ? partial.quizHighScorePercent
        : DEFAULT_TENANT_CONFIG.quizHighScorePercent,
    suggestionVoteThreshold:
      typeof partial.suggestionVoteThreshold === "number"
        ? partial.suggestionVoteThreshold
        : DEFAULT_TENANT_CONFIG.suggestionVoteThreshold,
    features: {
      ...DEFAULT_TENANT_CONFIG.features,
      ...(typeof partial.features === "object" && partial.features !== null
        ? (partial.features as Partial<TenantFeatures>)
        : {}),
    },
    timezone:
      typeof partial.timezone === "string"
        ? partial.timezone
        : DEFAULT_TENANT_CONFIG.timezone,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get XP amount for a given source from config, with fallback to default */
export function getXpAmount(config: TenantConfig, source: string): number {
  return config.xpRules[source] ?? DEFAULT_TENANT_CONFIG.xpRules[source] ?? 0;
}

/** Compute rank from total XP using config thresholds */
export function computeRankFromConfig(
  config: TenantConfig,
  totalXp: number,
): ReputationRank {
  const sorted = [...config.rankThresholds].sort((a, b) => b.minXp - a.minXp);
  for (const t of sorted) {
    if (totalXp >= t.minXp) return t.rank;
  }
  return "VAJENEC";
}

/** Get human-readable rank label from config */
export function getRankLabel(
  config: TenantConfig,
  rank: ReputationRank,
): string {
  const found = config.rankThresholds.find((t) => t.rank === rank);
  return found?.label ?? rank;
}

/** XP needed to reach the next rank, or null if already at max */
export function xpToNextRankFromConfig(
  config: TenantConfig,
  lifetimeXp: number,
): { nextRank: ReputationRank; xpNeeded: number } | null {
  const sorted = [...config.rankThresholds].sort((a, b) => a.minXp - b.minXp);
  for (const t of sorted) {
    if (t.minXp > lifetimeXp) {
      return { nextRank: t.rank, xpNeeded: t.minXp - lifetimeXp };
    }
  }
  return null;
}

/** Build a Record<ReputationRank, string> for RankBadge labels */
export function getRankLabelsMap(
  config: TenantConfig,
): Record<ReputationRank, string> {
  const map = {} as Record<ReputationRank, string>;
  for (const t of config.rankThresholds) {
    map[t.rank] = t.label;
  }
  return map;
}
