/**
 * Abstract storage layer — supports local filesystem (dev) and Vercel Blob (production).
 *
 * Usage:
 *   import { storage } from "@/lib/storage";
 *   await storage.put("logos/abc.png", buffer, "image/png");
 *   const data = await storage.get("logos/abc.png");
 *   await storage.delete("logos/abc.png");
 *
 * Set STORAGE_BACKEND="vercel-blob" and BLOB_READ_WRITE_TOKEN for production.
 */

import { createHash, randomBytes } from "crypto";

// ── Types ──────────────────────────────────────────────────────────────

export interface StorageObject {
  data: Buffer | Uint8Array;
  contentType: string;
  size: number;
}

export interface StorageProvider {
  put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
}

// ── Local filesystem provider (dev) ────────────────────────────────────

class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = process.env.STORAGE_DIR || "./storage/uploads";
  }

  async put(key: string, data: Buffer | Uint8Array, _contentType: string): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(this.baseDir, key);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async get(key: string): Promise<StorageObject | null> {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(this.baseDir, key);

    try {
      const data = await fs.readFile(filePath);
      const ext = path.extname(key).toLowerCase();
      const contentType = MIME_FROM_EXT[ext] || "application/octet-stream";
      return { data, contentType, size: data.length };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const fs = await import("fs/promises");
    const path = await import("path");
    const filePath = path.join(this.baseDir, key);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may not exist — ignore
    }
  }
}

// ── Vercel Blob provider (production) ──────────────────────────────────

class VercelBlobStorageProvider implements StorageProvider {
  async put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<void> {
    const { put } = await import("@vercel/blob");
    // Copy to plain ArrayBuffer to satisfy strict TS (Buffer<ArrayBufferLike> issue)
    const bytes = new Uint8Array(data);
    await put(key, new Blob([bytes], { type: contentType }), {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
  }

  async get(key: string): Promise<StorageObject | null> {
    const { list } = await import("@vercel/blob");

    // Find the blob by prefix match
    const result = await list({ prefix: key, limit: 1 });
    const blob = result.blobs.find((b) => b.pathname === key);
    if (!blob) return null;

    // Fetch the actual content (use downloadUrl if available for private blob support)
    const blobAny = blob as unknown as Record<string, unknown>;
    const fetchUrl = blobAny.downloadUrl ? String(blobAny.downloadUrl) : blob.url;
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    return { data, contentType, size: data.length };
  }

  async delete(key: string): Promise<void> {
    const { list, del } = await import("@vercel/blob");

    // Find the blob URL first
    const result = await list({ prefix: key, limit: 1 });
    const blob = result.blobs.find((b) => b.pathname === key);
    if (blob) {
      await del(blob.url);
    }
  }
}

// ── MIME lookup ────────────────────────────────────────────────────────

const MIME_FROM_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

// ── Singleton ──────────────────────────────────────────────────────────

function createStorage(): StorageProvider {
  const backend = process.env.STORAGE_BACKEND || "local";
  if (backend === "vercel-blob") {
    return new VercelBlobStorageProvider();
  }
  return new LocalStorageProvider();
}

const globalForStorage = globalThis as unknown as {
  storage: StorageProvider | undefined;
};

export const storage: StorageProvider =
  globalForStorage.storage ?? createStorage();

if (process.env.NODE_ENV !== "production") {
  globalForStorage.storage = storage;
}

// ── Helpers ────────────────────────────────────────────────────────────

export function generateStorageKey(
  prefix: string,
  filename: string,
  buffer: Buffer | Uint8Array
): string {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  const random = randomBytes(4).toString("hex");
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return `${prefix}/${Date.now()}-${hash}-${random}-${safeName}`;
}

export function generateHashKey(
  prefix: string,
  ext: string,
  buffer: Buffer | Uint8Array
): string {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  const random = randomBytes(4).toString("hex");
  return `${prefix}/${hash}-${random}${ext}`;
}
