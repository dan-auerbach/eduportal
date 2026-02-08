/**
 * Download attachment by storagePath.
 *
 * Used for files stored in section.content JSON (ATTACHMENT / MIXED types).
 * Validates that the storagePath belongs to a section in the user's tenant.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantContext, TenantAccessError } from "@/lib/tenant";
import { storage } from "@/lib/storage";

export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await getTenantContext();
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return new Response(e.message, { status: 403 });
    }
    return new Response("Unauthorized", { status: 401 });
  }

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return new Response("Missing path parameter", { status: 400 });
  }

  // Validate: path must start with "attachments/" (prevent arbitrary file access)
  if (!path.startsWith("attachments/")) {
    return new Response("Invalid path", { status: 400 });
  }

  // Verify that a section in this tenant contains this storagePath in its content
  const section = await prisma.section.findFirst({
    where: {
      tenantId: ctx.tenantId,
      content: { contains: path },
      type: { in: ["ATTACHMENT", "MIXED"] },
    },
    select: { id: true },
  });

  if (!section) {
    return new Response("Not found", { status: 404 });
  }

  // Fetch from storage
  const obj = await storage.get(path);
  if (!obj) {
    return new Response("File not found", { status: 404 });
  }

  // Extract filename from the storagePath for the Content-Disposition header
  const fileName = path.split("/").pop()?.replace(/^\d+-[a-f0-9]+-[a-f0-9]+-/, "") || "download";
  const safeFileName = fileName.replace(/[^\w.\-]/g, "_");

  return new Response(new Uint8Array(obj.data), {
    headers: {
      "Content-Type": obj.contentType,
      "Content-Disposition": `inline; filename="${safeFileName}"`,
      "Content-Length": String(obj.size),
    },
  });
}
