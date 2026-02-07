import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { storage, generateHashKey } from "@/lib/storage";

const LOGO_MAX_SIZE = 500 * 1024; // 500 KB

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

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Datoteka ni bila poslana" }, { status: 400 });
    }

    // 2. Size check
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

    // 6. Validate and determine output
    let processedBuffer: Buffer;
    let outputExt: string;
    let contentType: string;

    if (file.type === "image/svg+xml") {
      // SVG: sanitize — reject dangerous content
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
      // Raster images: accept as-is (no sharp dependency)
      // Basic validation: check magic bytes
      if (buffer.length < 4) {
        return NextResponse.json(
          { error: "Datoteka ni veljavna slika" },
          { status: 400 }
        );
      }

      // Check PNG magic bytes (89 50 4E 47) or JPEG (FF D8 FF)
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      const isJpeg = buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;

      if (!isPng && !isJpeg) {
        return NextResponse.json(
          { error: "Datoteka ni veljavna slika" },
          { status: 400 }
        );
      }

      processedBuffer = buffer;
      outputExt = isPng ? ".png" : ".jpg";
      contentType = isPng ? "image/png" : "image/jpeg";
    }

    // 7. Save to storage
    const key = generateHashKey("logos", outputExt, processedBuffer);
    await storage.put(key, processedBuffer, contentType);

    // 8. Return the storage key as URL path
    const filename = key.split("/").pop()!;
    const logoUrl = `/api/logos/${filename}`;

    return NextResponse.json({ logoUrl, filename });
  } catch (error) {
    console.error("Logo upload error:", error);
    return NextResponse.json({ error: "Napaka pri nalaganju logotipa" }, { status: 500 });
  }
}
