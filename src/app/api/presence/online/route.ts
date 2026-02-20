import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { getOnlineUsers } from "@/lib/presence";
import { rateLimitPresenceList } from "@/lib/rate-limit";

/**
 * GET /api/presence/online?limit=20
 * Returns the list of currently online users for the active tenant.
 */
export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return NextResponse.json({ users: [] });
    }
    return NextResponse.json({ users: [] });
  }

  // Rate limit: 10 per 60s
  const rl = await rateLimitPresenceList(ctx.user.id);
  if (!rl.success) {
    return NextResponse.json({ users: [] });
  }

  const limitParam = req.nextUrl.searchParams.get("limit");
  const limit = Math.min(Number(limitParam) || 20, 50);

  const users = await getOnlineUsers(ctx.tenantId, limit);

  return NextResponse.json({ users });
}
