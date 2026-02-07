import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createHash, randomBytes } from "crypto";
import path from "path";
import fs from "fs/promises";
import sharp from "sharp";

const LOGO_MAX_SIZE = 500 * 1024; // 500 KB
const LOGO_OUTPUT_SIZE = 256; // px — resize to 256x256 max
const LOGO_QUALITY = 80;
const LOGO_DIR = path.join(process.env.STORAGE_DIR || "./storage/uploads", "logos");

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/svg+xml",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".svg",
]);

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

    // 2. Size check (before reading into memory)
    if (file.size > LOGO_MAX_SIZE) {
      return NextResponse.json(
        { error: "Logotip ne sme presegati 500 KB" },
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

    // 4. Extension check — must match MIME
    const ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: "Neveljavna končnica datoteke" },
        { status: 400 }
      );
    }

    // 5. Read buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // 6. Validate actual image content (magic bytes)
    let processedBuffer: Buffer;
    let outputExt: string;

    if (file.type === "image/svg+xml") {
      // SVG: sanitize — strip scripts, event handlers, external references
      const svgString = buffer.toString("utf-8");

      // Reject SVG with suspicious content
      const dangerousPatterns = [
        /<script[\s>]/i,
        /on\w+\s*=/i, // onclick, onload, etc.
        /javascript:/i,
        /data:text\/html/i,
        /<foreignObject/i,
        /<iframe/i,
        /<embed/i,
        /<object/i,
        /xlink:href\s*=\s*["'](?!#)/i, // external xlink refs (allow internal #id)
        /href\s*=\s*["'](?!#)/i, // external hrefs in SVG
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(svgString)) {
          return NextResponse.json(
            { error: "SVG vsebuje nedovoljeno vsebino" },
            { status: 400 }
          );
        }
      }

      // Ensure it actually starts with SVG-like content
      if (!svgString.trimStart().startsWith("<")) {
        return NextResponse.json(
          { error: "Neveljavna SVG datoteka" },
          { status: 400 }
        );
      }

      processedBuffer = buffer;
      outputExt = ".svg";
    } else {
      // Raster images: validate with sharp, resize and compress
      try {
        const metadata = await sharp(buffer).metadata();
        if (!metadata.width || !metadata.height) {
          return NextResponse.json(
            { error: "Neveljavna slikovna datoteka" },
            { status: 400 }
          );
        }

        // Resize to max 256x256, preserving aspect ratio, and compress as PNG
        processedBuffer = await sharp(buffer)
          .resize(LOGO_OUTPUT_SIZE, LOGO_OUTPUT_SIZE, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .png({ quality: LOGO_QUALITY, compressionLevel: 9 })
          .toBuffer();

        outputExt = ".png";
      } catch {
        return NextResponse.json(
          { error: "Datoteka ni veljavna slika" },
          { status: 400 }
        );
      }
    }

    // 7. Generate unique filename
    const hash = createHash("sha256").update(processedBuffer).digest("hex").slice(0, 12);
    const random = randomBytes(4).toString("hex");
    const filename = `${hash}-${random}${outputExt}`;

    // 8. Save to logos directory
    await fs.mkdir(LOGO_DIR, { recursive: true });
    const filePath = path.join(LOGO_DIR, filename);
    await fs.writeFile(filePath, processedBuffer);

    // 9. Return the public URL path
    const logoUrl = `/api/logos/${filename}`;

    return NextResponse.json({ logoUrl, filename });
  } catch (error) {
    console.error("Logo upload error:", error);
    return NextResponse.json({ error: "Napaka pri nalaganju logotipa" }, { status: 500 });
  }
}
