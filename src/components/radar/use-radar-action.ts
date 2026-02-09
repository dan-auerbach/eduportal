"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/types";

/**
 * Tiny hook to DRY up icon-button actions on radar items.
 * Wraps a server action with useTransition + toast + router.refresh.
 */
export function useRadarAction<T = unknown>(
  action: () => Promise<ActionResult<T>>,
  successMessage: string,
  onSuccess?: (result: ActionResult<T>) => void,
) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function execute() {
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        if (successMessage) {
          toast.success(successMessage);
        }
        onSuccess?.(result);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return { execute, pending };
}
