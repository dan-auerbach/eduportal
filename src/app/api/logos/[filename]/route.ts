import { readFile } from "fs/promises";
import path from "path";

const LOGO_DIR = path.join(process.env.STORAGE_DIR || "./storage/uploads", "logos");

// Strict filename pattern: hash-random.ext — no path traversal possible
const SAFE_FILENAME = /^[a-f0-9]+-[a-f0-9]+\.(png|svg)$/;

const MIME_MAP: Record<string, string> = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // 1. Validate filename strictly — prevent path traversal
  if (!SAFE_FILENAME.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  const ext = path.extname(filename);
  const mimeType = MIME_MAP[ext];
  if (!mimeType) {
    return new Response("Not found", { status: 404 });
  }

  // 2. Build path and ensure it stays within LOGO_DIR
  const filePath = path.join(LOGO_DIR, filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(LOGO_DIR);
  if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const buffer = await readFile(filePath);

    const headers: Record<string, string> = {
      "Content-Type": mimeType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=31536000, immutable",
    };

    // SVG: add CSP to prevent script execution
    if (ext === ".svg") {
      headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'";
      headers["Content-Disposition"] = "inline";
      headers["X-Content-Type-Options"] = "nosniff";
    }

    return new Response(buffer, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
