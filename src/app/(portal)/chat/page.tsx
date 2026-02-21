import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { setLocale } from "@/lib/i18n";
import { ChatThread } from "@/components/chat/chat-thread";
import { buildChatLabels } from "@/lib/chat-labels";

export default async function ChatPage() {
  const ctx = await getTenantContext();
  if (!ctx.config.features.chat) redirect("/dashboard");
  setLocale(ctx.tenantLocale);

  // Fetch current topic
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { chatTopic: true },
  });

  // Build display name for mention detection
  const firstName = ctx.user.firstName;
  const lastName = ctx.user.lastName;
  const displayName = `${firstName}${lastName}`.trim() || ctx.user.email.split("@")[0];

  // C1: Only ADMIN+ can set topic
  const role = ctx.effectiveRole;
  const canSetTopic = role === "ADMIN" || role === "SUPER_ADMIN" || role === "OWNER";

  return (
    <ChatThread
      scope={{ kind: "TENANT" }}
      tenantSlug={ctx.tenantSlug}
      tenantId={ctx.tenantId}
      userId={ctx.user.id}
      userDisplayName={displayName}
      userFirstName={firstName}
      userLastName={lastName}
      initialTopic={tenant?.chatTopic ?? null}
      canSetTopic={canSetTopic}
      labels={buildChatLabels({ kind: "TENANT" })}
      variant="full"
    />
  );
}
