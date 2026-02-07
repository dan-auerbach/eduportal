import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createHash, randomBytes } from "crypto";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";

const COVER_MAX_SIZE = 1000 * 1024; // 1000 KB = ~1 MB
const COVER_MAX_WIDTH = 800; // resize to max 800px wide
const COVER_QUALITY = 80; // JPEG quality
const COVER_DIR = path.join(process.env.STORAGE_DIR || "./storage/uploads", "covers");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".svg"]);

export async function POST(req: Request) {
  // 1. Auth check
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nepooblaščen dostop" }, { status: 401 });
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
    const ext = path.extname(file.name).toLowerCase();
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

    if (file.type === "image/svg+xml") {
      // SVG: sanitize
      const svgString = buffer.toString("utf-8");

      const dangerousPatterns = [
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

      for (const pattern of dangerousPatterns) {
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
    } else {
      // Raster images: validate, resize, compress
      try {
        const metadata = await sharp(buffer).metadata();
        if (!metadata.width || !metadata.height) {
          return NextResponse.json(
            { error: "Neveljavna slikovna datoteka" },
            { status: 400 }
          );
        }

        // Resize to max width, preserve aspect ratio, compress as JPEG
        processedBuffer = await sharp(buffer)
          .resize(COVER_MAX_WIDTH, undefined, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: COVER_QUALITY, mozjpeg: true })
          .toBuffer();

        outputExt = ".jpg";
      } catch {
        return NextResponse.json(
          { error: "Datoteka ni veljavna slika" },
          { status: 400 }
        );
      }
    }

    // 6. Generate unique filename
    const hash = createHash("sha256").update(processedBuffer).digest("hex").slice(0, 12);
    const random = randomBytes(4).toString("hex");
    const filename = `${hash}-${random}${outputExt}`;

    // 7. Save to covers directory
    await fs.mkdir(COVER_DIR, { recursive: true });
    const filePath = path.join(COVER_DIR, filename);
    await fs.writeFile(filePath, processedBuffer);

    // 8. Return the public URL path
    const coverUrl = `/api/covers/${filename}`;

    return NextResponse.json({ coverUrl, filename });
  } catch (error) {
    console.error("Cover upload error:", error);
    return NextResponse.json({ error: "Napaka pri nalaganju slike" }, { status: 500 });
  }
}
