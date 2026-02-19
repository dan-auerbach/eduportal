/**
 * Sentry integration helpers for Mentor LMS.
 *
 * Setup instructions:
 * 1. Run: npx @sentry/wizard@latest -i nextjs
 * 2. Set SENTRY_DSN and SENTRY_AUTH_TOKEN in .env
 * 3. The wizard creates: sentry.client.config.ts, sentry.server.config.ts,
 *    sentry.edge.config.ts, and wraps next.config.ts with withSentryConfig
 * 4. Call setSentryContext() after getTenantContext() in critical server actions
 * 5. Wrap expensive operations with traceServerAction()
 *
 * Configuration notes:
 * - tracesSampleRate: 0.1 in production, 1.0 in development
 * - profilesSampleRate: 0.1
 * - Enable Sentry.prismaIntegration() for DB query tracing
 */

// NOTE: Import Sentry only after running the wizard. Until then, these
// functions are safe no-ops that won't break the build.

type TenantContext = {
  user: { id: string; email: string };
  tenantId: string;
  tenantSlug: string;
  effectiveRole: string;
};

/**
 * Set Sentry user and tenant context for error grouping & filtering.
 * Call after getTenantContext() in critical code paths.
 */
export function setSentryContext(ctx: TenantContext): void {
  try {
    // Dynamic import to avoid build errors when Sentry is not installed
    const Sentry = require("@sentry/nextjs");
    Sentry.setUser({ id: ctx.user.id, email: ctx.user.email });
    Sentry.setTag("tenantId", ctx.tenantId);
    Sentry.setTag("tenantSlug", ctx.tenantSlug);
    Sentry.setTag("effectiveRole", ctx.effectiveRole);
  } catch {
    // Sentry not installed — no-op
  }
}

/**
 * Wrap a server action with Sentry performance tracing.
 * Creates a span for the action's execution.
 */
export async function traceServerAction<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    const Sentry = require("@sentry/nextjs");
    return await Sentry.startSpan({ name, op: "server.action" }, fn);
  } catch {
    // Sentry not installed — just run the function
    return fn();
  }
}

/**
 * Capture an exception with optional extra context.
 */
export function captureException(
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  try {
    const Sentry = require("@sentry/nextjs");
    Sentry.captureException(error, { extra });
  } catch {
    // Sentry not installed — log to console as fallback
    console.error("[Sentry fallback]", error, extra);
  }
}
