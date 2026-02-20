# Tech Stack

## Core

| Component | Technology | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 20+ | Required by Next.js 16 |
| Language | TypeScript | ^5 | Strict mode enabled |
| Framework | Next.js | 16.1.6 | App Router, Turbopack |
| React | React | 19.2.3 | Server Components + Client Components |
| Database | PostgreSQL | 17 (Neon) | Serverless PostgreSQL |
| ORM | Prisma | 7.3.0 | With `@prisma/adapter-neon` |
| Auth | NextAuth.js | 5.0.0-beta.30 | v5 beta, JWT strategy |
| Hosting | Vercel | - | Serverless Functions, Edge Middleware |

## Frontend

| Component | Technology | Version |
|---|---|---|
| CSS Framework | Tailwind CSS | v4 |
| CSS Processing | @tailwindcss/postcss | ^4 |
| UI Components | shadcn/ui (Radix + CVA) | new-york style |
| Icons | Lucide React | ^0.563.0 |
| Rich Text Editor | TipTap | ^3.19.0 |
| Drag & Drop | @dnd-kit | core ^6.3.1, sortable ^10.0.0 |
| Forms | React Hook Form | ^7.71.1 |
| Form Validation | @hookform/resolvers + Zod | ^5.2.2 |
| Charts | Recharts | ^3.7.0 |
| Date Utilities | date-fns | ^4.1.0 |
| Combobox/Command | cmdk | ^1.1.1 |
| File Upload | react-dropzone | ^14.4.0 |
| Theming | next-themes | ^0.4.6 |
| Toasts | Sonner | ^2.0.7 |
| Data Fetching | @tanstack/react-query | ^5.90.20 |

## Backend / Infrastructure

| Component | Technology | Version |
|---|---|---|
| Database Driver | @neondatabase/serverless | ^1.0.2 |
| Rate Limiting + Presence | @upstash/ratelimit + @upstash/redis | ^2.0.8 / ^1.36.2 |
| File Storage (prod) | @vercel/blob | ^2.2.0 |
| File Storage (dev) | Local filesystem | ./storage/uploads |
| Email | Resend | ^6.9.1 |
| Password Hashing | bcryptjs | ^3.0.3 |
| HTML Sanitization | sanitize-html | ^2.17.0 |
| Image Processing | sharp | ^0.34.5 |
| Validation | Zod | ^4.3.6 |
| Compression | fflate | ^0.8.2 |
| JWT (email tokens) | jose (via next-auth) | - |

## AI & Media

| Component | Technology | Version | Purpose |
|---|---|---|---|
| AI (text generation) | Anthropic Claude | ^0.74.0 SDK | Module drafts, metadata, tags, quizzes |
| AI Model | claude-sonnet-4-20250514 | - | All text generation tasks |
| AI (image generation) | OpenAI DALL-E 3 | ^6.22.0 SDK | Cover image generation |
| Video Hosting | Cloudflare Stream | API v4 | TUS upload, HLS streaming |
| Video Upload | tus-js-client | ^4.3.1 | Resumable uploads to CF Stream |
| Speech-to-Text | Soniox | API v1 | Audio transcription (sl/en) |
| PDF Extraction | unpdf | ^1.4.0 | Serverless-compatible PDF text extraction |
| Word Extraction | mammoth | ^1.11.0 | DOCX/DOC text extraction |

## Development & Testing

| Component | Technology | Version |
|---|---|---|
| Linting | ESLint | ^9 |
| ESLint Config | eslint-config-next | 16.1.6 |
| E2E Testing | Playwright | ^1.58.2 |
| Build Tool | Turbopack | (bundled with Next.js 16) |
| Code Runner | tsx | ^4.21.0 |
| UI Component CLI | shadcn | ^3.8.4 |
| Animations | tw-animate-css | ^1.4.0 |

## CI/CD

| Component | Technology | Notes |
|---|---|---|
| Hosting / Deploy | Vercel | Auto-deploy on push to main |
| Cron Jobs | Vercel Cron | 5 scheduled jobs (vercel.json) |
| Changelog Auto-gen | GitHub Actions | On deploy webhook -> Claude API |

## i18n

| Locale | Status |
|---|---|
| Slovenian (sl) | Primary, fully translated |
| English (en) | Secondary, fully translated |

Locale is configured per-tenant (`Tenant.locale`). Module-level singleton `setLocale()` / `t()` for server-side rendering.

## Stack Rationale

- **Next.js 16 App Router**: Full-stack React with RSC for fast server-rendered pages, Server Actions for mutations, Edge Middleware for auth.
- **Neon PostgreSQL**: Serverless Postgres compatible with Vercel's ephemeral compute model. Branching support for development.
- **Prisma + Neon Adapter**: Type-safe ORM with serverless-compatible connection pooling via `@prisma/adapter-neon`.
- **Vercel Blob**: Zero-config file storage integrated with Vercel's CDN. Falls back to local filesystem for development.
- **Cloudflare Stream**: Purpose-built video hosting with adaptive bitrate streaming. TUS protocol for resumable large uploads.
- **Claude API**: Slovenian language support was a key requirement. Claude handles sl/en content generation effectively.
- **Upstash Redis**: Serverless Redis with REST API — works across Vercel function instances without persistent connections. Used for rate limiting and online presence (TTL-based keys).
