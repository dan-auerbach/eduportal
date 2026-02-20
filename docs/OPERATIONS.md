# Operations

## Monitoring

### Application Monitoring

- **Vercel Dashboard**: Request metrics, function execution times, error rates, cold starts
- **Vercel Function Logs**: Real-time serverless function logs (stdout/stderr)

### Database Monitoring

- **Neon Console**: Connection count, query latency, storage usage, compute hours
- **TODO: Needs manual verification** — Verify Neon's built-in monitoring capabilities and alerting options.

### External Service Monitoring

| Service | Monitoring |
|---|---|
| Cloudflare Stream | Cloudflare Dashboard — video processing status, storage usage |
| Upstash Redis | Upstash Console — request count, latency, memory |
| Resend | Resend Dashboard — email delivery rates, bounces |
| Soniox | API responses only — no dedicated dashboard integration |

## Logging

### Application Logs

The application uses `console.log`, `console.error`, and `console.warn` for logging. Key log prefixes:

| Prefix | Source |
|---|---|
| `[email]` | Email sending (Resend) |
| `[soniox]` | Speech-to-text transcription |
| `[ai]` | AI module generation |
| `[cf-stream]` | Cloudflare Stream operations |
| `[migrate]` | Database migration script |
| `[asset-cleanup]` | Media asset cleanup operations |

Logs are available in:
- **Development**: Terminal output
- **Production**: Vercel Function Logs (Vercel Dashboard -> Deployments -> Logs)

### Audit Log

All significant actions are recorded in the `AuditLog` table with:
- Actor (user ID)
- Tenant
- Action type (45 defined actions)
- Entity type and ID
- Optional metadata (JSON)
- IP address
- Timestamp

Viewable in the admin panel at `/admin/audit-log`.

## Backup Strategy

### Database

- **Neon**: Provides automatic point-in-time recovery within the plan's retention window
- **Manual Export**: Owner can export tenant data via `/api/owner/tenants/[id]/export` (JSON backup of all tenant data)
- **TODO: Needs manual verification** — Neon backup retention period depends on the plan. Verify in Neon console.

### File Storage

- **Vercel Blob**: Managed by Vercel. No automated backup configuration detected.
- **Cloudflare Stream**: Managed by Cloudflare. Videos persist until explicitly deleted.
- **TODO: Needs manual verification** — Consider implementing a backup strategy for Vercel Blob assets.

### Backup Schedule

No automated backup schedule beyond Neon's built-in features. Tenant data export is manual (owner-triggered).

## Debugging Production

### Common Issues

#### 1. Server Action fails silently
- Check Vercel Function Logs for error output
- Server actions return `ActionResult<T>` — check for `{ success: false, error: "..." }`

#### 2. AI features not working
- Verify `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` are set in Vercel env vars
- Check rate limit: AI editor actions have a 30/hour per-user limit
- Check Vercel logs for `[ai]` prefixed messages

#### 3. Video upload fails
- Verify `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_STREAM_API_TOKEN`
- Check Cloudflare Stream dashboard for processing errors
- TUS upload uses a proxy endpoint — check `/api/videos/tus-upload` logs

#### 4. Emails not sending
- Verify `RESEND_API_KEY` and `EMAIL_FROM` in env vars
- Check Resend dashboard for delivery status
- Logs prefixed with `[email]` will show errors

#### 5. Database migration issues
- Migration runs as part of build: `npx tsx prisma/migrate-prod.ts`
- Check build logs for `[migrate]` prefixed messages
- Migrations are idempotent — re-running is safe

#### 6. Rate limiting not working cross-instance
- Verify `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
- Without Redis, rate limiting falls back to in-memory (per-instance, not shared)

#### 7. Chat SSE not connecting
- SSE requires Vercel Pro plan (`maxDuration: 30` in `vercel.json`)
- If SSE fails, the client automatically falls back to adaptive polling (5-15s)
- Check browser DevTools → Network for `/api/chat/stream` requests
- Rate limit: 6 SSE connections per 60s per user

#### 8. Online presence not showing
- Requires Upstash Redis — presence is Redis-only (no DB fallback)
- Heartbeat sent every 30s from `UsageTracker` — only when tab is visible
- Keys expire after 90s — users disappear ~90s after closing the tab
- Check Redis keys: `presence:{tenantId}:*` in Upstash console

#### 9. XP / Gamification issues
- **User has wrong rank**: Check `UserXpBalance.lifetimeXp` — rank is computed from lifetime XP only. Run: `SELECT "lifetimeXp", "totalXp", "rank" FROM "UserXpBalance" WHERE "userId" = '...' AND "tenantId" = '...'`
- **XP not awarded after module completion**: Check `XpTransaction` for existing record (idempotent — won't double-award). Verify `awardXp()` is called in `completeSection()` after all sections + quiz done.
- **Reward redemption fails**: Check `totalXp` (spendable) >= `costXp`. Check `monthlyLimit` (count approved redemptions this month). Check `quantityAvailable`.
- **Manual XP award**: Admin can use the manual XP award action (requires MANAGE_REWARDS permission).
- **Backfill XP**: Script at `scripts/backfill-xp.ts` — idempotent, scans certificates, quiz attempts, confirmed answers.

```sql
-- Check user XP balance
SELECT u.email, xb."lifetimeXp", xb."totalXp", xb."rank"
FROM "UserXpBalance" xb
JOIN "User" u ON u.id = xb."userId"
WHERE xb."tenantId" = '...'
ORDER BY xb."lifetimeXp" DESC;

-- Recent XP transactions for a user
SELECT xt.amount, xt.source, xt.description, xt."createdAt"
FROM "XpTransaction" xt
WHERE xt."userId" = '...' AND xt."tenantId" = '...'
ORDER BY xt."createdAt" DESC
LIMIT 20;
```

#### 7. Login redirect loops (works in incognito, not in normal browser)
- **Symptom**: User can log in via incognito but gets redirect loop in normal browser
- **Root cause**: Stale `mentor-tenant` cookie (1-year maxAge) pointing to a deleted/archived tenant or a tenant where the user lost membership
- **Diagnosis**: Check the `mentor-tenant` cookie value in browser DevTools → Application → Cookies. Verify the tenant ID exists and the user has an active membership for it.
- **Automatic fix**: `_autoSelectTenant()` in `src/lib/tenant.ts` detects invalid cookies, clears them, and falls back to auto-select logic
- **Manual fix**: Clear the `mentor-tenant` cookie in the browser, or clear all site cookies and re-login

### Accessing Production Data

1. **Prisma Studio** (with prod DATABASE_URL): `DATABASE_URL="..." npx prisma studio`
2. **Neon SQL Editor**: Available in Neon console
3. **Tenant Export**: Owner can export full tenant data via the UI

### Key Database Queries

```sql
-- Active users per tenant
SELECT t.name, COUNT(m.id) as users
FROM "Tenant" t
JOIN "Membership" m ON m."tenantId" = t.id
GROUP BY t.name;

-- Module completion rates
SELECT m.title,
  COUNT(DISTINCT sc."userId") as completed_users
FROM "Module" m
JOIN "Section" s ON s."moduleId" = m.id
JOIN "SectionCompletion" sc ON sc."sectionId" = s.id
GROUP BY m.id, m.title;

-- Recent audit log entries
SELECT al.action, al."entityType", al."createdAt", u.email
FROM "AuditLog" al
LEFT JOIN "User" u ON u.id = al."actorId"
ORDER BY al."createdAt" DESC
LIMIT 20;
```

## Incident Response Runbook

### 1. Application Down (500 errors)

1. Check Vercel Dashboard -> Deployments -> latest deployment status
2. Check Vercel Function Logs for errors
3. If database-related: Check Neon console for connection issues
4. **Rollback**: Promote previous deployment in Vercel Dashboard

### 2. Database Unreachable

1. Check Neon status page
2. Verify `DATABASE_URL` in Vercel env vars
3. Check Neon console for compute auto-suspend settings (Neon may have suspended the compute endpoint)
4. If Neon outage: Application will fail gracefully — rate limiting falls back to in-memory

### 3. High Error Rate

1. Check Vercel Function Logs for recurring error patterns
2. Check Neon connection count (may hit pool limits)
3. Check Upstash dashboard for Redis errors
4. Check Cloudflare dashboard if video-related

### 4. Email Delivery Issues

1. Check Resend dashboard for bounces/failures
2. Verify domain DNS records (SPF, DKIM, DMARC) in Resend
3. Check if rate limited by Resend (transient retry logic exists in code)
4. Review `[email]` prefixed logs in Vercel

### 5. AI Service Degraded

1. Check Anthropic status page for API outages
2. Check OpenAI status page for DALL-E issues
3. Check rate limit counters in Upstash Redis: keys `ai:editor:*`, `ai:build:*`
4. AI failures are non-critical — the app functions without AI features

### 6. Video Upload/Playback Issues

1. Check Cloudflare Stream dashboard for processing status
2. Verify API token hasn't expired
3. Check CSP headers in `next.config.ts` for allowed domains
4. TUS upload errors: check `/api/videos/tus-upload` route logs

### 7. Login Redirect Loops

1. Check if the user's `mentor-tenant` cookie points to a valid, non-archived tenant
2. Verify the user still has an active `Membership` for that tenant
3. `_autoSelectTenant()` in `src/lib/tenant.ts` should auto-clear stale cookies — check Vercel Function Logs for errors
4. If persistent: instruct the user to clear site cookies and re-login
5. Check for edge cases: tenant recently archived, user recently removed from tenant
