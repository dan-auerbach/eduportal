import type { Role, Permission, ModuleStatus, Difficulty, SectionType } from "@/generated/prisma/client";

export type { Role, Permission, ModuleStatus, Difficulty, SectionType };

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; requestId?: string };
