# Development Changelog

Development period: ~4 weeks (late January 2026 - mid/late February 2026).

## Phase 1: Foundation (Jan 2026)

### Initial Platform
- Multi-tenant architecture with Tenant, Membership, User models
- NextAuth.js v5 credentials auth with JWT strategy
- Module editor with TipTap rich text editor
- Section-based learning content (TEXT, VIDEO types)
- Quiz engine (SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE)
- Certificate generation on module completion
- Group-based module assignment with deadlines
- Tag system for module organization
- Comment system (threaded, with resolve)
- Notification system (in-app)
- Audit logging (comprehensive action trail)
- Fine-grained permission system (11 capabilities with scope)
- i18n support (Slovenian + English)
- Dashboard with progress tracking

### UX Improvements
- Visual hierarchy redesign
- Dashboard hero CTA
- Mobile-responsive layout
- shadcn/ui component library (new-york style)

## Phase 2: Content & Features (Early Feb 2026)

### Categories & Pinning
- Module categories (admin-manageable, sortable)
- User-level module pinning
- Company-wide pinned modules

### Updates Page
- Platform changelog page (`/updates`)
- Auto-generated changelog from Vercel deploy webhook + Claude API
- GitHub Action CI/CD integration for changelog

### Knowledge Page Redesign
- Split active/completed modules
- Collapsible completed section
- Default to Active tab (drafts + published) for admins

### Progress Improvements
- Quiz as progress step (required for module completion)
- Group activity feed
- Mobile filter sheet

### Radar (Content Curation Feed)
- URL-based content sharing by employees
- Admin approval workflow (later changed to auto-approve)
- Pinning, save/bookmark
- X/Twitter-style feed layout redesign
- Larger fonts, card layout

### Live Events (Mentor v Zivo)
- Scheduled live training events
- Video conference URL integration (Zoom, Teams, Google Meet)
- Group-targeted events
- ICS calendar download
- Email reminders (daily cron)

### Chat System
- Per-tenant and per-module chat rooms
- Mentor answer confirmation
- Chat topic management
- SSE streaming for near-real-time delivery (~2s latency), automatic polling fallback
- JOIN spam removal (messages no longer created or displayed)
- Redis-based online presence with 90s TTL + sidebar widget
- Unified ChatThread component replacing two duplicate 700-line components

## Phase 3: Video & Media (Feb 2026)

### Cloudflare Stream Migration
- Migrated video uploads from Vercel Blob to Cloudflare Stream
- TUS protocol for resumable uploads
- Adaptive bitrate HLS streaming
- TUS proxy endpoint to work around CORS
- Multiple bug fixes (fingerprinting, environment variables, CSP)

### Media Library (Phase 1)
- Centralized MediaAsset model
- Video Library with inline VideoAssetPicker
- Shared video assets across sections
- Status tracking (PROCESSING, READY, FAILED)

## Phase 4: AI Features (Feb 2026)

### AI Module Builder
- End-to-end module generation pipeline
- Video source: Cloudflare Stream -> Soniox transcription -> Claude generation
- Text source: direct text input -> Claude generation
- PDF/Word document source: unpdf/mammoth extraction -> Claude generation
- Structured output with Zod validation
- Status polling UI

### AI Module Editor Improvements
- AI title + description generation (Claude)
- AI tag generation (5 tags, max 2 words)
- AI quiz generation from section content (Claude)
- AI cover image generation (DALL-E 3 + sharp processing)
- Searchable mentor multi-select (cmdk)
- Tag persistence fix (tags now saved to DB immediately)
- Quality check before publish
- Reading time estimation

## Phase 5: File Support & Cleanup (Feb 2026)

### Document Upload
- PDF and Word file upload as AI knowledge source
- Text extraction: unpdf (PDF), mammoth (DOCX/DOC)
- Vercel Blob storage for documents
- MediaAsset DOCUMENT type

### Asset Cleanup & Audit
- Reference-counted media asset cleanup
- Section-level asset cleanup on delete
- Cover image deduplication-aware cleanup
- Owner asset audit page (`/owner/assets`)
- Bulk delete with provider cleanup
- DELETE_PENDING / DELETE_FAILED status tracking

## Phase 7: Gamification, Rewards, Suggestions & Compliance (Feb 19, 2026)

### Gamification & XP Engine
- Dual XP system: `lifetimeXp` (cumulative, determines rank) + `totalXp` (spendable for rewards)
- XP awarded on module completion (100 XP), quiz high score ≥90% (50 XP), mentor answer confirmation (25 XP), popular suggestion (75 XP), compliance renewal (50 XP), manual admin award
- Custom reputation ranks: VAJENEC (0) → POMOCNIK (1500) → MOJSTER (3500) → MENTOR (6000)
- Rank never decreases when spending XP — based on lifetimeXp only
- Leaderboard page with tenant-wide and per-group views
- XP balance display in header and profile
- Rank badges with custom icons (GraduationCap, Wrench, Award, Star)
- Backfill script for retroactive XP awards from existing achievements

### Reward Economy
- Admin-managed reward catalog (title, description, XP cost, stock, monthly limit)
- Employee redemption with balance check and stock validation
- Optional admin approval workflow (auto-approve or require review)
- Pending redemptions admin panel with approve/reject
- Redemption history for employees
- Rate-limited redemption (5/minute)

### Knowledge Suggestions
- Employee-submitted knowledge ideas with title, description, link
- Anonymous submission option (author hidden in UI, stored for audit)
- Voting system with optimistic UI (toggle vote)
- Threaded comments on suggestions
- Status workflow: OPEN → APPROVED / REJECTED / CONVERTED
- Convert suggestion to draft module (admin action)
- Popular suggestion notifications (≥5 votes threshold)
- Sort by popularity or newest

### Manager Dashboard
- KPI cards: at-risk users, average engagement, completion rate, active suggestions
- Risk table: users with overdue deadlines, days overdue, module name
- Completion heatmap: groups × modules with percentage
- Top performers: sorted by lifetimeXp with rank badges
- Group filter for scoped views

### Compliance & Module Validity
- `validityMonths` field on Module (optional expiry period)
- Daily cron job (`/api/cron/compliance-check`): 30-day advance reminders + automatic progress reset on expiry
- Admin compliance page: expiring/expired modules, reassign workflow
- XP bonus for timely compliance renewal

### Database
- 7 new tables: XpTransaction, UserXpBalance, Reward, RewardRedemption, KnowledgeSuggestion, KnowledgeSuggestionVote, KnowledgeSuggestionComment
- 4 new enums: XpSourceType, RedemptionStatus, SuggestionStatus, ReputationRank
- 13 new AuditAction values, 7 new NotificationType values, 3 new Permission values
- 3 production migrations (gamification + rank rename + lifetimeXp)

### Navigation
- Employee sidebar: Leaderboard, Rewards, Suggestions
- Admin sidebar: Rewards management, Suggestions moderation, Manager Dashboard, Compliance

## Phase 6: Stability & Documentation (Late Feb 2026)

### Stale Tenant Cookie Fix
- Login redirect loop caused by stale `mentor-tenant` cookie (1-year maxAge)
- Symptom: user could login in incognito but not in normal browser
- Root cause: cookie pointed to deleted/archived tenant or tenant where user lost membership
- Fix: `_autoSelectTenant()` helper in `tenant.ts` — detects invalid cookie, clears it, and falls back to auto-select logic
- Extracted reusable helper to avoid duplicating auto-select logic in error paths

### Technical Documentation
- Created `/docs` directory with 12 comprehensive documentation files
- README.md, ARCHITECTURE.md, TECH_STACK.md, DB_SCHEMA.md, API.md
- SETUP.md, DEPLOYMENT.md, OPERATIONS.md, SECURITY.md
- DECISIONS.md (15 ADRs), CHANGELOG.md, SNAPSHOT.json
- All documentation based on actual code analysis with version tracking

## Notable Bug Fixes

- VideoAssetPicker dialog overflow (multiple attempts)
- TUS upload CORS issues (fingerprinting, proxy endpoint)
- Cloudflare Stream API token env var naming
- CF downloads API response format (object, not array)
- Quiz navigation broken by progress formula change
- Cover image preview not updating after AI generation (useEffect sync)
- Stale tenant cookie causing login redirect loops (_autoSelectTenant cookie cleanup)
- AI builder pipeline trigger (browser-side instead of server action)
- Timezone handling for live events (Europe/Ljubljana)
- Module save before publish
- TargetVideo player ID parsing

## Infrastructure & DevOps

- Custom production migration script (`migrate-prod.ts`)
- Vercel Cron jobs: deadline reminders, dedup cleanup, live reminders, knowledge digest
- Auto-changelog generation (GitHub Action + Claude API + deploy webhook)
- Rate limiting infrastructure (Upstash Redis + in-memory fallback)
- Redis presence store (Upstash, 90s TTL keys, heartbeat every 30s)
- SSE endpoint with DB-polling (2s interval, 25s connection, auto-reconnect)
- Storage abstraction layer (local filesystem + Vercel Blob)
- Security headers (CSP, HSTS, X-Frame-Options, etc.)
- Email system (Resend + templates + unsubscribe)
- Technical documentation system (`/docs` — 12 files, 1700+ lines)
