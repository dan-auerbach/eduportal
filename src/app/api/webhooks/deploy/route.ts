import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

// ── Verification helpers ─────────────────────────────────────────────────────

/** Vercel signs webhook payloads with HMAC-SHA1 in `x-vercel-signature`. */
function verifyVercelSignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const hmac = createHmac("sha1", secret);
  hmac.update(rawBody);
  const digest = hmac.digest("hex");
  if (digest.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

/** For manual triggers, reuse the same CRON_SECRET Bearer pattern. */
function verifyCronSecret(req: NextRequest): boolean {
  const header = (req.headers.get("authorization") ?? "").trim();
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length || !secret) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// ── Version helpers ──────────────────────────────────────────────────────────

function incrementVersion(current: string | null): string {
  if (!current) return "1.00";
  const parts = current.split(".");
  if (parts.length !== 2) return "1.00";
  let major = parseInt(parts[0], 10) || 1;
  let minor = parseInt(parts[1], 10) || 0;
  minor += 1;
  if (minor >= 100) {
    major += 1;
    minor = 0;
  }
  return `${major}.${String(minor).padStart(2, "0")}`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
  const rawBody = await req.text();
  const isManual = req.nextUrl.searchParams.get("manual") === "true";

  // ── Auth ───────────────────────────────────────────────────────────────────
  if (isManual) {
    if (!verifyCronSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }
  } else {
    const secret = process.env.DEPLOY_WEBHOOK_SECRET;
    const signature = req.headers.get("x-vercel-signature") ?? "";
    if (!secret || !signature || !verifyVercelSignature(rawBody, signature, secret)) {
      return new Response("Unauthorized", { status: 401 });
    }

    // Only react to production deployments that succeeded
    try {
      const payload = JSON.parse(rawBody);
      // Vercel webhook payload: type = "deployment.succeeded", payload.target = "production"
      if (payload.type && payload.type !== "deployment.succeeded") {
        return NextResponse.json({ skipped: true, reason: "not deployment.succeeded" });
      }
      if (payload.payload?.target && payload.payload.target !== "production") {
        return NextResponse.json({ skipped: true, reason: "not production" });
      }
    } catch {
      // If body isn't JSON (shouldn't happen), continue anyway
    }
  }

  // ── Fetch latest changelog entry ───────────────────────────────────────────
  const latestEntry = await prisma.changelogEntry.findFirst({
    where: { tenantId: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, version: true },
  });

  const since = latestEntry?.createdAt ?? new Date(0);

  // ── Fetch commits from GitHub ──────────────────────────────────────────────
  const ghToken = (process.env.GITHUB_TOKEN ?? "").trim();
  if (!ghToken) {
    return NextResponse.json({ error: "GITHUB_TOKEN not configured" }, { status: 500 });
  }

  const ghRes = await fetch(
    `https://api.github.com/repos/dan-auerbach/eduportal/commits?since=${since.toISOString()}&sha=main&per_page=50`,
    {
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: "application/vnd.github+json",
      },
    },
  );

  if (!ghRes.ok) {
    const errorText = await ghRes.text();
    console.error("[deploy-webhook] GitHub API error:", ghRes.status, errorText);
    return NextResponse.json({ error: "GitHub API error" }, { status: 502 });
  }

  const commits: Array<{ sha: string; commit: { message: string } }> = await ghRes.json();

  // Filter out merge commits and extract messages
  const messages = commits
    .map((c) => c.commit.message.split("\n")[0]) // first line only
    .filter((m) => !m.startsWith("Merge "));

  if (messages.length === 0) {
    return NextResponse.json({ skipped: true, reason: "no new commits" });
  }

  // ── Generate changelog via Claude ──────────────────────────────────────────
  const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!anthropicKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const commitList = messages.map((m, i) => `${i + 1}. ${m}`).join("\n");

  const aiResponse = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are generating a changelog entry for "Mentor", an LMS (Learning Management System) web platform.

Given these recent git commits, write a user-facing changelog entry in English.

Rules:
- Respond with EXACTLY two lines: first line is the title, second line is the summary
- Title: short, max 10 words, describes the main theme of changes
- Summary: 1-3 sentences, written for end-users (not developers), plain language
- Ignore commits about internal refactoring, CI/CD, code cleanup, dependencies
- Focus on features, improvements, and bug fixes users would notice
- If ALL commits are purely internal/non-user-facing, respond with exactly: SKIP

Commits:
${commitList}`,
      },
    ],
  });

  const aiText =
    aiResponse.content[0].type === "text" ? aiResponse.content[0].text.trim() : "";

  if (!aiText || aiText === "SKIP") {
    return NextResponse.json({ skipped: true, reason: "AI determined no user-facing changes" });
  }

  const lines = aiText.split("\n").filter((l) => l.trim());
  const title = lines[0] ?? "Platform update";
  const summary = lines.slice(1).join(" ") || title;

  // ── Auto-increment version ─────────────────────────────────────────────────
  const newVersion = incrementVersion(latestEntry?.version ?? null);

  // ── Save changelog entry ───────────────────────────────────────────────────
  await prisma.$transaction([
    prisma.changelogEntry.updateMany({
      where: { isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.changelogEntry.create({
      data: {
        version: newVersion,
        title,
        summary,
        isCurrent: true,
        createdById: null, // automated
        tenantId: null, // global
      },
    }),
  ]);

  console.log(`[deploy-webhook] Created changelog v${newVersion}: ${title}`);

  return NextResponse.json({
    success: true,
    version: newVersion,
    title,
    summary,
    commitsProcessed: messages.length,
  });
  } catch (error) {
    console.error("[deploy-webhook] Unhandled error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
