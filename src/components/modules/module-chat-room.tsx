"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { sendChatMessage, joinChat, confirmAnswer, unconfirmAnswer } from "@/actions/chat";
import type { ChatMessageDTO } from "@/actions/chat";
import { Send, Moon, Sun, HelpCircle, X, CheckCircle2, GraduationCap } from "lucide-react";
import { t } from "@/lib/i18n";

// ── Theme definitions (reused from global chat) ───────────────────────────────

type IrcTheme = "light" | "dark";

const THEMES = {
  light: {
    bg: "#ffffff",
    headerBg: "#f5f5f5",
    headerBorder: "#d4d4d4",
    inputBg: "#f5f5f5",
    inputBorder: "#c0c0c0",
    inputText: "#1a1a1a",
    inputPlaceholder: "#999999",
    inputBarBg: "#f0f0f0",
    text: "#1a1a1a",
    textMe: "#000000",
    timestamp: "#808080",
    join: "#009900",
    system: "#cc7700",
    action: "#990099",
    channel: "#0000cc",
    emptyText: "#999999",
    badgeBg: "#0066cc",
    badgeText: "#ffffff",
    sendBg: "#0066cc",
    sendText: "#ffffff",
    sendHover: "#0055aa",
    focusRing: "#0066cc",
    mentionBg: "#fff3cd",
    mentionText: "#856404",
    helpBg: "#f5f5f5",
    helpBorder: "#d4d4d4",
    helpText: "#333333",
    helpCmd: "#0066cc",
    confirmedBg: "#d4edda",
    confirmedBorder: "#c3e6cb",
    confirmedText: "#155724",
    mentorColor: "#0066cc",
    confirmBtnBg: "#28a745",
    confirmBtnText: "#ffffff",
  },
  dark: {
    bg: "#0b0f14",
    headerBg: "#0b0f14",
    headerBorder: "#1e2530",
    inputBg: "#161b22",
    inputBorder: "#30363d",
    inputText: "#d1d5db",
    inputPlaceholder: "#5c6370",
    inputBarBg: "#0d1117",
    text: "#d1d5db",
    textMe: "#e8ecf1",
    timestamp: "#5c6370",
    join: "#56b6c2",
    system: "#e5c07b",
    action: "#c678dd",
    channel: "#61afef",
    emptyText: "#5c6370",
    badgeBg: "#61afef",
    badgeText: "#0b0f14",
    sendBg: "#61afef",
    sendText: "#0b0f14",
    sendHover: "#4d9de0",
    focusRing: "#61afef",
    mentionBg: "#3d2e00",
    mentionText: "#e5c07b",
    helpBg: "#161b22",
    helpBorder: "#30363d",
    helpText: "#d1d5db",
    helpCmd: "#61afef",
    confirmedBg: "#0d2818",
    confirmedBorder: "#1a3a2a",
    confirmedText: "#98c379",
    mentorColor: "#61afef",
    confirmBtnBg: "#28a745",
    confirmBtnText: "#ffffff",
  },
} as const;

// ── mIRC-style nick colors ───────────────────────────────────────────────────

const NICK_COLORS_LIGHT = [
  "#cc0000", "#0000cc", "#990099", "#cc6600", "#009999",
  "#009900", "#666699", "#cc0066", "#336600", "#6600cc",
];
const NICK_COLORS_DARK = [
  "#e06c75", "#61afef", "#c678dd", "#e5c07b", "#56b6c2",
  "#98c379", "#d19a66", "#be5046",
];

function hashColor(name: string, theme: IrcTheme): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = theme === "light" ? NICK_COLORS_LIGHT : NICK_COLORS_DARK;
  return palette[Math.abs(hash) % palette.length];
}

// ── localStorage keys ─────────────────────────────────────────────────────────

const MODULE_LAST_READ_PREFIX = "ircModuleLastRead:";
const THEME_KEY = "ircTheme";

function updateModuleLastRead(moduleId: string, messageId: string) {
  try {
    localStorage.setItem(`${MODULE_LAST_READ_PREFIX}${moduleId}`, messageId);
  } catch { /* ignore */ }
}

export function getModuleLastRead(moduleId: string): string | null {
  try {
    return localStorage.getItem(`${MODULE_LAST_READ_PREFIX}${moduleId}`);
  } catch {
    return null;
  }
}

// ── Mention detection ─────────────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMentionPatterns(displayName: string): RegExp[] {
  const patterns: RegExp[] = [];
  if (displayName) {
    patterns.push(new RegExp(`@${escapeRegex(displayName)}\\b`, "i"));
    patterns.push(new RegExp(`\\b${escapeRegex(displayName)}\\b`, "i"));
  }
  return patterns;
}

function containsMention(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

// ── URL detection ─────────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

// ── Props ─────────────────────────────────────────────────────────────────────

type ModuleChatRoomProps = {
  moduleId: string;
  moduleTitle: string;
  tenantId: string;
  userId: string;
  userDisplayName: string;
  mentorIds: string[];
  canConfirmAnswers: boolean; // true if user is mentor for this module or admin
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ModuleChatRoom({
  moduleId,
  moduleTitle,
  tenantId,
  userId,
  userDisplayName,
  mentorIds,
  canConfirmAnswers,
}: ModuleChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewBadge, setShowNewBadge] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [theme, setTheme] = useState<IrcTheme>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    }
    return "light";
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastIdRef = useRef<string | null>(null);
  const isNearBottomRef = useRef(true);

  // C11: Adaptive polling — 5s base, up to 15s when idle
  const POLL_BASE = 5000;
  const POLL_MAX = 15000;
  const pollIntervalRef = useRef(POLL_BASE);
  const emptyPollCountRef = useRef(0);

  const colors = THEMES[theme];
  const mentorSet = useMemo(() => new Set(mentorIds), [mentorIds]);

  const mentionPatterns = useMemo(
    () => buildMentionPatterns(userDisplayName),
    [userDisplayName],
  );

  // ── Theme toggle ──────────────────────────────────────────────────────────

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
      return next;
    });
  };

  // ── Scroll helpers ────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  }, []);

  const checkNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 80;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (isNearBottomRef.current) setShowNewBadge(false);
  }, []);

  const markAsRead = useCallback((msgId: string) => {
    updateModuleLastRead(moduleId, msgId);
  }, [moduleId]);

  // ── Fetch messages (polling) ──────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("moduleId", moduleId);
      if (lastIdRef.current) params.set("after", lastIdRef.current);

      const res = await fetch(`/api/chat?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json();
      const newMsgs: ChatMessageDTO[] = data.messages ?? [];

      if (newMsgs.length > 0) {
        const latestId = newMsgs[newMsgs.length - 1].id;

        setMessages((prev) => {
          if (!lastIdRef.current) return newMsgs;
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = newMsgs.filter((m) => !existingIds.has(m.id));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });

        lastIdRef.current = latestId;

        // C11: Reset to fast polling when new messages arrive
        emptyPollCountRef.current = 0;
        pollIntervalRef.current = POLL_BASE;

        if (isNearBottomRef.current) {
          markAsRead(latestId);
          requestAnimationFrame(() => scrollToBottom(true));
        } else if (lastIdRef.current) {
          setShowNewBadge(true);
        }
      } else if (lastIdRef.current) {
        // C11: No new messages — gradually slow down polling
        emptyPollCountRef.current++;
        if (emptyPollCountRef.current >= 3) {
          pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.5, POLL_MAX);
        }
      }

      if (!initialLoaded) setInitialLoaded(true);
    } catch {
      // Silently ignore polling errors
    }
  }, [moduleId, scrollToBottom, initialLoaded, markAsRead]);

  // ── Initial load + polling ────────────────────────────────────────────────

  useEffect(() => {
    // Reset state when moduleId changes
    setMessages([]);
    setInitialLoaded(false);
    lastIdRef.current = null;
    setShowNewBadge(false);
    setError(null);
    pollIntervalRef.current = POLL_BASE;
    emptyPollCountRef.current = 0;
  }, [moduleId]);

  // C11: Adaptive polling with setTimeout instead of setInterval
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const poll = async () => {
      await fetchMessages();
      if (!cancelled) {
        timeoutId = setTimeout(poll, pollIntervalRef.current);
      }
    };

    poll();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [fetchMessages]);

  // ── Scroll on initial load ────────────────────────────────────────────────

  useEffect(() => {
    if (initialLoaded && messages.length > 0) {
      const latestId = messages[messages.length - 1].id;
      markAsRead(latestId);
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [initialLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Join on mount (once per session) ──────────────────────────────────────

  useEffect(() => {
    const key = `chat-joined-module:${moduleId}`;
    if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
      joinChat(moduleId).then(() => {
        sessionStorage.setItem(key, "1");
      });
    }
  }, [moduleId]);

  // ── Send message ──────────────────────────────────────────────────────────

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
      lastIdRef.current = result.data.id;
      markAsRead(result.data.id);
      requestAnimationFrame(() => scrollToBottom(true));
      inputRef.current?.focus();
    } else {
      if (result.error.startsWith("_UNKNOWN_CMD_:")) {
        const cmd = result.error.replace("_UNKNOWN_CMD_:", "");
        setError(t("moduleChat.unknownCommand", { cmd }));
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

  // ── Confirm / Unconfirm answer ────────────────────────────────────────────

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

  // ── Formatting helpers ────────────────────────────────────────────────────

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const renderBody = useCallback((text: string, isMention: boolean) => {
    const escaped = escapeHtml(text);
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const urlMatches = [...escaped.matchAll(URL_REGEX)];

    if (urlMatches.length === 0) {
      parts.push(escaped);
    } else {
      for (const match of urlMatches) {
        const matchStart = match.index!;
        if (matchStart > lastIndex) parts.push(escaped.slice(lastIndex, matchStart));
        const url = match[0];
        const href = url.replace(/&amp;/g, "&");
        // C6: Only render http(s) URLs as clickable links
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
      if (lastIndex < escaped.length) parts.push(escaped.slice(lastIndex));
    }

    if (isMention) {
      return (
        <span className="px-1 rounded" style={{ background: colors.mentionBg, color: colors.mentionText }}>
          {parts}
        </span>
      );
    }

    return <>{parts}</>;
  }, [colors]);

  // ── Channel name ──────────────────────────────────────────────────────────

  const channelSlug = moduleTitle.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9čšžđćñ-]/gi, "").slice(0, 30);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: colors.bg }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0"
        style={{ background: colors.headerBg, borderColor: colors.headerBorder }}
      >
        <span className="font-mono text-sm font-bold" style={{ color: colors.channel }}>
          #{channelSlug}
        </span>
        <span className="text-xs font-mono truncate" style={{ color: colors.timestamp }}>
          {t("moduleChat.title")}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="p-1 rounded-md transition-colors hover:opacity-80"
          style={{ color: colors.timestamp }}
          title={t("moduleChat.helpTitle")}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={toggleTheme}
          className="p-1 rounded-md transition-colors hover:opacity-80"
          style={{ color: colors.timestamp }}
        >
          {theme === "light" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Help overlay */}
      {showHelp && (
        <div
          className="mx-3 mt-2 mb-1 rounded-md border p-2.5 font-mono text-xs shrink-0"
          style={{ background: colors.helpBg, borderColor: colors.helpBorder, color: colors.helpText }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold">{t("moduleChat.helpTitle")}</span>
            <button onClick={() => setShowHelp(false)} style={{ color: colors.timestamp }}>
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-0.5">
            <div><span style={{ color: colors.helpCmd }}>/me</span> {t("moduleChat.helpMe").replace("/me <besedilo> — ", "").replace("/me <text> — ", "")}</div>
            <div><span style={{ color: colors.helpCmd }}>/help</span> {t("moduleChat.helpHelp").replace("/help — ", "")}</div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={checkNearBottom}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-5 min-h-0"
      >
        {initialLoaded && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="italic" style={{ color: colors.emptyText }}>
              {t("moduleChat.noMessages")}
            </span>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.type === "JOIN") {
            return (
              <div key={msg.id} style={{ color: colors.join }}>
                <span style={{ color: colors.timestamp }} className="mr-1.5">[{formatTime(msg.createdAt)}]</span>
                <span>* </span>
                <span className="font-semibold">{escapeHtml(msg.displayName)}</span>
                <span> {t("moduleChat.joined", { channel: channelSlug })}</span>
              </div>
            );
          }

          if (msg.type === "SYSTEM") {
            return (
              <div key={msg.id} style={{ color: colors.system }}>
                <span style={{ color: colors.timestamp }} className="mr-1.5">[{formatTime(msg.createdAt)}]</span>
                <span>* {escapeHtml(msg.body)}</span>
              </div>
            );
          }

          if (msg.type === "ACTION") {
            return (
              <div key={msg.id} style={{ color: colors.action }}>
                <span style={{ color: colors.timestamp }} className="mr-1.5">[{formatTime(msg.createdAt)}]</span>
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
          const isMentor = msg.userId ? mentorSet.has(msg.userId) : false;
          const isConfirmed = msg.isConfirmedAnswer;
          const isHovered = hoveredMsgId === msg.id;

          return (
            <div
              key={msg.id}
              className="rounded px-1 -mx-1 transition-colors group/msg"
              style={
                isConfirmed
                  ? {
                      background: colors.confirmedBg,
                      borderLeft: `3px solid ${colors.confirmBtnBg}`,
                      paddingLeft: "6px",
                      marginLeft: "-7px",
                    }
                  : undefined
              }
              onMouseEnter={() => setHoveredMsgId(msg.id)}
              onMouseLeave={() => setHoveredMsgId(null)}
            >
              <span style={{ color: colors.timestamp }} className="mr-1.5">[{formatTime(msg.createdAt)}]</span>
              {/* Mentor badge */}
              {isMentor && (
                <span
                  className="inline-flex items-center gap-0.5 mr-1 text-[10px] font-bold align-baseline"
                  style={{ color: colors.mentorColor }}
                  title={t("moduleChat.mentorBadge")}
                >
                  <GraduationCap className="h-3 w-3 inline" />
                  <span>[M]</span>
                </span>
              )}
              <span style={{ color: nickColor }} className="font-semibold">
                &lt;{escapeHtml(msg.displayName)}&gt;
              </span>
              <span className="ml-1" style={{ color: isMe ? colors.textMe : colors.text }}>
                {renderBody(msg.body, isMention)}
              </span>
              {/* Confirmed answer badge */}
              {isConfirmed && (
                <span
                  className="inline-flex items-center gap-0.5 ml-2 text-[10px] font-semibold"
                  style={{ color: colors.confirmedText }}
                >
                  <CheckCircle2 className="h-3 w-3 inline" />
                  {t("moduleChat.confirmedAnswer")}
                  {msg.confirmedByName && (
                    <span className="font-normal opacity-70 ml-0.5">
                      ({t("moduleChat.confirmedBy", { name: msg.confirmedByName })})
                    </span>
                  )}
                </span>
              )}
              {/* Confirm/Unconfirm button on hover */}
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
                  {isConfirmed ? t("moduleChat.unconfirmAnswer") : t("moduleChat.confirmAnswer")}
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
              if (messages.length > 0) markAsRead(messages[messages.length - 1].id);
            }}
            className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold shadow-lg transition-colors"
            style={{ background: colors.badgeBg, color: colors.badgeText }}
          >
            {t("moduleChat.newMessages")} ↓
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-1 font-mono text-[10px] shrink-0" style={{ color: "#cc0000" }}>
          {error}
        </div>
      )}

      {/* Input bar */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-t shrink-0"
        style={{ background: colors.inputBarBg, borderColor: colors.headerBorder }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { pollIntervalRef.current = POLL_BASE; emptyPollCountRef.current = 0; }}
          placeholder={t("moduleChat.placeholder")}
          maxLength={500}
          disabled={sending}
          className="flex-1 min-w-0 rounded-md px-2.5 py-1.5 font-mono text-xs focus:outline-none focus:ring-1 disabled:opacity-50 placeholder:opacity-50"
          style={{
            background: colors.inputBg,
            border: `1px solid ${colors.inputBorder}`,
            color: colors.inputText,
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="flex shrink-0 items-center justify-center w-8 h-8 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          style={{ background: colors.sendBg, color: colors.sendText }}
          title={t("moduleChat.send")}
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
