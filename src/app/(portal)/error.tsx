"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[portal] page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <AlertTriangle className="h-10 w-10 text-destructive/50 mb-4" />
      <h2 className="text-lg font-semibold mb-1">Prišlo je do napake</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        Stran ni bilo mogoče naložiti. Poskusite znova ali se vrnite na pregled.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
          Na pregled
        </Button>
        <Button onClick={reset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Poskusi znova
        </Button>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-muted-foreground/50">
          Ref: {error.digest}
        </p>
      )}
    </div>
  );
}
