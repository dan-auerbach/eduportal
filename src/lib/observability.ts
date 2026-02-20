/**
 * Observability utilities for Mentor LMS.
 *
 * Provides structured JSON logging, requestId correlation, and best-effort
 * error persistence to the SystemError table. Replaces ad-hoc try/catch
 * in server actions and API routes.
 *
 * Usage:
 *   export async function myAction(arg: string): Promise<ActionResult<Data>> {
 *     return withAction("myAction", async ({ requestId, log }) => {
 *       const ctx = await getTenantContext();
 *       log({ step: "fetched context" });
 *       // ... business logic (no try/catch needed) ...
 *       return { success: true, data: result };
 *     });
 *   }
 */

import { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { TenantAccessError } from "./tenant";
import { ForbiddenError } from "./permissions";
import { timingSafeEqual } from "crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionResult } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type ActionContext = {
  /** Unique correlation ID for this request */
  requestId: string;
  /** Structured info log within the action */
  log: (data: Record<string, unknown>) => void;
};

type StructuredLog = {
  level: "info" | "error" | "warn";
  msg: string;
  requestId: string;
  route: string;
  durationMs: number;
  tenantId?: string;
  userId?: string;
  err?: { name: string; message: string };
  [key: string]: unknown;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for environments without crypto.randomUUID
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function structuredLog(log: StructuredLog): void {
  const output = JSON.stringify(log);
  if (log.level === "error") {
    console.error(output);
  } else if (log.level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

async function persistError(params: {
  requestId: string;
  route: string;
  message: string;
  stack?: string;
  tenantId?: string;
  tenantSlug?: string;
  userId?: string;
  meta?: Record<string, unknown>;
  severity?: string;
}): Promise<void> {
  try {
    await prisma.systemError.create({
      data: {
        requestId: params.requestId,
        route: params.route,
        message: params.message,
        stack: params.stack,
        tenantId: params.tenantId,
        tenantSlug: params.tenantSlug,
        userId: params.userId,
        meta: (params.meta as Prisma.InputJsonValue) ?? undefined,
        severity: params.severity ?? "ERROR",
      },
    });
  } catch {
    // Best-effort: if DB write fails, we already logged to console.
    // Never let error persistence crash the original request.
  }
}

/**
 * Extract tenant/user context from an error or caught value.
 * TenantAccessError and ForbiddenError may carry context info.
 */
function extractContext(e: unknown): { tenantId?: string; userId?: string; tenantSlug?: string } {
  // No context to extract from errors in our current codebase
  return {};
}

// ── withAction — Server Action wrapper ──────────────────────────────────────

/**
 * Wraps a server action with structured logging, requestId, timing, and
 * best-effort error persistence. Known auth errors (TenantAccessError,
 * ForbiddenError) are returned directly without DB logging.
 *
 * @param route - Name of the server action (e.g. "redeemReward")
 * @param fn - The action implementation
 */
export async function withAction<T>(
  route: string,
  fn: (actx: ActionContext) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const requestId = generateRequestId();
  const start = Date.now();

  const log = (data: Record<string, unknown>) => {
    structuredLog({
      level: "info",
      msg: "action_log",
      requestId,
      route,
      durationMs: Date.now() - start,
      ...data,
    });
  };

  try {
    const result = await fn({ requestId, log });
    const durationMs = Date.now() - start;

    // Log success (only for mutations, skip for reads to reduce noise)
    structuredLog({
      level: "info",
      msg: "action_ok",
      requestId,
      route,
      durationMs,
    });

    return result;
  } catch (e) {
    const durationMs = Date.now() - start;

    // Known auth errors — return directly, no DB log
    if (e instanceof TenantAccessError) {
      return { success: false, error: e.message };
    }
    if (e instanceof ForbiddenError) {
      return { success: false, error: e.message };
    }

    // Unexpected error — log structured + persist to DB
    const error = e instanceof Error ? e : new Error(String(e));
    const ctx = extractContext(e);

    structuredLog({
      level: "error",
      msg: "action_fail",
      requestId,
      route,
      durationMs,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      err: { name: error.name, message: error.message },
    });

    await persistError({
      requestId,
      route,
      message: error.message,
      stack: error.stack,
      tenantId: ctx.tenantId,
      tenantSlug: ctx.tenantSlug,
      userId: ctx.userId,
    });

    return {
      success: false,
      error: `Prišlo je do napake (ref: ${requestId})`,
      requestId,
    };
  }
}

// ── withApiRoute — API Route wrapper ────────────────────────────────────────

/**
 * Wraps an API route handler with structured logging and error persistence.
 */
export function withApiRoute(
  route: string,
  handler: (req: Request, context: { requestId: string }) => Promise<NextResponse | Response>,
): (req: Request) => Promise<NextResponse | Response> {
  return async (req: Request) => {
    const requestId = generateRequestId();
    const start = Date.now();

    try {
      const response = await handler(req, { requestId });
      const durationMs = Date.now() - start;

      structuredLog({
        level: "info",
        msg: "api_ok",
        requestId,
        route,
        durationMs,
      });

      return response;
    } catch (e) {
      const durationMs = Date.now() - start;
      const error = e instanceof Error ? e : new Error(String(e));

      structuredLog({
        level: "error",
        msg: "api_fail",
        requestId,
        route,
        durationMs,
        err: { name: error.name, message: error.message },
      });

      await persistError({
        requestId,
        route,
        message: error.message,
        stack: error.stack,
      });

      return NextResponse.json(
        { error: "Internal error", requestId },
        { status: 500 },
      );
    }
  };
}

// ── withCron — Cron endpoint wrapper ────────────────────────────────────────

function verifyCronSecret(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (header.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Wraps a cron endpoint with auth verification, structured logging, and
 * error persistence. The handler should return a NextResponse (the JSON
 * result body will be included in the structured log).
 */
export function withCron(
  route: string,
  handler: (req: Request) => Promise<NextResponse | Response>,
): (req: Request) => Promise<NextResponse | Response> {
  return async (req: Request) => {
    if (!verifyCronSecret(req)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const requestId = generateRequestId();
    const start = Date.now();

    try {
      const response = await handler(req);
      const durationMs = Date.now() - start;

      structuredLog({
        level: "info",
        msg: "cron_done",
        requestId,
        route,
        durationMs,
      });

      return response;
    } catch (e) {
      const durationMs = Date.now() - start;
      const error = e instanceof Error ? e : new Error(String(e));

      structuredLog({
        level: "error",
        msg: "cron_fail",
        requestId,
        route,
        durationMs,
        err: { name: error.name, message: error.message },
      });

      await persistError({
        requestId,
        route: `cron/${route}`,
        message: error.message,
        stack: error.stack,
        severity: "ERROR",
      });

      return NextResponse.json(
        { error: "Cron job failed", requestId },
        { status: 500 },
      );
    }
  };
}
