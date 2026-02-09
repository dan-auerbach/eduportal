"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { t } from "@/lib/i18n";

// ── Constants (hardcoded, never from user input) ────────────────────────────

const TARGETVIDEO_SCRIPT_SRC =
  "https://player.target-video.com/player/build/targetvideo.min.js";
const TARGETVIDEO_PLAYER_ID = "49298";

// ── Singleton script loader ─────────────────────────────────────────────────

type LoadState = "idle" | "loading" | "loaded" | "error";

let _loadState: LoadState = "idle";
let _loadPromise: Promise<void> | null = null;
const _listeners = new Set<() => void>();

function notifyListeners() {
  _listeners.forEach((fn) => fn());
}

/**
 * Load the TargetVideo script exactly once (app-level singleton).
 * Returns a promise that resolves when `$bp` is available on `window`.
 */
function loadTargetVideoScript(): Promise<void> {
  if (_loadState === "loaded") return Promise.resolve();
  if (_loadState === "loading" && _loadPromise) return _loadPromise;

  _loadState = "loading";
  notifyListeners();

  _loadPromise = new Promise<void>((resolve, reject) => {
    // Check if script is already in the DOM (e.g., from another instance)
    const existing = document.querySelector(
      `script[src="${TARGETVIDEO_SCRIPT_SRC}"]`
    );
    if (existing && typeof (window as unknown as Record<string, unknown>).$bp === "function") {
      _loadState = "loaded";
      notifyListeners();
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = TARGETVIDEO_SCRIPT_SRC;
    script.async = true;

    script.onload = () => {
      // Small delay to ensure $bp is fully initialized after script eval
      setTimeout(() => {
        _loadState = "loaded";
        notifyListeners();
        resolve();
      }, 100);
    };

    script.onerror = () => {
      _loadState = "error";
      notifyListeners();
      reject(new Error("TargetVideo script failed to load"));
    };

    // Append to body (matching TargetVideo reference embed pattern)
    document.body.appendChild(script);
  });

  return _loadPromise;
}

/** React hook to track script load state */
function useTargetVideoScript(): LoadState {
  const [state, setState] = useState<LoadState>(_loadState);

  useEffect(() => {
    const handler = () => setState(_loadState);
    _listeners.add(handler);

    // Trigger load
    loadTargetVideoScript().catch(() => {
      /* error state handled via _loadState */
    });

    return () => {
      _listeners.delete(handler);
    };
  }, []);

  return state;
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * Renders a TargetVideo player for a given video ID.
 * - Loads the TargetVideo script once (singleton).
 * - Creates a unique container div by sectionId.
 * - Calls `$bp(containerId, { video, id })` after script load.
 * - Cleans up on unmount to prevent double-init.
 */
export function TargetVideoPlayer({
  videoId,
  sectionId,
}: {
  /** Numeric video ID (digits only, validated before rendering) */
  videoId: string;
  /** Section ID used to generate a unique deterministic container ID */
  sectionId: string;
}) {
  const scriptState = useTargetVideoScript();
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  // Deterministic container ID based on sectionId
  const containerId = `TargetVideo_${sectionId.replace(/[^a-zA-Z0-9_]/g, "_")}`;

  // Validate videoId: digits only (defensive, should already be validated)
  const safeVideoId = /^\d{4,}$/.test(videoId.trim()) ? videoId.trim() : null;

  useEffect(() => {
    if (scriptState !== "loaded" || !safeVideoId || initializedRef.current) {
      return;
    }

    // Ensure the container element exists in the DOM
    if (!containerRef.current) return;

    const bp = (window as unknown as Record<string, unknown>).$bp;
    if (typeof bp !== "function") return;

    // Initialize the player (width/height required per TargetVideo embed spec)
    try {
      (bp as (containerId: string, opts: Record<string, string>) => void)(
        containerId,
        {
          video: safeVideoId,
          id: TARGETVIDEO_PLAYER_ID,
          width: "640",
          height: "360",
        }
      );
      initializedRef.current = true;
    } catch (err) {
      console.error("TargetVideo player init failed:", err);
    }

    return () => {
      // Cleanup: remove any player DOM inside the container on unmount
      initializedRef.current = false;
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [scriptState, safeVideoId, containerId]);

  // Error state
  if (scriptState === "error" || !safeVideoId) {
    return (
      <div className="aspect-video w-full max-h-[45vh] rounded-lg overflow-hidden bg-muted flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">
            {t("admin.sectionEditor.targetVideoPlayerUnavailable")}
          </p>
        </div>
      </div>
    );
  }

  // Loading state
  if (scriptState === "loading" || scriptState === "idle") {
    return (
      <div className="aspect-video w-full max-h-[45vh] rounded-lg overflow-hidden bg-muted flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="aspect-video w-full max-h-[45vh] rounded-lg overflow-hidden bg-black">
      <div
        ref={containerRef}
        id={containerId}
        className="w-full h-full"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
