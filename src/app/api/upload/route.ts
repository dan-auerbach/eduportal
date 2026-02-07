import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { processUpload, UploadError } from "@/lib/upload";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const result = await processUpload(file);

    return NextResponse.json({
      storagePath: result.storagePath,
      mimeType: result.mimeType,
      checksum: result.checksum,
      fileSize: result.fileSize,
      fileName: file.name,
    });
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
