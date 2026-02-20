import { NextResponse } from "next/server";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { setPresence } from "@/lib/presence";
import { rateLimitPresencePing } from "@/lib/rate-limit";

/**
 * POST /api/presence/ping
 * Heartbeat endpoint — called every ~30s by the client when tab is visible.
 * Refreshes the user's presence key in Redis (90s TTL).
 */
export async function POST() {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 4 per 60s (heartbeat every ~30s + buffer)
  const rl = await rateLimitPresencePing(ctx.user.id);
  if (!rl.success) {
    return NextResponse.json({ ok: true }); // silently succeed
  }

  const displayName =
    `${ctx.user.firstName} ${ctx.user.lastName}`.trim() ||
    ctx.user.email.split("@")[0];

  await setPresence(ctx.tenantId, {
    userId: ctx.user.id,
    displayName,
  });

  return NextResponse.json({ ok: true });
}
