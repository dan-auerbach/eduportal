# Database Schema

**Engine**: PostgreSQL 17 (Neon Serverless)
**ORM**: Prisma 7.3.0 with `@prisma/adapter-neon`
**Schema file**: `prisma/schema.prisma`

## Tables Overview

### Multi-Tenant Core

| Table | Description | Key Fields |
|---|---|---|
| **Tenant** | Company/organization | `slug` (unique), `plan`, `locale`, `theme` |
| **Membership** | User ↔ Tenant (M:N) with role | `userId`, `tenantId`, `role` (TenantRole) |

### Users & Auth

| Table | Description | Key Fields |
|---|---|---|
| **User** | Global user account | `email` (unique), `passwordHash`, `role` (global) |
| **UserPermission** | Fine-grained permissions per tenant | `userId`, `tenantId`, `permission`, `scope` (JSON) |
| **EmailToken** | Password reset & invite tokens | `token` (unique), `type`, `expiresAt` |
| **EmailPreference** | Per-user-per-tenant email settings | notification toggles and frequency |
| **UserSession** | Usage analytics tracking | `startedAt`, `lastPingAt`, `durationSeconds` |

### Learning Content

| Table | Description | Key Fields |
|---|---|---|
| **Module** | Learning module | `title`, `status`, `difficulty`, `coverImage` |
| **Section** | Chapter within a module | `title`, `content` (HTML), `type`, `sortOrder` |
| **ModuleCategory** | Module categorization | `name`, `sortOrder` per tenant |
| **Tag** | Keyword labels | `name` per tenant (unique) |
| **ModuleTag** | Module ↔ Tag (M:N) | composite PK `(moduleId, tagId)` |
| **ModuleMentor** | Module ↔ Mentor user (M:N) | composite PK `(moduleId, userId)` |
| **ModulePrerequisite** | Dependency between modules | `dependentModuleId`, `prerequisiteModuleId` |
| **Attachment** | File attachments on sections | `fileName`, `storagePath`, `fileType` |

### Progress & Assessment

| Table | Description | Key Fields |
|---|---|---|
| **SectionCompletion** | User completed a section | `userId`, `sectionId`, `completedAt` |
| **Quiz** | Quiz attached to a module | `passingScore`, `maxAttempts`, `timeLimit` |
| **QuizQuestion** | Question in a quiz | `type`, `options` (JSON), `points` |
| **QuizAttempt** | User's quiz attempt | `score`, `passed`, `answers` (JSON) |
| **Certificate** | Issued on module completion | `uniqueCode`, `issuedAt` |
| **ModuleSelfAssessment** | Self-assessment rating | `rating` (1-5), `note` |
| **ProgressOverride** | Admin override of progress | `overrideById`, `reason`, `allowCertificate` |

### Communication

| Table | Description | Key Fields |
|---|---|---|
| **ChatMessage** | Chat messages (tenant-wide + per-module) | `type`, `body`, `moduleId`, `isConfirmedAnswer` |
| **Comment** | Comments on modules (threaded) | `parentId`, `isResolved` |
| **Notification** | In-app notifications | `type`, `title`, `message`, `isRead` |
| **NotificationDedup** | Prevents duplicate notifications | `dedupKey` |

### Groups & Assignments

| Table | Description | Key Fields |
|---|---|---|
| **Group** | Employee group | `name`, `color` per tenant |
| **UserGroup** | User ↔ Group (M:N) | composite PK `(userId, groupId)` |
| **ModuleGroup** | Module ↔ Group assignment | `deadlineDays`, `isMandatory` |

### Social / Radar

| Table | Description | Key Fields |
|---|---|---|
| **MentorRadarPost** | Curated content post | `url`, `description`, `status`, `pinned` |
| **RadarSeen** | User's last-seen timestamp | per user per tenant |
| **RadarSave** | Bookmarked radar posts | `userId`, `postId` |

### Live Events

| Table | Description | Key Fields |
|---|---|---|
| **MentorLiveEvent** | Scheduled live training | `title`, `startsAt`, `meetUrl` |
| **LiveEventGroup** | Event ↔ Group (M:N) | target audience |

### Pinning

| Table | Description | Key Fields |
|---|---|---|
| **UserPinnedModule** | User's pinned modules | `pinnedAt` |
| **CompanyPinnedModule** | Company-wide pinned modules | `pinnedById` |

### AI Builder

| Table | Description | Key Fields |
|---|---|---|
| **AiModuleBuild** | AI module generation job | `sourceType`, `status`, `aiStructured` (JSON) |

### Media Library

| Table | Description | Key Fields |
|---|---|---|
| **MediaAsset** | Centralized media file | `type`, `status`, `provider`, `cfStreamUid` |

### Gamification & Rewards

| Table | Description | Key Fields |
|---|---|---|
| **XpTransaction** | Individual XP earn/spend events | `amount`, `source` (XpSourceType), `sourceEntityId` |
| **UserXpBalance** | Pre-computed XP balance per user | `lifetimeXp` (rank), `totalXp` (spendable), `rank` |
| **Reward** | Reward catalog item | `title`, `costXp`, `monthlyLimit`, `quantityAvailable`, `approvalRequired` |
| **RewardRedemption** | User redeemed a reward | `xpSpent`, `status` (RedemptionStatus), `reviewedById` |

### Knowledge Suggestions

| Table | Description | Key Fields |
|---|---|---|
| **KnowledgeSuggestion** | User-submitted knowledge idea | `title`, `description`, `status` (SuggestionStatus), `voteCount` |
| **KnowledgeSuggestionVote** | Upvote on a suggestion | `userId`, `suggestionId` (unique pair) |
| **KnowledgeSuggestionComment** | Threaded comment on suggestion | `body`, `parentId` (self-ref) |

### Audit & Changelog

| Table | Description | Key Fields |
|---|---|---|
| **AuditLog** | Audit trail for all actions | `action`, `entityType`, `entityId`, `metadata` |
| **ModuleChangeLog** | Module version history | `version`, `changeSummary` |
| **UserModuleReview** | User acknowledged module update | `lastSeenVersion` |
| **ChangelogEntry** | Platform changelog (Updates page) | `version`, `title`, `summary` |
| **UserModuleLastAccess** | Last access timestamp | analytics |

## Key Relations

```
Tenant 1:N Membership N:1 User
Tenant 1:N Module
Module 1:N Section
Module 1:N Quiz 1:N QuizQuestion
Module N:M Group (via ModuleGroup, with deadlineDays)
Module N:M Tag (via ModuleTag)
Module N:M User (via ModuleMentor — mentors)
User N:M Group (via UserGroup)
Section 1:N Attachment
Section N:1 MediaAsset (optional, shared)
User 1:N SectionCompletion
User 1:N QuizAttempt
User 1:N Certificate
User 1:N Notification
Module 1:N ChatMessage (per-module chat)
Module 1:N Comment (threaded)
User 1:N XpTransaction
User 1:1 UserXpBalance (per tenant)
User 1:N RewardRedemption
Reward 1:N RewardRedemption
User 1:N KnowledgeSuggestion
KnowledgeSuggestion 1:N KnowledgeSuggestionVote
KnowledgeSuggestion 1:N KnowledgeSuggestionComment (threaded via parentId)
```

## Enums

| Enum | Values |
|---|---|
| TenantTheme | DEFAULT, OCEAN, SUNSET |
| TenantPlan | FREE, STARTER, PRO |
| TenantRole | OWNER, SUPER_ADMIN, ADMIN, HR, EMPLOYEE, VIEWER |
| Role (global) | OWNER, SUPER_ADMIN, ADMIN, EMPLOYEE |
| Permission | MANAGE_ALL_MODULES, MANAGE_OWN_MODULES, VIEW_ALL_PROGRESS, VIEW_GROUP_PROGRESS, MANAGE_USERS, MANAGE_GROUPS, MANAGE_QUIZZES, OVERRIDE_PROGRESS, VIEW_ANALYTICS, VIEW_AUDIT_LOG, EXPORT_REPORTS, MANAGE_REWARDS, VIEW_MANAGER_DASHBOARD, MANAGE_SUGGESTIONS |
| ModuleStatus | DRAFT, PUBLISHED, ARCHIVED |
| Difficulty | BEGINNER, INTERMEDIATE, ADVANCED |
| SectionType | TEXT, VIDEO, ATTACHMENT, MIXED |
| VideoSourceType | YOUTUBE_VIMEO_URL, UPLOAD, CLOUDFLARE_STREAM, TARGETVIDEO |
| VideoStatus | PENDING, READY, ERROR |
| AttachmentType | PDF, WORD, IMAGE, OTHER |
| QuestionType | SINGLE_CHOICE, MULTIPLE_CHOICE, TRUE_FALSE |
| NotificationType | NEW_MODULE, DEADLINE_REMINDER, QUIZ_RESULT, COMMENT_REPLY, CERTIFICATE_ISSUED, PROGRESS_OVERRIDE, MODULE_UPDATED, SYSTEM, RADAR_APPROVED, RADAR_REJECTED, NEW_KNOWLEDGE, XP_EARNED, REWARD_APPROVED, REWARD_REJECTED, SUGGESTION_POPULAR, SUGGESTION_STATUS_CHANGED, MODULE_EXPIRING, MODULE_EXPIRED |
| XpSourceType | MODULE_COMPLETED, QUIZ_HIGH_SCORE, MENTOR_CONFIRMATION, TOP_SUGGESTION, COMPLIANCE_RENEWAL, MANUAL |
| ReputationRank | VAJENEC (0), POMOCNIK (1500), MOJSTER (3500), MENTOR (6000) |
| RedemptionStatus | PENDING, APPROVED, REJECTED, CANCELLED |
| SuggestionStatus | OPEN, APPROVED, REJECTED, CONVERTED |
| ChatMessageType | MESSAGE, JOIN, SYSTEM, ACTION |
| RadarPostStatus | PENDING, APPROVED, REJECTED, ARCHIVED |
| MediaAssetType | VIDEO, DOCUMENT |
| MediaAssetStatus | PROCESSING, READY, FAILED, DELETE_PENDING, DELETE_FAILED |
| MediaProvider | CLOUDFLARE_STREAM, VERCEL_BLOB |
| EmailTokenType | PASSWORD_RESET, INVITE |
| AuditAction | 45 actions (USER_CREATED through SUGGESTION_CONVERTED) |

## Indexes

All tables include tenant-scoped indexes (`tenantId` or composite). Key performance indexes:

- `Module`: `(tenantId, status)`, `(createdById)`, `(categoryId)`
- `SectionCompletion`: `(userId, sectionId)` unique, `(userId, tenantId)`
- `QuizAttempt`: `(userId, quizId)`, `(userId, tenantId, passed)`
- `Notification`: `(userId, isRead)`, `(userId, tenantId, isRead)`
- `AuditLog`: `(tenantId, createdAt)`, `(entityType, entityId)`
- `ChatMessage`: `(tenantId, createdAt)`, `(tenantId, moduleId, id)`
- `MentorRadarPost`: `(tenantId, status, approvedAt)`, `(tenantId, pinned, approvedAt)`
- `XpTransaction`: `(tenantId, userId, createdAt)`, `(tenantId, createdAt)`
- `UserXpBalance`: `(userId, tenantId)` unique, `(tenantId, lifetimeXp)`, `(tenantId, totalXp)`
- `Reward`: `(tenantId, active)`
- `RewardRedemption`: `(tenantId, userId, createdAt)`, `(tenantId, status)`, `(rewardId, createdAt)`
- `KnowledgeSuggestion`: `(tenantId, status, createdAt)`, `(tenantId, voteCount)`
- `KnowledgeSuggestionVote`: `(userId, suggestionId)` unique
- `KnowledgeSuggestionComment`: `(suggestionId, createdAt)`

## Migration System

**Development**: Standard Prisma migrations in `prisma/migrations/`.

**Production**: Custom migration script `prisma/migrate-prod.ts` that:
1. Uses `@neondatabase/serverless` Pool for direct SQL execution
2. Tracks applied migrations in `_applied_migrations` table
3. Runs as part of the build step: `npx tsx prisma/migrate-prod.ts && next build`
4. Idempotent — safe to re-run on every deploy

### Applied Migrations

| Migration | Description |
|---|---|
| `20260206113001_init` | Initial schema (all core tables) |
| `20260207100000_add_categories_and_pinning` | ModuleCategory, UserPinnedModule, CompanyPinnedModule |
| `20260213100000_add_document_support` | MediaAsset DOCUMENT type, VERCEL_BLOB provider, blobUrl, extractedText |
| `20260214120000_add_asset_cleanup_statuses` | DELETE_PENDING, DELETE_FAILED statuses, MODULE_DELETED, ASSET_BULK_DELETED audit actions |
| `20260219100000_gamification_suggestions_compliance` | XpTransaction, UserXpBalance, Reward, RewardRedemption, KnowledgeSuggestion, KnowledgeSuggestionVote, KnowledgeSuggestionComment tables; XpSourceType, RedemptionStatus, SuggestionStatus, ReputationRank enums; new AuditAction + NotificationType + Permission values; Module.validityMonths |
| `20260219120000_rename_reputation_ranks` | Rename reputation ranks: BRONZE→VAJENEC, SILVER→POMOCNIK, GOLD→MOJSTER, ELITE→MENTOR |
| `20260219130000_add_lifetime_xp` | Add `lifetimeXp` column to UserXpBalance (cumulative, never decreases); backfill from positive XpTransaction sums |
