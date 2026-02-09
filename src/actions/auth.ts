"use server";

import { cookies } from "next/headers";

const TENANT_COOKIE = "mentor-tenant";
const OWNER_IMPERSONATION_COOKIE = "mentor-owner-tenant";

/**
 * Clear all tenant-related cookies before logout.
 * Must be called as a server action BEFORE the client-side signOut()
 * so that stale tenant context doesn't interfere with the next login.
 */
export async function clearTenantCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(TENANT_COOKIE);
  cookieStore.delete(OWNER_IMPERSONATION_COOKIE);
}
