# API Reference

## Auth Mechanism

All API routes (except public paths) require authentication via NextAuth.js v5 JWT session. The JWT is stored as an HTTP-only cookie. Edge middleware (`src/middleware.ts`) redirects unauthenticated requests to `/auth/login`.

**Public paths**: `/auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `/verify`, `/api/auth/*`, `/api/cron/*`, `/api/webhooks/*`, `/api/email/*`, `/api/logos/*`, `/api/covers/*`.

**Role-based access**:
- `/owner/*` routes: OWNER only
- `/admin/*` routes: OWNER, SUPER_ADMIN, or ADMIN
- All other routes: any authenticated user

## API Routes

### Authentication

| Method | Path | Description | Auth |
|---|---|---|---|
| * | `/api/auth/[...nextauth]` | NextAuth.js handler (login, session, etc.) | Public |

### AI Builder

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/ai-builder/run` | Start AI module generation job | Admin+ |
| GET | `/api/ai-builder/status?buildId=` | Poll AI build status | Admin+ |

### Media

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/upload` | Upload video (returns CF Stream TUS URL) | Admin+ |
| POST | `/api/videos/tus-upload` | TUS proxy for Cloudflare Stream | Admin+ |
| GET | `/api/videos/status?uid=` | Check CF Stream video processing status | Admin+ |
| GET | `/api/media/videos/status?assetId=` | Check MediaAsset video status | Admin+ |
| POST | `/api/media/document-upload` | Upload PDF/Word document to Vercel Blob | Admin+ |
| POST | `/api/cover-upload` | Upload module cover image | Admin+ |
| GET | `/api/covers/[filename]` | Serve cover image from storage | Public |
| POST | `/api/logo-upload` | Upload tenant logo | Owner |
| GET | `/api/logos/[filename]` | Serve tenant logo from storage | Public |
| POST | `/api/section-image-upload` | Upload image for rich text editor | Admin+ |

### Attachments

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/attachments/[id]` | Get attachment metadata | User |
| GET | `/api/attachments/download?id=` | Download attachment file | User |

### Chat

| Method | Path | Description | Auth |
|---|---|---|---|
| GET/POST | `/api/chat` | Get messages / send message | User |
| GET | `/api/chat/unread` | Get unread message count | User |
| GET | `/api/chat/module-unread` | Get per-module unread counts | User |

### Notifications

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/notifications/unread-count` | Get unread notification count | User |
| GET | `/api/nav-counts` | Combined nav badge counts (notifications, chat, radar) | User |

### Calendar

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/calendar/live-event/[id]` | Download ICS calendar event | User |

### Certificates

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/certificates/[id]/download` | Download certificate | User |

### Email

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/email/unsubscribe?token=&type=` | One-click email unsubscribe | Public (JWT token) |

### Radar

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/radar/unread` | Check for unread radar posts | User |

### Updates

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/updates` | Get changelog entries | User |

### Usage Analytics

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/usage/ping` | Heartbeat for session tracking | User |
| POST | `/api/usage/end` | End user session | User |

### Owner / Admin

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/owner/tenants/[id]` | Get tenant details | Owner |
| GET | `/api/owner/tenants/[id]/export` | Export tenant data (JSON backup) | Owner |

### Cron Jobs (Vercel Cron)

| Schedule | Path | Description |
|---|---|---|
| `0 8 * * *` | `/api/cron/deadline-reminders` | Send deadline reminder emails |
| `0 3 * * 0` | `/api/cron/dedup-cleanup` | Clean up old notification dedup records |
| `0 7 * * *` | `/api/cron/live-reminders` | Send live event reminder emails |
| `0 8 * * *` | `/api/cron/knowledge-digest` | Send daily knowledge digest emails |
| `0 6 * * *` | `/api/cron/compliance-check` | Check module validity, send expiry reminders, reset expired certifications |

### Webhooks

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/webhooks/deploy` | Vercel deploy webhook (triggers changelog) | CRON_SECRET |

## Server Actions

Server Actions provide the primary mutation layer. Located in `src/actions/`.

| File | Key Actions |
|---|---|
| `auth.ts` | `loginAction`, `registerUser`, `resetPassword`, `forgotPassword` |
| `modules.ts` | `createModule`, `updateModule`, `publishModule`, `archiveModule`, `deleteModule`, `createSection`, `updateSection`, `deleteSection`, `reorderSections`, `updateModuleTags`, `updateModuleMentors` |
| `ai-builder.ts` | `startAiBuild` |
| `ai-editor.ts` | `aiGenerateMetadata`, `aiGenerateTags`, `aiGenerateQuiz`, `aiGenerateCoverImage` |
| `quiz.ts` | `createQuiz`, `updateQuiz`, `addQuestion`, `updateQuestion`, `deleteQuestion`, `submitQuizAttempt` |
| `users.ts` | `createUser`, `updateUser`, `deactivateUser`, `bulkDeactivate`, `bulkAssignGroup` |
| `groups.ts` | `createGroup`, `updateGroup`, `deleteGroup`, `assignUsersToGroup` |
| `categories.ts` | `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories` |
| `progress.ts` | `completeSection`, `overrideProgress` |
| `comments.ts` | `createComment`, `resolveComment` |
| `notifications.ts` | `markAsRead`, `markAllAsRead` |
| `pinning.ts` | `toggleUserPin`, `toggleCompanyPin` |
| `chat.ts` | `sendChatMessage`, `confirmAnswer`, `unconfirmAnswer`, `setChatTopic` |
| `live-events.ts` | `createLiveEvent`, `updateLiveEvent`, `deleteLiveEvent` |
| `radar.ts` | `createRadarPost`, `approveRadarPost`, `rejectRadarPost`, `pinRadarPost`, `archiveRadarPost`, `saveRadarPost` |
| `feedback.ts` | `submitFeedback` |
| `tenants.ts` | `createTenant`, `updateTenant`, `archiveTenant`, `deleteTenant` |
| `email.ts` | `sendInviteEmail`, `updateEmailPreferences` |
| `media.ts` | `deleteMediaAsset` |
| `xp.ts` | `getLeaderboard`, `getMyXpBalance`, `getXpHistory`, `awardManualXp` |
| `rewards.ts` | `getRewards`, `getAdminRewards`, `createReward`, `updateReward`, `redeemReward`, `getPendingRedemptions`, `getMyRedemptions`, `reviewRedemption` |
| `suggestions.ts` | `getSuggestions`, `createSuggestion`, `voteSuggestion`, `commentOnSuggestion`, `getSuggestionDetail`, `updateSuggestionStatus`, `convertSuggestionToModule` |
| `compliance.ts` | `getExpiringModules`, `getExpiredModules`, `reassignExpiredModule` |
| `manager-dashboard.ts` | `getManagerDashboardData` |
| `asset-audit.ts` | `bulkDeleteAssets` |

## Example: Server Action Pattern

All server actions follow the `ActionResult<T>` pattern:

```typescript
type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function createModule(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantRole("ADMIN");
  // ... validate, create, audit log
  return { success: true, data: { id: module.id } };
}
```

## Rate Limits

| Endpoint / Action | Limit | Window |
|---|---|---|
| Login attempts | 5 per email | 15 minutes |
| Chat message | 10 per user | 60 seconds |
| Chat topic change | 3 per user | 60 seconds |
| Chat poll (GET) | 30 per user | 60 seconds |
| Radar post | 5 per user | 24 hours |
| AI builder | 50 per user | 1 hour |
| AI editor actions | 30 per user | 1 hour |
| Confirm answer | 10 per user | 60 seconds |
| Chat join | 1 per channel | 5 minutes |
| Suggestion create | 5 per user | 1 hour |
| Suggestion vote | 30 per user | 60 seconds |
| Reward redemption | 5 per user | 60 seconds |
