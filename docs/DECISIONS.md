# Architectural Decision Records (ADR)

## ADR-001: Next.js App Router with Server Components

**Context**: Needed a full-stack framework for a multi-tenant LMS with SSR, API routes, and server-side data fetching. Project started in early 2026.

**Decision**: Next.js 16 App Router with React Server Components. Server Actions for mutations. Edge Middleware for auth.

**Consequence**: Fast page loads with streaming SSR. Server Components avoid shipping data-fetching code to the client. Server Actions eliminate manual API route creation for mutations. Turbopack provides fast HMR. Trade-off: App Router is newer with fewer community patterns. RSC + Client Component boundary requires careful component design.

---

## ADR-002: Neon PostgreSQL with Prisma Adapter

**Context**: Needed a PostgreSQL database compatible with Vercel's serverless deployment model. Traditional connection pooling (PgBouncer) doesn't work well with short-lived serverless functions.

**Decision**: Neon Serverless PostgreSQL with `@prisma/adapter-neon`. HTTP-based connection via `@neondatabase/serverless` driver.

**Consequence**: Each serverless function invocation creates a lightweight HTTP connection — no persistent pool needed. Auto-scaling and branching support. Trade-off: Neon's HTTP driver has slightly higher latency than direct TCP connections. Custom migration script required because Prisma Migrate doesn't support the Neon adapter.

---

## ADR-003: Custom Production Migration Script

**Context**: Prisma Migrate (`prisma migrate deploy`) uses a direct TCP connection and doesn't support the Neon serverless adapter. Attempting to use it in the Vercel build step fails.

**Decision**: Custom `prisma/migrate-prod.ts` script using `@neondatabase/serverless` Pool for direct SQL execution. Tracks applied migrations in a `_applied_migrations` table. Runs as part of the build step.

**Consequence**: Full control over migration execution. Idempotent — safe to re-run on every deploy. Trade-off: migrations must be written as raw SQL statements instead of Prisma's declarative schema-diff approach. New migrations need manual registration in the `MIGRATIONS` array.

---

## ADR-004: JWT Sessions over Database Sessions

**Context**: NextAuth.js v5 supports both JWT and database session strategies. Edge middleware needs to check auth on every request.

**Decision**: JWT strategy with 24-hour expiry. JWT stored as HTTP-only cookie. Role refreshed from DB every 5 minutes in Node.js runtime (not in Edge).

**Consequence**: No database round-trip for session validation. Edge middleware can verify JWT without DB access. Trade-off: JWT can't be individually revoked (only mass-invalidated by rotating AUTH_SECRET). Roles can be stale for up to 5 minutes.

---

## ADR-005: Two-Level Role System (Global + Tenant)

**Context**: Multi-tenant system where users can belong to multiple tenants with different roles. Need both platform-wide admin access and per-tenant role differentiation.

**Decision**: Global `Role` on User (OWNER, SUPER_ADMIN, ADMIN, EMPLOYEE) + Tenant-scoped `TenantRole` on Membership (OWNER, SUPER_ADMIN, ADMIN, HR, EMPLOYEE, VIEWER). Fine-grained `UserPermission` records with optional scope (groupIds, moduleIds).

**Consequence**: Flexible permission model supporting both global admins and per-tenant role assignments. OWNER/SUPER_ADMIN bypass all permission checks for simplicity. Trade-off: two separate role enums can be confusing. Permission checking has up to 3 DB queries per action.

---

## ADR-006: Cloudflare Stream for Video Hosting

**Context**: Needed reliable video hosting with adaptive bitrate streaming. Initial implementation used Vercel Blob for video storage, but large files (100MB+) caused upload issues and no transcoding.

**Decision**: Migrated to Cloudflare Stream. TUS protocol for resumable uploads via `tus-js-client`. Client-side upload through TUS proxy endpoint. Cloudflare handles transcoding and HLS streaming.

**Consequence**: Professional video delivery with adaptive bitrate. Resumable uploads handle large files reliably. Trade-off: additional service dependency. TUS proxy needed to work around CORS restrictions. Audio extraction for AI transcription requires polling Cloudflare's download API.

---

## ADR-007: SSE-Based Chat with Polling Fallback (No WebSockets)

**Context**: Needed real-time chat for per-tenant and per-module conversations. Vercel serverless doesn't support WebSocket connections natively. Upstash Redis is REST-only (no Pub/Sub or XREAD).

**Decision**: Server-Sent Events (SSE) as primary transport. SSE endpoint (`/api/chat/stream`) polls DB every 2s within a 25s serverless function, pushing new messages as events. Client reconnects automatically via `EventSource` + `Last-Event-ID`. Falls back to adaptive polling (5-15s) if SSE fails 3 times in 30s. Unified `useChat` hook handles both transports transparently.

**Consequence**: ~2s message latency (vs ~5s with polling). Client HTTP requests reduced from ~12/min to ~2/min. Graceful degradation — polling fallback ensures chat always works. Trade-off: 25s Vercel function per SSE connection (requires Pro plan `maxDuration: 30`). DB-polling inside SSE adds ~12 lightweight queries per connection.

---

## ADR-008: Claude API for AI Features (Over OpenAI GPT)

**Context**: AI-powered content generation needed to support both Slovenian and English. Module builder, metadata suggestions, quiz generation all require high-quality text generation.

**Decision**: Anthropic Claude (`claude-sonnet-4-20250514`) via `@anthropic-ai/sdk` for all text generation. OpenAI used only for DALL-E 3 image generation (no Claude equivalent).

**Consequence**: Excellent Slovenian language support. Structured JSON output with Zod validation. Trade-off: two AI providers to manage. Claude doesn't have image generation, requiring OpenAI as secondary dependency.

---

## ADR-009: Storage Abstraction Layer

**Context**: Local development needs filesystem storage. Production needs Vercel Blob. Both should use the same API.

**Decision**: `StorageProvider` interface with `LocalStorageProvider` (filesystem) and `VercelBlobStorageProvider` implementations. Singleton pattern with `STORAGE_BACKEND` env var switch.

**Consequence**: Seamless development experience — no cloud dependencies for local dev. Same storage API (`put`, `get`, `delete`) regardless of backend. Cover images and logos served via API routes that read from the storage provider. Trade-off: API routes for static file serving add latency (mitigated by cache headers).

---

## ADR-010: Upstash Redis with In-Memory Fallback for Rate Limiting

**Context**: Rate limiting needed for login, chat, AI actions. Vercel serverless functions don't share memory — need distributed rate limiting.

**Decision**: Upstash Redis (HTTP-based) as primary rate limiter. In-memory `Map` as fallback for development or Redis outage. Sliding window algorithm via `@upstash/ratelimit`.

**Consequence**: Cross-instance rate limiting in production. Graceful degradation — application continues working if Redis is down (per-instance rate limiting). Trade-off: in-memory fallback is per-instance, not globally accurate.

---

## ADR-011: Module-Level i18n (No Framework)

**Context**: Needed Slovenian and English translations. Most i18n frameworks (next-intl, i18next) add complexity for just two locales.

**Decision**: Custom module-level singleton. Locale set per-request via `setLocale()`. Translation via `t("dot.separated.key")` resolving nested objects from `sl.ts`/`en.ts`. Fallback to English for missing keys.

**Consequence**: Zero-dependency i18n. Simple to add/edit translations. Locale set from tenant config (per-company language). Trade-off: not type-safe (string keys). No pluralization rules or ICU support. Race condition mitigated by React's `cache()` on `getTenantContext`.

---

## ADR-012: Resend for Transactional Email

**Context**: Needed transactional email for password resets, invitations, deadline reminders, digest notifications. Email must support both plain text and styled HTML.

**Decision**: Resend API with plain text templates rendered to HTML. JWT-based one-click unsubscribe links (RFC 8058). Per-tenant email template customization.

**Consequence**: Simple integration with good deliverability. Template system with `{placeholder}` variables. Retry logic for transient errors. Trade-off: no queuing — emails sent synchronously from server actions/cron jobs.

---

## ADR-013: TipTap for Rich Text Editing

**Context**: Module sections need rich text editing with HTML output. Content stored as HTML in the database.

**Decision**: TipTap editor (ProseMirror-based) with extensions for links, images. Output sanitized via `sanitize-html` before storage.

**Consequence**: Professional editing experience with extensible architecture. HTML output compatible with server-side rendering. Trade-off: TipTap adds significant bundle size. Inline image upload requires dedicated API route.

---

## ADR-014: Reference-Counted Media Asset Cleanup

**Context**: MediaAssets (videos, documents) can be shared across multiple sections. Deleting a section shouldn't delete a shared asset. Orphaned assets should be cleaned up.

**Decision**: `MediaAsset` model with `Section` relation. Cleanup checks reference count (`_count.sections`). Only the last reference triggers provider deletion (Cloudflare Stream or Vercel Blob). Failed cleanups marked as `DELETE_FAILED` for visibility.

**Consequence**: Safe shared asset model. No orphaned files in external providers. Best-effort cleanup — provider errors don't block DB operations. Trade-off: cleanup requires careful reference counting logic.

---

## ADR-015: Tenant-Scoped Data with Cookie-Based Tenant Selection

**Context**: Users can belong to multiple tenants. Need a way to determine the active tenant per request.

**Decision**: Active tenant stored in HTTP-only cookie (`mentor-tenant`, 1-year maxAge). Auto-selected if user has single membership. Multi-tenant users redirected to picker page. OWNER can impersonate any tenant via separate cookie (`mentor-owner-tenant`, 8-hour expiry).

**Consequence**: Stateless tenant context — no server-side session store needed. `getTenantContext()` wrapped with `React.cache()` for per-request deduplication. Trade-off: cookie must be set from Server Action or Route Handler (not Server Component). Impersonation cookie has separate shorter expiry for security. **Stale cookie mitigation**: Since the cookie persists for 1 year (outliving JWT sessions), `_getTenantContextImpl()` validates the cookie against the DB on every request. If the tenant was deleted/archived or the user lost membership, the cookie is cleared and `_autoSelectTenant()` falls back to auto-select — preventing login redirect loops that occurred when the JWT expired but the stale cookie remained.

---

## ADR-016: Dual XP Balance (lifetimeXp / totalXp)

**Context**: Original design had a single `totalXp` field for both rank determination and reward spending. Users reported that spending XP on rewards would demote their rank — unintuitive and demoralizing.

**Decision**: Split into two fields: `lifetimeXp` (cumulative, only increments, determines rank) and `totalXp` (spendable balance, decremented on reward redemption). `awardXp()` increments both fields. `deductXp()` only decrements `totalXp`. Rank always computed from `lifetimeXp`.

**Consequence**: Rank never decreases regardless of reward spending. Users can freely spend XP without fear of demotion. Leaderboard sorted by `lifetimeXp`. Header badge shows `totalXp` (spendable). Trade-off: two fields to maintain, migration needed to backfill `lifetimeXp` from sum of positive transactions for existing users.

---

## ADR-017: Custom Reputation Ranks (Slovenian)

**Context**: Default rank names (Bronze, Silver, Gold, Elite) were generic and didn't fit the mentoring context. Needed localized, domain-specific rank names with different thresholds.

**Decision**: Custom Slovenian rank names mapped to mentoring progression: VAJENEC (apprentice, 0 XP), POMOCNIK (helper, 1500 XP), MOJSTER (master, 3500 XP), MENTOR (mentor, 6000 XP). Implemented as PostgreSQL enum with a complex migration strategy (add new values → migrate data → drop default → convert to TEXT → drop old type → recreate → convert back).

**Consequence**: Domain-specific, meaningful rank names. Each rank has a unique icon (GraduationCap, Wrench, Award, Star). Trade-off: PostgreSQL doesn't support renaming enum values directly — required multi-step migration. Enum values are in Slovenian but the system works for all locales (labels are translated via i18n).

---

## ADR-018: Eager Rank Computation (No Background Jobs)

**Context**: Needed to decide when to recalculate user ranks after XP changes — eagerly (in the same transaction) or lazily (via background job).

**Decision**: Eager computation in `awardXp()` — rank is recalculated within the same database transaction that awards XP. No background jobs or cron for rank updates.

**Consequence**: Rank is always accurate and up-to-date immediately after any XP event. Simple architecture — no job queue needed. Trade-off: slightly more work per XP transaction, but rank computation is a trivial O(1) comparison against 4 thresholds, so the overhead is negligible.

---

## ADR-019: Redis-Based Presence (No DB Model)

**Context**: Needed online user presence for the chat sidebar. Existing `UserSession` model (DB-based, 60s ping) was too heavy for real-time presence. Upstash Redis is REST-only (no Pub/Sub).

**Decision**: Redis keys with 90s TTL (`presence:{tenantId}:{userId}`) containing JSON `{userId, displayName}`. Heartbeat every 30s from `UsageTracker` (visibility-aware — pauses when tab hidden). Listing via `SCAN` + `MGET`. No database model needed.

**Consequence**: Approximate presence — users disappear ~90s after closing the tab. Very low overhead (one Redis SET per 30s per user). Silent no-op fallback when Redis not configured. Trade-off: SCAN-based listing is O(N) across all Redis keys, acceptable for <1000 concurrent users per tenant.

---

## ADR-020: Unified ChatThread Component (Replacing Two Duplicates)

**Context**: Global chat (`chat-room.tsx`, 685 lines) and module chat (`module-chat-room.tsx`, 679 lines) were copy-pasted with ~90% identical code. Theme definitions, nick colors, mention detection, URL rendering, scroll handling, polling logic — all duplicated.

**Decision**: Extract shared utilities into `chat-engine.ts`, transport logic into `useChat` hook, labels into `chat-labels.ts`, and rendering into a single `ChatThread` component with `variant="full"` (global) and `variant="embedded"` (module). Conditional features (topic bar, mentor badges, confirm buttons) controlled by `scope` and props.

**Consequence**: Single source of truth for all chat UI and behavior. Adding features (SSE, presence) only needs one change. Trade-off: slightly more complex prop surface on `ChatThread`, but eliminates ~700 lines of duplicated code.

---

## ADR-021: Interactive Transactions for XP Operations

**Context**: Technical audit (Phase 9) revealed a TOCTOU race condition in `awardXp()` — the `findUnique` read happened outside the `$transaction([...])` batch. Two concurrent calls for the same user could read the same balance and both write, resulting in incorrect XP totals.

**Decision**: Convert all XP mutation functions (`awardXp`, `deductXp`) from batched `$transaction([...])` to interactive `$transaction(async (tx) => {...})`. The read is now inside the transaction callback, acquiring a row-level lock automatically via Prisma's `findUnique` within an interactive transaction.

**Consequence**: No race conditions in concurrent XP operations. Row-level locks prevent two simultaneous awards from corrupting the balance. Slightly longer transaction hold time (read + write instead of just write), but XP operations are infrequent enough that contention is negligible.

---

## ADR-022: Atomic Reward Redemptions

**Context**: Technical audit found that `redeemReward()` created the redemption record inside `$transaction` but called `deductXp()` after the transaction completed. If XP deduction failed, the redemption existed without XP being deducted — an orphaned state.

**Decision**: Inline XP deduction logic directly into the interactive transaction that creates the redemption. Same pattern for `reviewRedemption()` — approval/rejection + XP operations are fully atomic.

**Consequence**: No orphaned redemptions. Stock decrement, XP deduction, and redemption record creation all succeed or all fail together. Trade-off: the `deductXp()` helper is no longer used for reward operations (logic is inlined), but this is acceptable for correctness.

---

## ADR-023: Transactional Production Migrations

**Context**: Technical audit found that if statement N+1 in a migration failed, statements 1..N were already committed but the migration was not marked as applied. Re-running would retry all statements, which is unsafe for non-idempotent operations (UPDATE, backfill).

**Decision**: Wrap each migration's statements in `BEGIN/COMMIT` with `ROLLBACK` on failure. Exception: `ALTER TYPE ... ADD VALUE` statements cannot run inside PostgreSQL transactions, so they are detected via regex and executed before the transaction begins.

**Consequence**: Migrations are all-or-nothing — partial application is no longer possible. The `_applied_migrations` record is inserted within the same transaction, so it's only marked as applied if all statements succeeded. Trade-off: enum value additions are still non-transactional (PostgreSQL limitation), but these are inherently idempotent.

---

## ADR-024: HMAC-Signed Attendance Confirmation

**Context**: Needed a way for users to confirm event attendance via email link without requiring authentication. The link must be tamper-proof and tied to a specific user/event/tenant.

**Decision**: HMAC-SHA256 signed tokens with payload `eventId:userId:tenantId`, signed with `CRON_SECRET`. Validated server-side at `/api/attendance/confirm`. XP award is idempotent via `xpAwarded` flag on `LiveEventAttendance` + partial unique index on `XpTransaction`.

**Consequence**: Passwordless attendance confirmation via email. Tokens cannot be forged without `CRON_SECRET`. Idempotent — clicking the link multiple times won't double-award XP. Trade-off: if `CRON_SECRET` is rotated, existing confirmation links become invalid.
