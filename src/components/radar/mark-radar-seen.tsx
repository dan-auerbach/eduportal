"use client";

import { useEffect, useRef } from "react";
import { markRadarSeen } from "@/actions/radar";

/**
 * Invisible component that marks radar as "seen" when the user visits the page.
 * Updates the RadarSeen record so the unread counter resets.
 */
export function MarkRadarSeen() {
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;
    markRadarSeen().catch(() => {
      // silently ignore
    });
  }, []);

  return null;
}
