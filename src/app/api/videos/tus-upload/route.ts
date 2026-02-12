import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * TUS-compatible proxy endpoint for Cloudflare Stream direct creator uploads.
 *
 * tus-js-client sends a POST here with TUS headers (Upload-Length, Upload-Metadata,
 * Tus-Resumable). We proxy that to Cloudflare's API and return the CF upload URL
 * in the Location header. After that, tus-js-client sends PATCH requests directly
 * to Cloudflare — no further requests hit our server.
 *
 * This avoids the CORS issue where tus-js-client sends a HEAD request to the
 * uploadUrl (which Cloudflare doesn't support from browsers).
 */
export async function POST(request: NextRequest) {
  try {
    const sectionId = request.nextUrl.searchParams.get("sectionId");
    if (!sectionId) {
      return new NextResponse("Missing sectionId", { status: 400 });
    }

    // Authenticate
    const currentUser = await getCurrentUser();
    const ctx = await getTenantContext();

    // Authorize
    const canManageAll = await hasPermission(currentUser, "MANAGE_ALL_MODULES");
    const canManageOwn = await hasPermission(currentUser, "MANAGE_OWN_MODULES");
    if (!canManageAll && !canManageOwn) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Validate section exists & belongs to tenant
    const section = await prisma.section.findUnique({
      where: { id: sectionId, tenantId: ctx.tenantId },
      include: { module: { select: { createdById: true } } },
    });

    if (!section) {
      return new NextResponse("Section not found", { status: 404 });
    }

    if (!canManageAll && section.module.createdById !== currentUser.id) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Read TUS headers from the client
    const uploadLength =
      request.headers.get("Upload-Length") || String(600 * 1024 * 1024);
    const uploadMetadata = request.headers.get("Upload-Metadata") || "";

    // Proxy to Cloudflare Stream API
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;

    if (!accountId || !token) {
      console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_API_TOKEN");
      return new NextResponse("Server configuration error", { status: 500 });
    }

    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?direct_user=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": uploadLength,
          "Upload-Metadata": uploadMetadata,
        },
      }
    );

    if (!cfRes.ok) {
      const text = await cfRes.text();
      console.error("Cloudflare TUS creation failed:", cfRes.status, text);
      return new NextResponse(`Cloudflare error: ${cfRes.status}`, {
        status: 502,
      });
    }

    const uploadUrl = cfRes.headers.get("location");
    const uid = cfRes.headers.get("stream-media-id");

    if (!uploadUrl || !uid) {
      console.error("Missing location or stream-media-id from Cloudflare response");
      return new NextResponse("Invalid Cloudflare response", { status: 502 });
    }

    // Save UID to DB so we can track this upload
    await prisma.section.update({
      where: { id: sectionId },
      data: {
        videoSourceType: "CLOUDFLARE_STREAM",
        cloudflareStreamUid: uid,
        videoStatus: "PENDING",
      },
    });

    // Return 201 with Location header — tus-js-client reads the Location
    // and sends subsequent PATCH requests directly to Cloudflare
    return new NextResponse(null, {
      status: 201,
      headers: {
        Location: uploadUrl,
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": "0",
        "Stream-Media-Id": uid,
        "Access-Control-Expose-Headers":
          "Location, Tus-Resumable, Upload-Offset, Stream-Media-Id",
      },
    });
  } catch (error) {
    console.error("TUS proxy error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

/**
 * Handle CORS preflight for TUS POST from the browser.
 * tus-js-client sends an OPTIONS request before POST due to custom headers.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Upload-Length, Upload-Metadata, Tus-Resumable, Upload-Offset",
      "Access-Control-Expose-Headers":
        "Location, Tus-Resumable, Upload-Offset, Stream-Media-Id",
      "Access-Control-Max-Age": "86400",
    },
  });
}
