import { storage } from "@/lib/storage";

// Strict filename pattern: hash-random.ext — no path traversal possible
const SAFE_FILENAME = /^[a-f0-9]+-[a-f0-9]+\.(png|jpg|svg)$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;

  // 1. Validate filename strictly
  if (!SAFE_FILENAME.test(filename)) {
    return new Response("Not found", { status: 404 });
  }

  // 2. Read from storage
  const key = `logos/${filename}`;
  const obj = await storage.get(key);
  if (!obj) {
    return new Response("Not found", { status: 404 });
  }

  const ext = filename.slice(filename.lastIndexOf("."));
  const headers: Record<string, string> = {
    "Content-Type": obj.contentType,
    "Content-Length": String(obj.size),
    "Cache-Control": "public, max-age=31536000, immutable",
  };

  // SVG: add CSP to prevent script execution
  if (ext === ".svg") {
    headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'";
    headers["Content-Disposition"] = "inline";
    headers["X-Content-Type-Options"] = "nosniff";
  }

  return new Response(new Uint8Array(obj.data), { headers });
}
