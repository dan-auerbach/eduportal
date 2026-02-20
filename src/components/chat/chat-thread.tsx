"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { sendChatMessage, confirmAnswer, unconfirmAnswer } from "@/actions/chat";
import type { ChatMessageDTO } from "@/actions/chat";
import { Send, Moon, Sun, HelpCircle, X, CheckCircle2, GraduationCap } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import type { ChatScope } from "@/hooks/use-chat";
import type { ChatLabels } from "@/lib/chat-labels";
import {
  THEMES,
  hashColor,
  escapeHtml,
  URL_REGEX,
  buildMentionPatterns,
  containsMention,
  formatTime,
  channelName,
  getStoredTheme,
  setStoredTheme,
  setLastRead,
} from "@/lib/chat-engine";
import type { IrcTheme } from "@/lib/chat-engine";

// ── Props ────────────────────────────────────────────────────────────────────

type ChatThreadProps = {
  scope: ChatScope;
  tenantSlug: string;
  tenantId: string;
  userId: string;
  userDisplayName: string;
  userFirstName?: string;
  userLastName?: string;
  moduleTitle?: string;
  initialTopic?: string | null;
  canSetTopic?: boolean;
  mentorIds?: string[];
  canConfirmAnswers?: boolean;
  labels: ChatLabels;
  variant?: "full" | "embedded";
};

// ── Component ────────────────────────────────────────────────────────────────

export function ChatThread({
  scope,
  tenantSlug,
  tenantId,
  userId,
  userDisplayName,
  userFirstName,
  userLastName,
  moduleTitle,
  initialTopic,
  canSetTopic = false,
  mentorIds = [],
  canConfirmAnswers = false,
  labels,
  variant = "full",
}: ChatThreadProps) {
  const { messages, setMessages, isLoading, topic: liveTopic } = useChat({ scope });
  const topic = liveTopic ?? initialTopic ?? null;

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewBadge, setShowNewBadge] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [theme, setTheme] = useState<IrcTheme>(getStoredTheme);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);
  const prevMsgCountRef = useRef(0);
  const initialScrollDone = useRef(false);

  const colors = THEMES[theme];
  const moduleId = scope.kind === "MODULE" ? scope.moduleId : null;
  const mentorSet = useMemo(() => new Set(mentorIds), [mentorIds]);
  const channel = channelName(scope, tenantSlug, moduleTitle);

  const isCompact = variant === "embedded";

  // Mention patterns
  const mentionPatterns = useMemo(
    () => buildMentionPatterns(userDisplayName, userFirstName, userLastName),
    [userDisplayName, userFirstName, userLastName],
  );

  // ── Theme toggle ───────────────────────────────────────────────────────────

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      setStoredTheme(next);
      return next;
    });
  };

  // ── Scroll helpers ─────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  }, []);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 80;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (isNearBottomRef.current) {
      setShowNewBadge(false);
    }
  }, []);

  // ── Mark as read helper ────────────────────────────────────────────────────

  const markAsRead = useCallback(
    (msgId: string) => setLastRead(scope, tenantId, msgId),
    [scope, tenantId],
  );

  // ── Scroll to bottom on initial load ───────────────────────────────────────

  useEffect(() => {
    if (!isLoading && messages.length > 0 && !initialScrollDone.current) {
      initialScrollDone.current = true;
      const latestId = messages[messages.length - 1].id;
      markAsRead(latestId);
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [isLoading, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-scroll / new badge on new messages ────────────────────────────────

  useEffect(() => {
    if (messages.length > prevMsgCountRef.current && initialScrollDone.current) {
      const latestId = messages[messages.length - 1].id;
      if (isNearBottomRef.current) {
        markAsRead(latestId);
        requestAnimationFrame(() => scrollToBottom(true));
      } else {
        setShowNewBadge(true);
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset initial scroll flag when scope changes
  useEffect(() => {
    initialScrollDone.current = false;
    prevMsgCountRef.current = 0;
    setShowNewBadge(false);
    setError(null);
    setInput("");
  }, [moduleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    if (trimmed.toLowerCase() === "/help") {
      setShowHelp(true);
      setInput("");
      return;
    }

    setSending(true);
    setError(null);

    const result = await sendChatMessage(trimmed, moduleId);
    if (result.success) {
      setInput("");
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === result.data.id);
        return exists ? prev : [...prev, result.data];
      });
      markAsRead(result.data.id);
      requestAnimationFrame(() => scrollToBottom(true));
      inputRef.current?.focus();
    } else {
      if (result.error.startsWith("_UNKNOWN_CMD_:")) {
        const cmd = result.error.replace("_UNKNOWN_CMD_:", "");
        setError(labels.unknownCommand.replace("{cmd}", cmd));
      } else {
        setError(result.error);
      }
    }

    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Confirm / Unconfirm answer (module only) ──────────────────────────────

  const handleConfirmToggle = async (msgId: string, currentlyConfirmed: boolean) => {
    const result = currentlyConfirmed
      ? await unconfirmAnswer(msgId)
      : await confirmAnswer(msgId);

    if (result.success) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                isConfirmedAnswer: !currentlyConfirmed,
                confirmedByName: !currentlyConfirmed ? userDisplayName : null,
              }
            : m,
        ),
      );
    }
  };

  // ── Render message body with links + mentions ─────────────────────────────

  const renderBody = useCallback(
    (text: string, isMention: boolean) => {
      const escaped = escapeHtml(text);
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      const urlMatches = [...escaped.matchAll(URL_REGEX)];

      if (urlMatches.length === 0) {
        parts.push(escaped);
      } else {
        for (const match of urlMatches) {
          const matchStart = match.index!;
          if (matchStart > lastIndex) {
            parts.push(escaped.slice(lastIndex, matchStart));
          }
          const url = match[0];
          const href = url.replace(/&amp;/g, "&");
          if (/^https?:\/\//i.test(href)) {
            parts.push(
              <a
                key={matchStart}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:opacity-80"
                style={{ color: colors.channel }}
              >
                {url}
              </a>,
            );
          } else {
            parts.push(url);
          }
          lastIndex = matchStart + url.length;
        }
        if (lastIndex < escaped.length) {
          parts.push(escaped.slice(lastIndex));
        }
      }

      if (isMention) {
        return (
          <span
            className="px-1 rounded"
            style={{ background: colors.mentionBg, color: colors.mentionText }}
          >
            {parts}
          </span>
        );
      }

      return <>{parts}</>;
    },
    [colors],
  );

  // ── Size classes based on variant ──────────────────────────────────────────

  const rootClass = isCompact
    ? "flex flex-col h-full overflow-hidden"
    : "flex flex-col h-[calc(100dvh-3.5rem)] -m-4 md:-m-6 overflow-hidden rounded-none";

  const headerPy = isCompact ? "py-2.5" : "py-3";
  const headerFontSize = isCompact ? "text-sm" : "text-lg";
  const headerSubFontSize = isCompact ? "text-xs" : "text-sm";
  const iconSize = isCompact ? "h-3.5 w-3.5" : "h-4 w-4";
  const iconPad = isCompact ? "p-1" : "p-1.5";
  const msgArea = isCompact
    ? "flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-5 min-h-0"
    : "flex-1 overflow-y-auto px-4 py-2 font-mono text-sm leading-6";
  const helpMx = isCompact ? "mx-3" : "mx-4";
  const helpPad = isCompact ? "p-2.5" : "p-3";
  const helpMt = isCompact ? "mt-2 mb-1" : "mt-2 mb-1";
  const badgeFontSize = isCompact ? "text-[10px]" : "text-xs";
  const badgePx = isCompact ? "px-2.5 py-0.5" : "px-3 py-1";
  const inputPx = isCompact ? "px-3" : "px-4";
  const inputPy = isCompact ? "py-2.5" : "py-3";
  const inputFieldClass = isCompact
    ? "flex-1 min-w-0 rounded-md px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 disabled:opacity-50 placeholder:opacity-50"
    : "flex-1 min-w-0 rounded-md px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 disabled:opacity-50 placeholder:opacity-50";
  const sendBtnClass = isCompact
    ? "flex shrink-0 items-center justify-center w-8 h-8 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    : "flex shrink-0 items-center justify-center w-9 h-9 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors";
  const sendIconSize = isCompact ? "h-3.5 w-3.5" : "h-4 w-4";
  const timestampMr = isCompact ? "mr-1.5" : "mr-2";
  const errorFontSize = isCompact ? "text-[10px]" : "text-xs";
  const errorPx = isCompact ? "px-3" : "px-4";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={rootClass} style={{ background: colors.bg }}>
      {/* Header */}
      <div
        className={`flex items-center gap-2 px-4 ${headerPy} border-b shrink-0`}
        style={{ background: colors.headerBg, borderColor: colors.headerBorder }}
      >
        <span className={`font-mono ${headerFontSize} font-bold`} style={{ color: colors.channel }}>
          {channel}
        </span>
        <span className={`${headerSubFontSize} font-mono truncate`} style={{ color: colors.timestamp }}>
          {labels.title}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setShowHelp((v) => !v)}
          className={`${iconPad} rounded-md transition-colors hover:opacity-80`}
          style={{ color: colors.timestamp }}
          title={labels.helpTitle}
        >
          <HelpCircle className={iconSize} />
        </button>
        <button
          onClick={toggleTheme}
          className={`${iconPad} rounded-md transition-colors hover:opacity-80`}
          style={{ color: colors.timestamp }}
          title={theme === "light" ? "Dark mode" : "Light mode"}
        >
          {theme === "light" ? <Moon className={iconSize} /> : <Sun className={iconSize} />}
        </button>
      </div>

      {/* Topic bar (tenant chat only) */}
      {scope.kind === "TENANT" && topic && (
        <div
          className="px-4 py-1.5 font-mono text-xs border-b truncate"
          style={{
            background: colors.topicBg,
            color: colors.topicText,
            borderColor: colors.topicBorder,
          }}
        >
          <span className="font-semibold">{labels.topicLabel} </span>
          {topic}
        </div>
      )}

      {/* Help overlay */}
      {showHelp && (
        <div
          className={`${helpMx} ${helpMt} rounded-md border ${helpPad} font-mono text-xs shrink-0`}
          style={{
            background: colors.helpBg,
            borderColor: colors.helpBorder,
            color: colors.helpText,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold">{labels.helpTitle}</span>
            <button
              onClick={() => setShowHelp(false)}
              className="hover:opacity-80"
              style={{ color: colors.timestamp }}
            >
              <X className={isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </button>
          </div>
          <div className={isCompact ? "space-y-0.5" : "space-y-1"}>
            <div>
              <span style={{ color: colors.helpCmd }}>/me</span>{" "}
              {labels.helpMe.replace(/\/me <besedilo> — |\/me <text> — /, "")}
            </div>
            {scope.kind === "TENANT" && (
              <>
                <div>
                  <span style={{ color: colors.helpCmd }}>/shrug</span>{" "}
                  {labels.helpShrug.replace("/shrug — ", "")}
                </div>
                <div>
                  <span style={{ color: colors.helpCmd }}>/afk</span>{" "}
                  {labels.helpAfk.replace(/\/afk \[razlog\] — |\/afk \[reason\] — /, "")}
                </div>
                {canSetTopic && (
                  <div>
                    <span style={{ color: colors.helpCmd }}>/topic</span>{" "}
                    {labels.helpTopic.replace(/\/topic <besedilo> — |\/topic <text> — /, "")}
                  </div>
                )}
              </>
            )}
            <div>
              <span style={{ color: colors.helpCmd }}>/help</span>{" "}
              {labels.helpHelp.replace("/help — ", "")}
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={checkNearBottom}
        className={msgArea}
      >
        {!isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="italic" style={{ color: colors.emptyText }}>
              {labels.noMessages}
            </span>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.type === "SYSTEM") {
            return (
              <div key={msg.id} style={{ color: colors.system }}>
                <span style={{ color: colors.timestamp }} className={timestampMr}>
                  [{formatTime(msg.createdAt)}]
                </span>
                <span>* {escapeHtml(msg.body)}</span>
              </div>
            );
          }

          if (msg.type === "ACTION") {
            return (
              <div key={msg.id} style={{ color: colors.action }}>
                <span style={{ color: colors.timestamp }} className={timestampMr}>
                  [{formatTime(msg.createdAt)}]
                </span>
                <span>* </span>
                <span className="font-semibold">{escapeHtml(msg.displayName)}</span>
                <span> {escapeHtml(msg.body)}</span>
              </div>
            );
          }

          // MESSAGE
          const nickColor = hashColor(msg.displayName, theme);
          const isMe = msg.userId === userId;
          const isMention = !isMe && containsMention(msg.body, mentionPatterns);
          const isMentor = scope.kind === "MODULE" && msg.userId ? mentorSet.has(msg.userId) : false;
          const isConfirmed = msg.isConfirmedAnswer;
          const isHovered = hoveredMsgId === msg.id;

          return (
            <div
              key={msg.id}
              className={scope.kind === "MODULE" ? "rounded px-1 -mx-1 transition-colors group/msg" : undefined}
              style={
                scope.kind === "MODULE" && isConfirmed
                  ? {
                      background: colors.confirmedBg,
                      borderLeft: `3px solid ${colors.confirmBtnBg}`,
                      paddingLeft: "6px",
                      marginLeft: "-7px",
                    }
                  : undefined
              }
              onMouseEnter={scope.kind === "MODULE" ? () => setHoveredMsgId(msg.id) : undefined}
              onMouseLeave={scope.kind === "MODULE" ? () => setHoveredMsgId(null) : undefined}
            >
              <span style={{ color: colors.timestamp }} className={timestampMr}>
                [{formatTime(msg.createdAt)}]
              </span>
              {/* Mentor badge (module only) */}
              {isMentor && (
                <span
                  className="inline-flex items-center gap-0.5 mr-1 text-[10px] font-bold align-baseline"
                  style={{ color: colors.mentorColor }}
                  title={labels.mentorBadge}
                >
                  <GraduationCap className="h-3 w-3 inline" />
                  <span>[M]</span>
                </span>
              )}
              <span style={{ color: nickColor }} className="font-semibold">
                &lt;{escapeHtml(msg.displayName)}&gt;
              </span>
              <span
                className="ml-1"
                style={{ color: isMe ? colors.textMe : colors.text }}
              >
                {renderBody(msg.body, isMention)}
              </span>
              {/* Confirmed answer badge (module only) */}
              {scope.kind === "MODULE" && isConfirmed && (
                <span
                  className="inline-flex items-center gap-0.5 ml-2 text-[10px] font-semibold"
                  style={{ color: colors.confirmedText }}
                >
                  <CheckCircle2 className="h-3 w-3 inline" />
                  {labels.confirmedAnswer}
                  {msg.confirmedByName && (
                    <span className="font-normal opacity-70 ml-0.5">
                      ({labels.confirmedBy.replace("{name}", msg.confirmedByName)})
                    </span>
                  )}
                </span>
              )}
              {/* Confirm/Unconfirm button on hover (module only) */}
              {canConfirmAnswers && isHovered && msg.type === "MESSAGE" && (
                <button
                  onClick={() => handleConfirmToggle(msg.id, isConfirmed)}
                  className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors"
                  style={{
                    background: isConfirmed ? "transparent" : colors.confirmBtnBg,
                    color: isConfirmed ? colors.timestamp : colors.confirmBtnText,
                    border: isConfirmed ? `1px solid ${colors.headerBorder}` : "none",
                  }}
                >
                  {isConfirmed ? labels.unconfirmAnswer : labels.confirmAnswer}
                </button>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* New messages badge */}
      {showNewBadge && (
        <div className="flex justify-center py-1 shrink-0">
          <button
            onClick={() => {
              scrollToBottom(true);
              setShowNewBadge(false);
              if (messages.length > 0) {
                markAsRead(messages[messages.length - 1].id);
              }
            }}
            className={`${badgePx} rounded-full ${badgeFontSize} font-mono font-semibold shadow-lg transition-colors`}
            style={{ background: colors.badgeBg, color: colors.badgeText }}
          >
            {labels.newMessages} ↓
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={`${errorPx} py-1 font-mono ${errorFontSize} shrink-0`} style={{ color: "#cc0000" }}>
          {error}
        </div>
      )}

      {/* Input bar */}
      <div
        className={`flex items-center gap-2 ${inputPx} ${inputPy} border-t shrink-0`}
        style={{ background: colors.inputBarBg, borderColor: colors.headerBorder }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={labels.placeholder}
          maxLength={500}
          disabled={sending}
          autoFocus={!isCompact}
          className={inputFieldClass}
          style={{
            background: colors.inputBg,
            border: `1px solid ${colors.inputBorder}`,
            color: colors.inputText,
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className={sendBtnClass}
          style={{ background: colors.sendBg, color: colors.sendText }}
          title={labels.send}
        >
          <Send className={sendIconSize} />
        </button>
      </div>
    </div>
  );
}
