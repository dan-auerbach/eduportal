"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendChatMessage, joinChat } from "@/actions/chat";
import type { ChatMessageDTO } from "@/actions/chat";
import { Send } from "lucide-react";

// ── IRC nick colors (classic 8-color palette) ────────────────────────────────

const IRC_COLORS = [
  "#e06c75", // red
  "#61afef", // blue
  "#c678dd", // magenta
  "#e5c07b", // yellow
  "#56b6c2", // cyan
  "#98c379", // green
  "#d19a66", // orange
  "#be5046", // dark red
];

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return IRC_COLORS[Math.abs(hash) % IRC_COLORS.length];
}

// ── Props ────────────────────────────────────────────────────────────────────

type ChatRoomProps = {
  tenantSlug: string;
  tenantName: string;
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

export function ChatRoom({ tenantSlug, tenantName, userId, labels }: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewBadge, setShowNewBadge] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastIdRef = useRef<string | null>(null);
  const isNearBottomRef = useRef(true);

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

  // ── Fetch messages (polling) ───────────────────────────────────────────────

  const fetchMessages = useCallback(async () => {
    try {
      const afterParam = lastIdRef.current ? `?after=${lastIdRef.current}` : "";
      const res = await fetch(`/api/chat${afterParam}`);
      if (!res.ok) return;

      const data = await res.json();
      const newMsgs: ChatMessageDTO[] = data.messages ?? [];

      if (newMsgs.length > 0) {
        setMessages((prev) => {
          if (!lastIdRef.current) {
            // Initial load
            return newMsgs;
          }
          // Merge: append only truly new
          const existingIds = new Set(prev.map((m) => m.id));
          const toAdd = newMsgs.filter((m) => !existingIds.has(m.id));
          return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
        });

        lastIdRef.current = newMsgs[newMsgs.length - 1].id;

        // If user is near bottom, auto-scroll
        if (isNearBottomRef.current) {
          // Use requestAnimationFrame so DOM has updated
          requestAnimationFrame(() => scrollToBottom(true));
        } else if (lastIdRef.current) {
          // Show "new messages" badge
          setShowNewBadge(true);
        }
      }

      if (!initialLoaded) setInitialLoaded(true);
    } catch {
      // Silently ignore polling errors
    }
  }, [scrollToBottom, initialLoaded]);

  // ── Initial load + polling interval ────────────────────────────────────────

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 2500);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // ── Scroll to bottom on initial load ───────────────────────────────────────

  useEffect(() => {
    if (initialLoaded) {
      requestAnimationFrame(() => scrollToBottom());
    }
  }, [initialLoaded, scrollToBottom]);

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
      // Immediately append to local state for instant feedback
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === result.data.id);
        return exists ? prev : [...prev, result.data];
      });
      lastIdRef.current = result.data.id;
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
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[#0b0f14] -m-4 md:-m-6 rounded-none">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e2530]">
        <span className="text-[#61afef] font-mono text-lg font-bold">
          #{tenantSlug}
        </span>
        <span className="text-[#5c6370] text-sm font-mono">
          {labels.title}
        </span>
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={checkNearBottom}
        className="flex-1 overflow-y-auto px-4 py-2 font-mono text-sm leading-6 relative"
      >
        {initialLoaded && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <span className="text-[#5c6370] italic">{labels.noMessages}</span>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.type === "JOIN") {
            return (
              <div key={msg.id} className="text-[#56b6c2]">
                <span className="text-[#5c6370] mr-2">[{formatTime(msg.createdAt)}]</span>
                <span>* </span>
                <span className="font-semibold">{escapeHtml(msg.displayName)}</span>
                <span> {labels.joined} </span>
                <span className="text-[#61afef]">#{tenantSlug}</span>
              </div>
            );
          }

          if (msg.type === "SYSTEM") {
            return (
              <div key={msg.id} className="text-[#e5c07b]">
                <span className="text-[#5c6370] mr-2">[{formatTime(msg.createdAt)}]</span>
                <span>* {escapeHtml(msg.body)}</span>
              </div>
            );
          }

          // MESSAGE
          const nickColor = hashColor(msg.displayName);
          const isMe = msg.userId === userId;
          return (
            <div key={msg.id}>
              <span className="text-[#5c6370] mr-2">[{formatTime(msg.createdAt)}]</span>
              <span style={{ color: nickColor }} className="font-semibold">
                &lt;{escapeHtml(msg.displayName)}&gt;
              </span>
              <span className={isMe ? "text-[#e8ecf1] ml-1" : "text-[#d1d5db] ml-1"}>
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
            }}
            className="bg-[#61afef] text-[#0b0f14] px-3 py-1 rounded-full text-xs font-mono font-semibold shadow-lg hover:bg-[#4d9de0] transition-colors"
          >
            {labels.newMessages} ↓
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-1 text-[#e06c75] font-mono text-xs">
          {error}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[#1e2530] bg-[#0d1117]">
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
          className="flex-1 bg-[#161b22] border border-[#30363d] rounded-md px-3 py-2 text-[#d1d5db] font-mono text-sm placeholder:text-[#5c6370] focus:outline-none focus:border-[#61afef] focus:ring-1 focus:ring-[#61afef] disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="flex items-center justify-center w-9 h-9 rounded-md bg-[#61afef] text-[#0b0f14] hover:bg-[#4d9de0] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={labels.send}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
