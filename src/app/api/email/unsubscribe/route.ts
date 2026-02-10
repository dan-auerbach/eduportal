import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/email";

/**
 * GET /api/email/unsubscribe?token=xxx&type=xxx
 *
 * One-click unsubscribe from notification emails.
 * Verifies JWT token, updates the corresponding EmailPreference field,
 * and returns a simple HTML success page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token");
  const type = searchParams.get("type");

  if (!token || !type) {
    return new NextResponse(renderHtml("Neveljavna povezava", "Manjka token ali tip."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const payload = await verifyUnsubscribeToken(token);

  if (!payload) {
    return new NextResponse(
      renderHtml("Neveljavna ali potečena povezava", "Povezava ni več veljavna. Nastavitve obvestil lahko spremenite v profilu."),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  try {
    // Map type to preference field
    const updateData: Record<string, unknown> = {};
    switch (type) {
      case "mentorQuestion":
        updateData.mentorQuestion = "MUTED";
        break;
      case "liveTrainingReminder":
        updateData.liveTrainingReminder = false;
        break;
      case "newKnowledgeDigest":
        updateData.newKnowledgeDigest = "MUTED";
        break;
      case "securityNotices":
        updateData.securityNotices = false;
        break;
      default:
        return new NextResponse(
          renderHtml("Neznana vrsta obvestila", `Tip "${type}" ni prepoznan.`),
          { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
        );
    }

    // Upsert preference
    await prisma.emailPreference.upsert({
      where: {
        userId_tenantId: {
          userId: payload.userId,
          tenantId: payload.tenantId,
        },
      },
      create: {
        userId: payload.userId,
        tenantId: payload.tenantId,
        ...updateData,
      },
      update: updateData,
    });

    return new NextResponse(
      renderHtml(
        "Uspešno odjavljeni",
        "Odjavljeni ste od teh obvestil. Nastavitve lahko kadarkoli spremenite v profilu.",
      ),
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (err) {
    console.error("[unsubscribe] Error:", err);
    return new NextResponse(
      renderHtml("Napaka", "Prišlo je do napake. Poskusite znova ali spremenite nastavitve v profilu."),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

function renderHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="sl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} – Mentor</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; color: #374151; }
    .card { max-width: 400px; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
    h1 { font-size: 1.25rem; margin-bottom: 0.5rem; }
    p { color: #6b7280; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
