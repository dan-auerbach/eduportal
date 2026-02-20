# Architecture

## Logical Architecture

```
+--------------------------------------------------+
|                   Client (Browser)                |
|  Next.js App Router (RSC + Client Components)     |
|  React 19 · Tailwind CSS v4 · shadcn/ui          |
+--------------------------------------------------+
          |           |              |
    Server Actions  API Routes   Middleware
          |           |              |
+--------------------------------------------------+
|              Next.js Server (Node.js 20+)         |
|  Auth (NextAuth v5 JWT) · Tenant Context          |
|  Rate Limiting · Permission Checks                |
+--------------------------------------------------+
          |              |               |
    Prisma ORM     External APIs    Cron Jobs
          |              |               |
+--------------------------------------------------+
|                   Data Layer                      |
|  Neon PostgreSQL (via @prisma/adapter-neon)       |
|  Upstash Redis (rate limiting, presence)          |
+--------------------------------------------------+

+--------------------------------------------------+
|              External Integrations                |
|  Cloudflare Stream   (video hosting/streaming)    |
|  Soniox              (speech-to-text)             |
|  Anthropic Claude    (AI content generation)      |
|  OpenAI DALL-E 3     (AI image generation)        |
|  Resend              (transactional email)        |
|  Vercel Blob         (file storage in production) |
+--------------------------------------------------+
```

## Main Modules

### 1. Multi-Tenant Core (`src/lib/tenant.ts`)
Every request resolves a tenant context via cookie. Users belong to tenants through `Membership` records with tenant-scoped roles (OWNER, SUPER_ADMIN, ADMIN, HR, EMPLOYEE, VIEWER). Global OWNER role can impersonate any tenant. Stale cookie detection validates the cookie against DB on each request — if the tenant was deleted/archived or the user lost membership, the cookie is cleared and `_autoSelectTenant()` falls back to auto-select logic.

### 2. Learning Modules (`src/actions/modules.ts`, `src/components/admin/module-editor.tsx`)
Modules contain ordered sections (TEXT, VIDEO, ATTACHMENT, MIXED). Sections support rich HTML (TipTap editor), video embeds (Cloudflare Stream, YouTube, TargetVideo), and file attachments (PDF, Word). Modules are assigned to employee groups with optional deadlines.

### 3. AI Module Builder (`src/actions/ai-builder.ts`, `src/lib/ai/generate-module-draft.ts`)
End-to-end pipeline: upload video (Cloudflare Stream) or document (PDF/Word) -> transcribe audio (Soniox) or extract text (unpdf/mammoth) -> generate structured module with Claude -> create Module + Sections + Quiz in DB.

### 4. AI Editor Assistants (`src/actions/ai-editor.ts`)
Per-field AI generation within the module editor:
- Title + description suggestions (Claude)
- Tag generation (Claude)
- Quiz generation from section content (Claude)
- Cover image generation (DALL-E 3 + sharp)

### 5. Quiz Engine (`src/actions/quiz.ts`)
SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE questions. Score calculation with configurable passing score. Max attempts per quiz. Quiz attempts stored with full answer details.

### 6. Progress Tracking (`src/lib/progress.ts`, `src/actions/progress.ts`)
Section-level completion tracking. Module completion = all sections done + quiz passed (if exists). Admin can override progress. Certificates auto-issued on module completion.

### 7. Chat System (`src/actions/chat.ts`, `src/hooks/use-chat.ts`, `src/components/chat/chat-thread.tsx`)
Per-tenant and per-module chat rooms. SSE streaming for near-real-time delivery (~2s latency) with automatic adaptive polling fallback. Unified `ChatThread` component with `variant="full"` (global chat page) and `variant="embedded"` (module tab). Mentors can confirm answers. Rate-limited message sending.

### 7a. Presence System (`src/lib/presence.ts`)
Redis-based online user tracking with 90s TTL keys (auto-expire). Heartbeat every 30s via `UsageTracker` component (visibility-aware). Sidebar widget shows online users per tenant. No database model — Redis only.

### 8. Radar Feed (`src/actions/radar.ts`)
Social content curation: employees submit URL-based posts, admins approve/reject, all employees see approved feed. Pinning, save/bookmark, moderation.

### 9. Live Events (`src/actions/live-events.ts`, `src/actions/attendance.ts`)
Mentor-scheduled live training events with location types (ONLINE, PHYSICAL, HYBRID). Online events have video conference URLs; physical/hybrid events have addresses. Group-targeted with reminder emails (location-aware). ICS calendar download. Downloadable materials via `LiveEventMaterial` (Vercel Blob). Attendance system: employee self-registration (slot-limited via `maxAttendees`), admin bulk confirmation, email-based HMAC-signed confirmation links, XP award on confirmation (EVENT_ATTENDED, 30 XP).

### 10. Notification System (`src/actions/notifications.ts`)
In-app notifications for new modules, deadlines, quiz results, comments, certificates. Email delivery via Resend with configurable templates per tenant.

### 11. Media Library (`src/actions/media.ts`)
Centralized media asset management. Videos via Cloudflare Stream, documents via Vercel Blob. Shared across sections to avoid duplication. Reference-counted cleanup on delete.

### 12. Permission System (`src/lib/permissions.ts`)
Fine-grained permissions (14 capabilities) with optional scope (groupIds, moduleIds). Role hierarchy bypass: OWNER/SUPER_ADMIN skip permission checks.

### 13. Gamification & XP Engine (`src/lib/xp.ts`, `src/actions/xp.ts`)
Dual XP system: `lifetimeXp` (cumulative, determines rank, never decreases) and `totalXp` (spendable balance, decreases on reward redemption). XP awarded for module completion (100), high quiz scores (50, ≥90%), mentor answer confirmations (25), popular suggestions (75), compliance renewals (50), and event attendance (30). Rank system: VAJENEC (0) → POMOCNIK (1500) → MOJSTER (3500) → MENTOR (6000). Leaderboard with tenant-scoped and group-filtered views. All XP mutations use Prisma interactive transactions (`$transaction(async (tx) => {...})`) with row-level locking to prevent race conditions.

### 14. Reward Economy (`src/actions/rewards.ts`)
Admin-managed reward catalog with XP cost, stock limits, monthly caps, and optional approval workflow. Employees redeem rewards by spending `totalXp` (spendable balance) — rank based on `lifetimeXp` is never affected. Pending redemptions reviewed by admins. Auto-approve mode for low-risk rewards. All redemption and review operations are fully atomic — XP deduction, stock update, and redemption record are created within a single interactive transaction.

### 15. Knowledge Suggestions (`src/actions/suggestions.ts`)
Employee-submitted knowledge ideas with voting, threaded comments, and admin moderation. Suggestions can be converted to draft modules. Anonymous submission support. Popular suggestions (≥5 votes) trigger admin notifications. Status workflow: OPEN → APPROVED/REJECTED/CONVERTED.

### 16. Manager Dashboard (`src/actions/manager-dashboard.ts`)
Aggregate analytics for managers: at-risk users (overdue deadlines), engagement scores (XP + session activity), completion heatmap (groups × modules), top performers by XP, and recent suggestions. Group-filtered views.

### 17. Compliance & Module Validity (`src/actions/compliance.ts`)
Module validity periods (`validityMonths`). Daily cron job checks for expiring/expired certifications. 30-day advance reminders. Automatic progress reset on expiry. XP bonus for timely renewal. Admin reassignment workflow.

## Data Flow

### Module Creation (Manual)
```
Admin -> Module Editor (client) -> Server Actions -> Prisma -> Neon DB
                                        |
                                   Audit Log
```

### Module Creation (AI Builder)
```
Admin -> Upload Video/Doc -> API Route -> Cloudflare Stream (video)
                                       -> Vercel Blob (document)
  -> Polling status...
  -> Soniox transcription (video) / unpdf + mammoth (document)
  -> Claude (generate module JSON)
  -> Prisma: create Module + Sections + Quiz
  -> Redirect to editor
```

### Employee Learning Flow
```
Employee -> Module Page (SSR) -> Read Section -> Mark Complete -> Server Action
  -> All Sections Done? -> Quiz Available? -> Take Quiz -> Pass?
  -> Certificate Issued -> Notification + Email
```

### XP Award Flow
```
Trigger (module complete / quiz pass / mentor confirm / event attend)
  -> awardXp() in interactive $transaction:
     1. SELECT existing UserXpBalance (row-level lock)
     2. Create XpTransaction record
     3. Upsert UserXpBalance (increment lifetimeXp + totalXp)
     4. Compute rank from lifetimeXp
     5. If rank changed: create notification
     6. Audit log
  (All steps atomic — no TOCTOU race conditions)
```

### Reward Redemption Flow
```
Employee -> Redeem Reward -> Check totalXp >= costXp
  -> Check monthlyLimit & quantityAvailable
  -> Single interactive $transaction:
     -> Decrement stock (if limited)
     -> If auto-approve: deductXp(totalXp only) within same tx
     -> Create RewardRedemption record
  -> If approvalRequired (manual review):
     -> Admin reviews in interactive $transaction:
        -> Approve: deductXp + update status + notify
        -> Reject: refund stock + update status + notify
  (lifetimeXp never decreases — rank is preserved)
  (All operations fully atomic — no orphaned redemptions)
```

## Key Trade-offs

1. **SSE over WebSockets** for chat: Vercel serverless doesn't support WebSockets. SSE endpoint polls DB every 2s for 25s, then client auto-reconnects. Reduces client HTTP requests from ~12/min (polling) to ~2/min (SSE). Automatic fallback to adaptive polling if SSE fails 3 times in 30s.

2. **JWT sessions over DB sessions**: Fast edge middleware auth checks without DB round-trip. Role refresh every 5 minutes for freshness.

3. **Custom migration script over Prisma Migrate**: Neon's serverless driver requires Pool-based raw SQL. Prisma Migrate doesn't support the Neon adapter. Custom `migrate-prod.ts` with `_applied_migrations` tracking table. Transactional execution with `ROLLBACK` on failure (except `ALTER TYPE ... ADD VALUE` which PostgreSQL requires outside transactions).

4. **Storage abstraction layer**: Local filesystem for development, Vercel Blob for production. Seamless switching via `STORAGE_BACKEND` env var.

5. **Rate limiting with fallback**: Upstash Redis for cross-instance rate limiting in production, in-memory fallback for local dev or Redis outage.

6. **Dual XP balances (lifetimeXp / totalXp)**: Rank never decreases when spending XP on rewards. `lifetimeXp` is cumulative and determines rank. `totalXp` is the spendable balance. Both increment on XP earn, only `totalXp` decreases on spend.

7. **Eager rank computation**: Rank recalculated on every XP event within the same DB transaction. No background jobs — rank is always up-to-date. Acceptable because rank changes are infrequent.
