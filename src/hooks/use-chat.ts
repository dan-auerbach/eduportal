"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessageDTO } from "@/actions/chat";

// ── Types ────────────────────────────────────────────────────────────────────

export type ChatScope =
  | { kind: "TENANT" }
  | { kind: "MODULE"; moduleId: string };

type UseChatOptions = {
  scope: ChatScope;
  enabled?: boolean;
};

type UseChatReturn = {
  messages: ChatMessageDTO[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageDTO[]>>;
  isLoading: boolean;
  topic: string | null;
  lastId: string | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_BASE = 5_000;
const POLL_MAX = 15_000;
const SSE_RECONNECT_DELAY = 500;
const SSE_ERROR_THRESHOLD = 3;
const SSE_ERROR_WINDOW = 30_000;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useChat({ scope, enabled = true }: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [topic, setTopic] = useState<string | null>(null);

  const lastIdRef = useRef<string | null>(null);
  const seenIdsRef = useRef(new Set<string>());
  const sseRef = useRef<EventSource | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollIntervalRef = useRef(POLL_BASE);
  const emptyPollCountRef = useRef(0);
  const sseErrorsRef = useRef<number[]>([]);
  const useSseRef = useRef(true);
  const mountedRef = useRef(true);

  const moduleId = scope.kind === "MODULE" ? scope.moduleId : null;

  // ── Deduplicated message append ──────────────────────────────────────────

  const appendMessages = useCallback((newMsgs: ChatMessageDTO[]) => {
    if (newMsgs.length === 0) return;

    const toAdd = newMsgs.filter((m) => !seenIdsRef.current.has(m.id));
    if (toAdd.length === 0) return;

    for (const m of toAdd) {
      seenIdsRef.current.add(m.id);
    }

    const latestId = toAdd[toAdd.length - 1].id;
    lastIdRef.current = latestId;

    setMessages((prev) => [...prev, ...toAdd]);
  }, []);

  // ── Initial fetch via /api/chat ──────────────────────────────────────────

  const fetchInitial = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (moduleId) params.set("moduleId", moduleId);
      if (lastIdRef.current) params.set("after", lastIdRef.current);

      const res = await fetch(`/api/chat?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json();
      const newMsgs: ChatMessageDTO[] = data.messages ?? [];

      if (data.topic !== undefined) {
        setTopic(data.topic);
      }

      if (newMsgs.length > 0) {
        if (!lastIdRef.current) {
          // Initial load — replace all
          const ids = new Set(newMsgs.map((m) => m.id));
          seenIdsRef.current = ids;
          lastIdRef.current = newMsgs[newMsgs.length - 1].id;
          setMessages(newMsgs);
        } else {
          appendMessages(newMsgs);
        }
        emptyPollCountRef.current = 0;
        pollIntervalRef.current = POLL_BASE;
      } else if (lastIdRef.current) {
        emptyPollCountRef.current++;
        if (emptyPollCountRef.current >= 3) {
          pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.5, POLL_MAX);
        }
      }
    } catch {
      // Silently ignore
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [moduleId, appendMessages]);

  // ── SSE connection ───────────────────────────────────────────────────────

  const connectSSE = useCallback(() => {
    if (!useSseRef.current || !mountedRef.current) return;

    const params = new URLSearchParams();
    if (moduleId) params.set("moduleId", moduleId);
    if (lastIdRef.current) params.set("after", lastIdRef.current);

    const url = `/api/chat/stream?${params.toString()}`;
    const es = new EventSource(url);
    sseRef.current = es;

    es.addEventListener("message", (event) => {
      try {
        const msgs: ChatMessageDTO[] = JSON.parse(event.data);
        appendMessages(msgs);
        // Reset poll interval when SSE delivers messages
        emptyPollCountRef.current = 0;
        pollIntervalRef.current = POLL_BASE;
      } catch {
        // Ignore parse errors
      }
    });

    es.addEventListener("reconnect", () => {
      es.close();
      sseRef.current = null;
      if (mountedRef.current) {
        setTimeout(connectSSE, SSE_RECONNECT_DELAY);
      }
    });

    es.onerror = () => {
      es.close();
      sseRef.current = null;

      // Track errors for fallback decision
      const now = Date.now();
      sseErrorsRef.current.push(now);
      // Keep only errors within the window
      sseErrorsRef.current = sseErrorsRef.current.filter(
        (t) => now - t < SSE_ERROR_WINDOW,
      );

      if (sseErrorsRef.current.length >= SSE_ERROR_THRESHOLD) {
        // Too many errors — fall back to polling
        useSseRef.current = false;
        startPolling();
      } else if (mountedRef.current) {
        // Retry SSE after delay
        setTimeout(connectSSE, SSE_RECONNECT_DELAY);
      }
    };
  }, [moduleId, appendMessages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling fallback ─────────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    const poll = async () => {
      if (!mountedRef.current) return;

      try {
        const params = new URLSearchParams();
        if (moduleId) params.set("moduleId", moduleId);
        if (lastIdRef.current) params.set("after", lastIdRef.current);

        const res = await fetch(`/api/chat?${params.toString()}`);
        if (!res.ok) return;

        const data = await res.json();
        const newMsgs: ChatMessageDTO[] = data.messages ?? [];

        if (data.topic !== undefined) {
          setTopic(data.topic);
        }

        if (newMsgs.length > 0) {
          appendMessages(newMsgs);
          emptyPollCountRef.current = 0;
          pollIntervalRef.current = POLL_BASE;
        } else if (lastIdRef.current) {
          emptyPollCountRef.current++;
          if (emptyPollCountRef.current >= 3) {
            pollIntervalRef.current = Math.min(pollIntervalRef.current * 1.5, POLL_MAX);
          }
        }
      } catch {
        // Silently ignore
      }

      if (mountedRef.current) {
        pollTimeoutRef.current = setTimeout(poll, pollIntervalRef.current);
      }
    };

    poll();
  }, [moduleId, appendMessages]);

  // ── Main effect ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    mountedRef.current = true;

    // Reset state on scope change
    setMessages([]);
    setIsLoading(true);
    setTopic(null);
    lastIdRef.current = null;
    seenIdsRef.current = new Set();
    useSseRef.current = true;
    sseErrorsRef.current = [];
    emptyPollCountRef.current = 0;
    pollIntervalRef.current = POLL_BASE;

    // 1. Fetch initial messages
    fetchInitial().then(() => {
      if (!mountedRef.current) return;

      // 2. Start SSE for live updates (or polling fallback)
      if (useSseRef.current) {
        connectSSE();
      } else {
        startPolling();
      }
    });

    return () => {
      mountedRef.current = false;
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, [enabled, moduleId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    messages,
    setMessages,
    isLoading,
    topic,
    lastId: lastIdRef.current,
  };
}
