import { getTenantContext } from "@/lib/tenant";
import { setLocale, t } from "@/lib/i18n";
import { ChatRoom } from "./chat-room";

export default async function ChatPage() {
  const ctx = await getTenantContext();
  setLocale(ctx.tenantLocale);

  return (
    <ChatRoom
      tenantSlug={ctx.tenantSlug}
      tenantName={ctx.tenantName}
      tenantId={ctx.tenantId}
      userId={ctx.user.id}
      labels={{
        title: t("chat.title"),
        send: t("chat.send"),
        placeholder: t("chat.placeholder"),
        joined: t("chat.joined"),
        noMessages: t("chat.noMessages"),
        error: t("chat.error"),
        newMessages: t("chat.newMessages"),
      }}
    />
  );
}
