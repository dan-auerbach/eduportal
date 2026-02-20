# Deployment

## Hosting Environment

- **Platform**: Vercel (Serverless Functions + Edge Middleware)
- **Database**: Neon PostgreSQL (serverless)
- **CDN**: Vercel Edge Network
- **File Storage**: Vercel Blob (production)
- **Rate Limiting**: Upstash Redis (serverless)

## Build Process

The build command (`npm run build`) executes two steps:

```bash
npx tsx prisma/migrate-prod.ts && next build
```

1. **`prisma/migrate-prod.ts`**: Runs pending SQL migrations against the production Neon database using `@neondatabase/serverless` Pool. Tracks applied migrations in `_applied_migrations` table. Idempotent.

2. **`next build`**: Compiles the Next.js application with Turbopack. Generates static pages, server components, and API routes.

### Prisma Client Generation

The `postinstall` hook runs `prisma generate` after `npm install`, generating the Prisma client to `src/generated/prisma/`. This directory is tracked in git (required for Turbopack alias resolution).

## Deploy Flow

### Automatic (Primary)

1. Push to `main` branch
2. Vercel auto-detects push and triggers build
3. `npm install` runs (with `postinstall` -> `prisma generate`)
4. `npm run build` runs migrations + builds Next.js
5. Deploy to Vercel Edge Network
6. Vercel webhook triggers GitHub Action for auto-changelog generation

### Manual

```bash
# Via Vercel CLI
npx vercel --prod
```

## CI/CD

### Vercel (Build & Deploy)

Vercel handles the entire CI/CD pipeline:
- **Build**: `npm run build`
- **Install**: `npm install`
- **Node.js**: 20.x (auto-detected)
- **Framework**: Next.js (auto-detected)

### GitHub Actions (Changelog)

A GitHub Action (`ci: add GitHub Action to auto-trigger changelog after deploy`) triggers on Vercel deploy webhook:
1. Vercel deploy completes
2. Webhook hits `/api/webhooks/deploy`
3. Deploy webhook triggers changelog generation via Claude API
4. ChangelogEntry record created in DB
5. Visible on the Updates page

## Required Environment Variables (Vercel)

### Core

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string | Yes |
| `AUTH_SECRET` | NextAuth.js JWT secret (32+ char base64) | Yes |
| `NEXT_PUBLIC_APP_URL` | Public URL (e.g., `https://your-app.vercel.app`) | Yes |

### Storage

| Variable | Description | Required |
|---|---|---|
| `STORAGE_BACKEND` | Set to `vercel-blob` for production | Yes |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access token | Yes |

### Email

| Variable | Description | Required |
|---|---|---|
| `RESEND_API_KEY` | Resend email API key | Yes |
| `EMAIL_FROM` | Sender address (e.g., `Mentor <noreply@domain.com>`) | Yes |

### AI

| Variable | Description | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API key | For AI features |
| `OPENAI_API_KEY` | OpenAI API key (DALL-E 3) | For AI cover images |

### Video

| Variable | Description | Required |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | For video features |
| `CLOUDFLARE_STREAM_API_TOKEN` | Cloudflare Stream API token | For video features |

### Speech-to-Text

| Variable | Description | Required |
|---|---|---|
| `SONIOX_API_KEY` | Soniox API key | For AI Builder (video) |

### Rate Limiting

| Variable | Description | Required |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | Recommended |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | Recommended |

### Cron

| Variable | Description | Required |
|---|---|---|
| `CRON_SECRET` | Secret for Vercel Cron job auth | Yes |

## Cron Jobs

Defined in `vercel.json`:

| Job | Schedule | Description |
|---|---|---|
| `/api/cron/deadline-reminders` | Daily 08:00 UTC | Email deadline reminders |
| `/api/cron/dedup-cleanup` | Weekly Sun 03:00 UTC | Clean old notification dedup records |
| `/api/cron/live-reminders` | Daily 07:00 UTC | Email live event reminders (supports online/physical/hybrid locations) |
| `/api/cron/knowledge-digest` | Daily 08:00 UTC | Email knowledge digest |
| `/api/cron/compliance-check` | Daily 06:00 UTC | Check for expiring/expired module certifications |

## API Routes (Non-Cron)

| Route | Method | Description |
|---|---|---|
| `/api/attendance/confirm` | GET | HMAC-signed email link for confirming event attendance (awards XP) |
| `/api/chat` | GET/POST | Chat message polling and sending |
| `/api/chat/stream` | GET | SSE stream for real-time chat messages |
| `/api/presence/ping` | POST | Presence heartbeat |
| `/api/presence/online` | GET | List online users |

## Rollback Procedure

### Application Rollback

1. Go to Vercel Dashboard -> Deployments
2. Find the previous working deployment
3. Click "..." -> "Promote to Production"
4. The previous deployment is instantly promoted

### Database Rollback

Database migrations are forward-only (no down migrations). For emergency rollback:

1. Take a backup via Neon console (point-in-time recovery)
2. Restore to a branch
3. Verify data integrity
4. Promote restored branch

**TODO: Needs manual verification** — Neon's point-in-time recovery window and exact restore procedure should be verified with the Neon console settings.

## Security Headers

Configured in `next.config.ts`:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=63072000`
- `Content-Security-Policy` (restrictive CSP with explicit domain allowlist)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

## Cache Headers

- `/api/logos/*`, `/api/covers/*`: `public, max-age=3600, stale-while-revalidate=86400`
