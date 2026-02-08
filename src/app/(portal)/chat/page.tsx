import { prisma } from "@/lib/prisma";
import { getTenantContext } from "@/lib/tenant";
import { setLocale, t } from "@/lib/i18n";
import { ChatRoom } from "./chat-room";

export default async function ChatPage() {
  const ctx = await getTenantContext();
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

  return (
    <ChatRoom
      tenantSlug={ctx.tenantSlug}
      tenantName={ctx.tenantName}
      tenantId={ctx.tenantId}
      userId={ctx.user.id}
      userDisplayName={displayName}
      userFirstName={firstName}
      userLastName={lastName}
      initialTopic={tenant?.chatTopic ?? null}
      labels={{
        title: t("chat.title"),
        send: t("chat.send"),
        placeholder: t("chat.placeholder"),
        joined: t("chat.joined"),
        noMessages: t("chat.noMessages"),
        error: t("chat.error"),
        newMessages: t("chat.newMessages"),
        topicLabel: t("chat.topicLabel"),
        noTopic: t("chat.noTopic"),
        unknownCommand: t("chat.unknownCommand"),
        helpTitle: t("chat.helpTitle"),
        helpMe: t("chat.helpMe"),
        helpShrug: t("chat.helpShrug"),
        helpAfk: t("chat.helpAfk"),
        helpTopic: t("chat.helpTopic"),
        helpHelp: t("chat.helpHelp"),
        helpClose: t("chat.helpClose"),
      }}
    />
  );
}
