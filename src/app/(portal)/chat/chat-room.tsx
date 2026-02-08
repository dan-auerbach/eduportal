"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendChatMessage, joinChat } from "@/actions/chat";
import type { ChatMessageDTO } from "@/actions/chat";
import { Send, Moon, Sun } from "lucide-react";

// ── Theme definitions ────────────────────────────────────────────────────────

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
    channel: "#0000cc",
    emptyText: "#999999",
    badgeBg: "#0066cc",
    badgeText: "#ffffff",
    sendBg: "#0066cc",
    sendText: "#ffffff",
    sendHover: "#0055aa",
    focusRing: "#0066cc",
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
    channel: "#61afef",
    emptyText: "#5c6370",
    badgeBg: "#61afef",
    badgeText: "#0b0f14",
    sendBg: "#61afef",
    sendText: "#0b0f14",
    sendHover: "#4d9de0",
    focusRing: "#61afef",
  },
} as const;

// ── mIRC-style nick colors per theme ─────────────────────────────────────────

const NICK_COLORS_LIGHT = [
  "#cc0000", // red
  "#0000cc", // blue
  "#990099", // magenta
  "#cc6600", // orange
  "#009999", // teal
  "#009900", // green
  "#666699", // slate blue
  "#cc0066", // pink
  "#336600", // dark green
  "#6600cc", // purple
];

const NICK_COLORS_DARK = [
  "#e06c75", // red
  "#61afef", // blue
  "#c678dd", // magenta
  "#e5c07b", // yellow
  "#56b6c2", // cyan
  "#98c379", // green
  "#d19a66", // orange
  "#be5046", // dark red
];

function hashColor(name: string, theme: IrcTheme): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const palette = theme === "light" ? NICK_COLORS_LIGHT : NICK_COLORS_DARK;
  return palette[Math.abs(hash) % palette.length];
}

// ── localStorage key for lastRead tracking ───────────────────────────────────

const LAST_READ_KEY_PREFIX = "ircLastRead:";
const THEME_KEY = "ircTheme";

function updateLastRead(tenantId: string, messageId: string) {
  try {
    localStorage.setItem(`${LAST_READ_KEY_PREFIX}${tenantId}`, messageId);
  } catch {
    // ignore
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

type ChatRoomProps = {
  tenantSlug: string;
  tenantName: string;
  tenantId: string;
  userId: string;
  labels: {
    title: string;
    send: string;
    placeholder: string;
    joined: string;
    noMessages: string;
    error: string;
    newMessages: string;
  };
};

// ── Component ────────────────────────────────────────────────────────────────

export function ChatRoom({ tenantSlug, tenantName, tenantId, userId, labels }: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewBadge, setShowNewBadge] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
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

  const colors = THEMES[theme];

  // ── Theme toggle ───────────────────────────────────────────────────────────

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try { localStorage.setItem(THEME_KEY, next); } catch { /* ignore */ }
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

  // ── Update lastRead marker ─────────────────────────────────────────────────

  const markAsRead = useCallback((msgId: string) => {
    updateLastRead(tenantId, msgId);
  }, [tenantId]);

  // ── Fetch messages (polling) ───────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    try {
      const afterParam = lastIdRef.current ? `?after=${lastIdRef.current}` : "";
      const res = await fetch(`/api/chat${afterParam}`);
      if (!res.ok) return;

      const data = await res.json();
      const newMsgs: ChatMessageDTO[] = data.messages ?? [];

      if (newMsgs.length > 0) {
        const latestId = newMsgs[newMsgs.length - 1].id;

        setMessages((prev) => {
          if (!lastIdRef.current) {
            return newMsgs;
          }
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = newMsgs.filter((m) => !existingIds.has(m.id));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });

        lastIdRef.current = latestId;

        // Mark as read if near bottom
        if (isNearBottomRef.current) {
          markAsRead(latestId);
          requestAnimationFrame(() => scrollToBottom(true));
        } else if (lastIdRef.current) {
          setShowNewBadge(true);
        }
      }

      if (!initialLoaded) setInitialLoaded(true);
    } catch {
      // Silently ignore polling errors
    }
  }, [scrollToBottom, initialLoaded, markAsRead]);

  // ── Initial load + polling interval ────────────────────────────────────────

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 2500);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // ── Scroll to bottom on initial load + mark as read ────────────────────────

  useEffect(() => {
    if (initialLoaded && messages.length > 0) {
      const latestId = messages[messages.length - 1].id;
      markAsRead(latestId);
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [initialLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Join on mount (once per session) ───────────────────────────────────────

  useEffect(() => {
    const key = `chat-joined:${tenantSlug}`;
    if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
      joinChat().then(() => {
        sessionStorage.setItem(key, "1");
      });
    }
  }, [tenantSlug]);

  // ── Send message ───────────────────────────────────────────────────────────

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    setError(null);

    const result = await sendChatMessage(trimmed);
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
      setError(result.error);
    }

    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Format time HH:MM (24h) ───────────────────────────────────────────────

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  // ── Escape HTML for safe render ────────────────────────────────────────────

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-[calc(100vh-3.5rem)] -m-4 md:-m-6 rounded-none"
      style={{ background: colors.bg }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ background: colors.headerBg, borderColor: colors.headerBorder }}
      >
        <span className="font-mono text-lg font-bold" style={{ color: colors.channel }}>
          #{tenantSlug}
        </span>
        <span className="text-sm font-mono" style={{ color: colors.timestamp }}>
          {labels.title}
        </span>
        <div className="flex-1" />
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-md transition-colors hover:opacity-80"
          style={{ color: colors.timestamp }}
          title={theme === "light" ? "Dark mode" : "Light mode"}
        >
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={checkNearBottom}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-sm leading-6"
      >
        {initialLoaded && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="italic" style={{ color: colors.emptyText }}>{labels.noMessages}</span>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.type === "JOIN") {
            return (
              <div key={msg.id} style={{ color: colors.join }}>
                <span style={{ color: colors.timestamp }} className="mr-2">[{formatTime(msg.createdAt)}]</span>
                <span>* </span>
                <span className="font-semibold">{escapeHtml(msg.displayName)}</span>
                <span> {labels.joined} </span>
                <span style={{ color: colors.channel }}>#{tenantSlug}</span>
              </div>
            );
          }

          if (msg.type === "SYSTEM") {
            return (
              <div key={msg.id} style={{ color: colors.system }}>
                <span style={{ color: colors.timestamp }} className="mr-2">[{formatTime(msg.createdAt)}]</span>
                <span>* {escapeHtml(msg.body)}</span>
              </div>
            );
          }

          // MESSAGE
          const nickColor = hashColor(msg.displayName, theme);
          const isMe = msg.userId === userId;
          return (
            <div key={msg.id}>
              <span style={{ color: colors.timestamp }} className="mr-2">[{formatTime(msg.createdAt)}]</span>
              <span style={{ color: nickColor }} className="font-semibold">
                &lt;{escapeHtml(msg.displayName)}&gt;
              </span>
              <span
                className="ml-1"
                style={{ color: isMe ? colors.textMe : colors.text }}
              >
                {escapeHtml(msg.body)}
              </span>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* New messages badge */}
      {showNewBadge && (
        <div className="flex justify-center py-1">
          <button
            onClick={() => {
              scrollToBottom(true);
              setShowNewBadge(false);
              if (messages.length > 0) {
                markAsRead(messages[messages.length - 1].id);
              }
            }}
            className="px-3 py-1 rounded-full text-xs font-mono font-semibold shadow-lg transition-colors"
            style={{ background: colors.badgeBg, color: colors.badgeText }}
          >
            {labels.newMessages} ↓
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-1 font-mono text-xs" style={{ color: "#cc0000" }}>
          {error}
        </div>
      )}

      {/* Input bar */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-t"
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
          autoFocus
          className="flex-1 rounded-md px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 disabled:opacity-50 placeholder:opacity-50"
          style={{
            background: colors.inputBg,
            border: `1px solid ${colors.inputBorder}`,
            color: colors.inputText,
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="flex items-center justify-center w-9 h-9 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          style={{ background: colors.sendBg, color: colors.sendText }}
          title={labels.send}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
