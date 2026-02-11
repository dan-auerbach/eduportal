import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { storage, generateHashKey } from "@/lib/storage";
import { getTenantContext, hasMinRole } from "@/lib/tenant";
import { TenantAccessError } from "@/lib/tenant";
import sharp from "sharp";

const COVER_MAX_SIZE = 2000 * 1024; // 2000 KB = ~2 MB
const COVER_TARGET_SIZE = 75 * 1024; // 75 KB target after compression
const COVER_MAX_WIDTH = 1200; // max width in pixels

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".svg"]);

const SVG_DANGEROUS_PATTERNS = [
  /<script[\s>]/i,
  /on\w+\s*=/i,
  /javascript:/i,
  /data:text\/html/i,
  /<foreignObject/i,
  /<iframe/i,
  /<embed/i,
  /<object/i,
  /xlink:href\s*=\s*["'](?!#)/i,
  /href\s*=\s*["'](?!#)/i,
];

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

export async function POST(req: Request) {
  // 1. Auth check
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nepooblaščen dostop" }, { status: 401 });
  }

  // Only HR+ roles can upload cover images
  try {
    const ctx = await getTenantContext();
    if (!hasMinRole(ctx.effectiveRole, "HR")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch (e) {
    if (e instanceof TenantAccessError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Datoteka ni bila poslana" }, { status: 400 });
    }

    // 2. Size check
    if (file.size > COVER_MAX_SIZE) {
      return NextResponse.json(
        { error: "Slika ne sme presegati 1000 KB" },
        { status: 400 }
      );
    }

    // 3. MIME type check
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Dovoljeni formati: JPG, PNG, SVG" },
        { status: 400 }
      );
    }

    // 4. Extension check
    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: "Neveljavna končnica datoteke" },
        { status: 400 }
      );
    }

    // 5. Read buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    let processedBuffer: Buffer;
    let outputExt: string;
    let contentType: string;

    if (file.type === "image/svg+xml") {
      // SVG: sanitize
      const svgString = buffer.toString("utf-8");

      for (const pattern of SVG_DANGEROUS_PATTERNS) {
        if (pattern.test(svgString)) {
          return NextResponse.json(
            { error: "SVG vsebuje nedovoljeno vsebino" },
            { status: 400 }
          );
        }
      }

      if (!svgString.trimStart().startsWith("<")) {
        return NextResponse.json(
          { error: "Neveljavna SVG datoteka" },
          { status: 400 }
        );
      }

      processedBuffer = buffer;
      outputExt = ".svg";
      contentType = "image/svg+xml";
    } else {
      // Raster images: validate magic bytes, resize & compress to ≤75KB JPEG
      if (buffer.length < 4) {
        return NextResponse.json(
          { error: "Datoteka ni veljavna slika" },
          { status: 400 }
        );
      }

      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

      if (!isPng && !isJpeg) {
        return NextResponse.json(
          { error: "Datoteka ni veljavna slika" },
          { status: 400 }
        );
      }

      // Resize to max width & convert to JPEG with quality stepping
      let img = sharp(buffer).resize({
        width: COVER_MAX_WIDTH,
        withoutEnlargement: true,
      });

      // Start at quality 80, step down until ≤ target size
      let quality = 80;
      processedBuffer = await img.jpeg({ quality, mozjpeg: true }).toBuffer();

      while (processedBuffer.length > COVER_TARGET_SIZE && quality > 20) {
        quality -= 10;
        processedBuffer = await img.jpeg({ quality, mozjpeg: true }).toBuffer();
      }

      outputExt = ".jpg";
      contentType = "image/jpeg";
    }

    // 6. Save to storage
    const key = generateHashKey("covers", outputExt, processedBuffer);
    await storage.put(key, processedBuffer, contentType);

    // 7. Return the storage key as URL path
    const filename = key.split("/").pop()!;
    const coverUrl = `/api/covers/${filename}`;

    return NextResponse.json({ coverUrl, filename });
  } catch (error) {
    console.error("Cover upload error:", error);
    return NextResponse.json({ error: "Napaka pri nalaganju slike" }, { status: 500 });
  }
}
