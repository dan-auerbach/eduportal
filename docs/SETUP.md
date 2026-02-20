# Local Development Setup

## Prerequisites

- **Node.js** 20+ (required by Next.js 16)
- **npm** (bundled with Node.js)
- **PostgreSQL** database (Neon recommended, local PostgreSQL also works)

## Clone & Install

```bash
git clone <repository-url>
cd eduportal
npm install
```

The `postinstall` script automatically runs `prisma generate` to create the Prisma client.

## Environment Setup

Create `.env.local` from the required variables below:

```bash
# Required
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"
AUTH_SECRET="generate-with-openssl-rand-base64-32"

# Storage (for local dev, omit these to use local filesystem)
# STORAGE_BACKEND="vercel-blob"
# BLOB_READ_WRITE_TOKEN=""

# Email (optional for dev — emails will be skipped without this)
# RESEND_API_KEY=""
# EMAIL_FROM="Mentor <noreply@yourdomain.com>"

# AI (required for AI features)
ANTHROPIC_API_KEY=""

# AI Cover Image (optional — DALL-E 3)
# OPENAI_API_KEY=""

# Video (required for video upload features)
CLOUDFLARE_ACCOUNT_ID=""
CLOUDFLARE_STREAM_API_TOKEN=""

# Speech-to-Text (required for AI Builder video transcription)
# SONIOX_API_KEY=""

# Rate Limiting (optional — falls back to in-memory without these)
# UPSTASH_REDIS_REST_URL=""
# UPSTASH_REDIS_REST_TOKEN=""

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Cron auth (for Vercel Cron jobs + attendance HMAC tokens)
# CRON_SECRET=""
```

## Database Setup

### Option A: Neon (Recommended)

1. Create a Neon project at [neon.tech](https://neon.tech)
2. Copy the connection string to `DATABASE_URL`

### Option B: Local PostgreSQL

```bash
createdb mentor
# Set DATABASE_URL="postgresql://localhost/mentor"
```

### Push Schema & Seed

```bash
# Push schema to database (creates tables)
npx prisma db push

# Seed with sample data
npx prisma db seed
```

Seed creates:
- 2 tenants (Alfa, Beta)
- Owner account: `owner@mentor.si` / `owner123`
- Admin accounts: `admin@mentor.si` / `admin123`, `moderator@mentor.si` / `admin123`
- Employee accounts: `janez@mentor.si`, `mojca@mentor.si`, `petra@mentor.si` / `geslo123`
- Beta accounts: `beta-admin@mentor.si` / `admin123`, `ana@mentor.si`, `luka@mentor.si` / `geslo123`
- Sample modules, groups, tags, quizzes, notifications

## Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Login with any seeded account.

## Prisma Studio

```bash
npx prisma studio
```

Opens a GUI database browser at [http://localhost:5555](http://localhost:5555).

## Linting

```bash
npm run lint
```

## Build

```bash
npx next build
```

Note: `npm run build` runs migrations first (requires prod DATABASE_URL). Use `npx next build` for local build testing.

## Testing

```bash
# Install browsers (first time)
npx playwright install

# Run E2E tests
npx playwright test

# Run with UI
npx playwright test --ui
```

## File Storage (Development)

In development, files are stored locally in `./storage/uploads/`. This directory is gitignored. Cover images and logos are served via API routes (`/api/covers/[filename]`, `/api/logos/[filename]`).

## Troubleshooting

### `prisma generate` fails
Ensure `DATABASE_URL` is set. Run `npx prisma generate` manually.

### Port 3000 in use
```bash
npx next dev -p 3001
```

### Database connection issues with Neon
Ensure the connection string includes `?sslmode=require`. Neon requires SSL connections.

### Turbopack alias error
The `@/generated/prisma` alias is configured in `next.config.ts` under `turbopack.resolveAlias`. Ensure `src/generated/prisma/` exists (created by `prisma generate`).
