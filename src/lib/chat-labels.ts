/**
 * Unified chat label types and builder.
 * Used by the ChatThread component for all i18n strings.
 */

import { t } from "@/lib/i18n";
import type { ChatScope } from "@/hooks/use-chat";

export type ChatLabels = {
  title: string;
  send: string;
  placeholder: string;
  noMessages: string;
  error: string;
  newMessages: string;
  unknownCommand: string;
  // Help
  helpTitle: string;
  helpMe: string;
  helpShrug: string;
  helpAfk: string;
  helpTopic: string;
  helpHelp: string;
  helpClose: string;
  // Topic (tenant only)
  topicLabel: string;
  noTopic: string;
  // Module-specific
  confirmedAnswer: string;
  confirmedBy: string;
  confirmAnswer: string;
  unconfirmAnswer: string;
  mentorBadge: string;
};

/**
 * Build the full label set for a given chat scope.
 * Pulls from the appropriate i18n keys (chat.* for tenant, moduleChat.* for module).
 */
export function buildChatLabels(scope: ChatScope): ChatLabels {
  if (scope.kind === "TENANT") {
    return {
      title: t("chat.title"),
      send: t("chat.send"),
      placeholder: t("chat.placeholder"),
      noMessages: t("chat.noMessages"),
      error: t("chat.error"),
      newMessages: t("chat.newMessages"),
      unknownCommand: t("chat.unknownCommand"),
      helpTitle: t("chat.helpTitle"),
      helpMe: t("chat.helpMe"),
      helpShrug: t("chat.helpShrug"),
      helpAfk: t("chat.helpAfk"),
      helpTopic: t("chat.helpTopic"),
      helpHelp: t("chat.helpHelp"),
      helpClose: t("chat.helpClose"),
      topicLabel: t("chat.topicLabel"),
      noTopic: t("chat.noTopic"),
      // Module-specific — not used for tenant but included for type safety
      confirmedAnswer: "",
      confirmedBy: "",
      confirmAnswer: "",
      unconfirmAnswer: "",
      mentorBadge: "",
    };
  }

  return {
    title: t("moduleChat.title"),
    send: t("moduleChat.send"),
    placeholder: t("moduleChat.placeholder"),
    noMessages: t("moduleChat.noMessages"),
    error: t("moduleChat.error"),
    newMessages: t("moduleChat.newMessages"),
    unknownCommand: t("moduleChat.unknownCommand"),
    helpTitle: t("moduleChat.helpTitle"),
    helpMe: t("moduleChat.helpMe"),
    helpShrug: t("chat.helpShrug"), // module chat reuses global /shrug
    helpAfk: t("chat.helpAfk"),     // module chat reuses global /afk
    helpTopic: t("moduleChat.helpTopic"),
    helpHelp: t("moduleChat.helpHelp"),
    helpClose: t("moduleChat.helpClose"),
    topicLabel: t("moduleChat.topicLabel"),
    noTopic: t("moduleChat.noTopic"),
    confirmedAnswer: t("moduleChat.confirmedAnswer"),
    confirmedBy: t("moduleChat.confirmedBy"),
    confirmAnswer: t("moduleChat.confirmAnswer"),
    unconfirmAnswer: t("moduleChat.unconfirmAnswer"),
    mentorBadge: t("moduleChat.mentorBadge"),
  };
}
