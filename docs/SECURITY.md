# Security

## Authentication Model

### NextAuth.js v5 (JWT Strategy)

- **Provider**: Credentials (email + password)
- **Session Storage**: JWT in HTTP-only cookie
- **Session Duration**: 24 hours
- **Password Hashing**: bcryptjs (12 rounds)
- **Login Rate Limiting**: 5 attempts per email per 15 minutes

### JWT Token Contents

```typescript
{
  id: string;       // User ID
  role: Role;        // Global role (OWNER, SUPER_ADMIN, ADMIN, EMPLOYEE)
  firstName: string;
  lastName: string;
  roleRefreshedAt: number; // Timestamp of last DB role refresh
}
```

Role is refreshed from the database every 5 minutes to prevent stale permissions in the JWT.

### Password Reset Flow

1. User requests reset -> `EmailToken` created (type: PASSWORD_RESET, expires in 1 hour)
2. Reset link sent via Resend email
3. User sets new password with token -> token marked as used
4. Rate limited to prevent abuse

## Role-Based Access Control (RBAC)

### Two-Level Role System

**Global Roles** (on `User` model):
| Role | Access Level |
|---|---|
| OWNER | Full platform access, can impersonate any tenant |
| SUPER_ADMIN | Administrative access |
| ADMIN | Content management access |
| EMPLOYEE | Standard user access |

**Tenant Roles** (on `Membership` model):
| Role | Hierarchy | Access Level |
|---|---|---|
| OWNER | 6 | Full access (global OWNER mapped here) |
| SUPER_ADMIN | 5 | Bypasses all permission checks within tenant |
| ADMIN | 4 | Content management, user management |
| HR | 3 | User/group management, progress viewing |
| EMPLOYEE | 2 | Learning content access |
| VIEWER | 1 | Read-only access |

### Fine-Grained Permissions

`UserPermission` records with 11 capabilities:

| Permission | Description |
|---|---|
| MANAGE_ALL_MODULES | CRUD all modules in tenant |
| MANAGE_OWN_MODULES | CRUD only modules created by this user |
| VIEW_ALL_PROGRESS | View all user progress |
| VIEW_GROUP_PROGRESS | View progress for specific groups |
| MANAGE_USERS | Create/edit/deactivate users |
| MANAGE_GROUPS | Create/edit/delete groups |
| MANAGE_QUIZZES | Create/edit quizzes |
| OVERRIDE_PROGRESS | Manually override user progress |
| VIEW_ANALYTICS | Access analytics dashboard |
| VIEW_AUDIT_LOG | Access audit log |
| EXPORT_REPORTS | Export data reports |

Permissions support **scoped access** via JSON scope:
```typescript
{ groupIds?: string[], moduleIds?: string[] }
```

### Permission Check Flow

```
1. OWNER (global) → always allowed
2. SUPER_ADMIN (tenant membership) → always allowed
3. Check UserPermission record for (userId, permission, tenantId)
4. Validate scope restrictions (groupIds, moduleIds)
5. Check fallback permission (if configured)
6. Deny → ForbiddenError
```

## Route Protection

### Middleware (`src/middleware.ts`)

- Edge middleware intercepts all routes
- Redirects unauthenticated users to `/auth/login`
- Role-based route groups: `/owner/*` (OWNER only), `/admin/*` (ADMIN+)
- Public paths explicitly allowlisted

### Server Action Protection

Every server action:
1. Calls `getTenantContext()` to verify auth + tenant access
2. Calls `requireTenantRole()` or `requirePermission()` for authorization
3. Validates input with Zod schemas
4. Logs action to AuditLog

## Secret Management

| Secret | Storage | Rotation |
|---|---|---|
| `AUTH_SECRET` | Vercel env var | Manual (causes session invalidation) |
| `DATABASE_URL` | Vercel env var | Via Neon console |
| `ANTHROPIC_API_KEY` | Vercel env var | Via Anthropic console |
| `OPENAI_API_KEY` | Vercel env var | Via OpenAI console |
| `RESEND_API_KEY` | Vercel env var | Via Resend console |
| `CLOUDFLARE_STREAM_API_TOKEN` | Vercel env var | Via Cloudflare console |
| `SONIOX_API_KEY` | Vercel env var | Via Soniox console |
| `UPSTASH_REDIS_REST_TOKEN` | Vercel env var | Via Upstash console |
| `BLOB_READ_WRITE_TOKEN` | Vercel env var | Via Vercel console |
| `CRON_SECRET` | Vercel env var | Manual |

All secrets stored as Vercel environment variables. `.env*` files are gitignored.

## Security Headers

Configured in `next.config.ts`:

| Header | Value |
|---|---|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| X-DNS-Prefetch-Control | on |
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |
| Content-Security-Policy | Restrictive policy with explicit domain allowlist |

### CSP Policy Details

- `default-src 'self'`
- `script-src 'self' 'unsafe-inline'` + TargetVideo player
- `img-src 'self' data: blob:` + Unsplash, Vercel Blob, YouTube, TargetVideo
- `connect-src 'self'` + Vercel, Vercel Blob, TargetVideo, Cloudflare
- `frame-src` YouTube, TargetVideo, Cloudflare Stream
- `frame-ancestors 'none'`

## CSRF Protection

- Server Actions use Next.js built-in CSRF protection (same-origin check)
- API routes use session-based auth (HTTP-only cookie)
- No explicit CSRF tokens — relies on SameSite cookie attribute (`lax`)

## XSS Prevention

- **HTML Sanitization**: `sanitize-html` library used for all user-generated HTML content (TipTap editor output)
- Allowed tags: text formatting, headings, lists, links, images, tables
- Links forced to have `rel="noopener noreferrer"`
- Allowed schemes: `https`, `http`, `mailto` only
- **DOMPurify** (`dompurify` package) available as additional client-side sanitizer

## Rate Limiting

Centralized rate limiting via `src/lib/rate-limit.ts`:
- **Primary**: Upstash Redis (sliding window algorithm, cross-instance)
- **Fallback**: In-memory (per-instance, for dev or Redis outage)
- Pre-configured limits:
  - Login: 5/15min per email
  - Chat messages: 10/60s, topics: 3/60s, SSE streams: 6/60s
  - Chat polling: 30/60s
  - Confirm/unconfirm answers: 10/60s
  - Radar posts: 5/day
  - AI builds: 50/hour, AI editor: 30/hour
  - Reward redemptions: 5/60s
  - Suggestion creation: 5/hour, suggestion votes: 30/60s
  - Event attendance registration: 10/60s, attendance confirmation: 20/60s
  - File uploads: 20/hour
  - Presence heartbeat: 4/60s, presence list: 10/60s

## Input Validation

- All server action inputs validated with Zod schemas (`src/lib/validators.ts`)
- File upload validation: MIME type whitelist, extension check, size limits
- URL validation: blocked `javascript:`, `data:`, `file:`, `vbscript:`, `blob:` schemes

## Multi-Tenant Data Isolation

- All database queries scoped by `tenantId`
- `Membership` table enforces user-tenant association
- `getTenantContext()` verifies user's membership in the active tenant
- Cross-tenant access prevented by tenant-scoped unique constraints (e.g., `@@unique([name, tenantId])`)
- Module access checks verify user's group membership within the correct tenant
- **Stale cookie cleanup**: If the `mentor-tenant` cookie (1-year maxAge) points to a deleted/archived tenant or one where the user lost membership, `_autoSelectTenant()` automatically clears the invalid cookie and falls back to auto-select logic — preventing login redirect loops

## AI Integration Security

- AI API calls made server-side only (API keys never exposed to client)
- AI outputs validated with Zod schemas before use
- Rate limited: 30 AI editor actions per user per hour, 50 AI builds per user per hour
- AI-generated HTML content sanitized before storage
- AI-generated images processed through `sharp` (resize/compress) before storage

## Audit Trail

All significant actions logged to `AuditLog` with 50+ action types covering:
- User lifecycle (create, update, deactivate, delete, login)
- Module lifecycle (create, update, publish, archive, delete)
- Progress events (section completion, quiz attempt, progress override)
- Certificate issuance
- Permission changes
- Data operations (export, anonymize)
- Tenant management
- Chat confirmations
- Live event management (create, update, delete, materials add/remove)
- Event attendance (register, cancel, confirm, revoke)
- Radar moderation
- Reward management (create, update, redeem, approve, reject)
- Knowledge suggestions (XP award on create/approve)
- Email operations
- Media/asset operations

## Email Security

- Unsubscribe links use JWT tokens (90-day expiry, HS256 signed with AUTH_SECRET)
- Email templates support `{placeholder}` interpolation — not vulnerable to injection
- One-click unsubscribe via RFC 8058 compliant endpoint
- List-Unsubscribe headers included in notification emails

## Attendance Confirmation Security

- Email-based attendance confirmation uses HMAC-SHA256 signed tokens
- Token payload: `eventId:userId:tenantId`, signed with `CRON_SECRET`
- Tokens are validated server-side at `/api/attendance/confirm`
- XP awards are idempotent via `xpAwarded` flag on `LiveEventAttendance`
- Duplicate XP prevention via partial unique index on `XpTransaction(tenantId, userId, source, sourceEntityId) WHERE sourceEntityId IS NOT NULL`

## Observability & Error Tracking

- All mutation server actions wrapped in `withAction()` for structured logging and error persistence
- `withAction()` provides: requestId correlation, performance timing, tenant context tagging, automatic error capture
- Errors persisted to `SystemError` table with request ID, stack trace, tenant context
- Error reference IDs returned to users for support (e.g., `ref: abc123`)
- Owner-level error log UI at `/owner/errors` for debugging production issues
- Cron endpoints protected with `verifyCronSecret()` — guards against empty/unset `CRON_SECRET`

## Data Integrity

- **XP Operations**: `awardXp()` and `deductXp()` use Prisma interactive transactions (`$transaction(async (tx) => {...})`) with row-level locking to prevent TOCTOU race conditions
- **Reward Redemptions**: XP deduction is atomic within the same transaction as redemption creation — no orphaned redemptions possible
- **Attendance XP Reversals**: Cancel/revoke operations batch XP transaction creation + balance update in `prisma.$transaction([...])`
- **Production Migrations**: Transactional execution — non-enum statements wrapped in `BEGIN/COMMIT` with `ROLLBACK` on failure. `ALTER TYPE ... ADD VALUE` runs outside transaction (PostgreSQL limitation)

## Known Considerations

1. **CSP `unsafe-inline` for styles**: Required by Tailwind CSS. `unsafe-eval` was removed in Phase 9 audit. Consider migrating to nonces for style-src.
2. **No CAPTCHA**: Bot protection relies on rate limiting only. Consider adding CAPTCHA for login/registration.
3. **No MFA/2FA**: Authentication is single-factor (email + password). Consider adding TOTP or WebAuthn.
4. **JWT session invalidation**: No server-side session revocation. Changing AUTH_SECRET invalidates all sessions.
