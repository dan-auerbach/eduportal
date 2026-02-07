/**
 * Abstract storage layer — supports local filesystem (dev) and Cloudflare R2 (production).
 *
 * Usage:
 *   import { storage } from "@/lib/storage";
 *   await storage.put("logos/abc.png", buffer, "image/png");
 *   const data = await storage.get("logos/abc.png");
 *   await storage.delete("logos/abc.png");
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

// ── R2 provider (production / Cloudflare) ──────────────────────────────

class R2StorageProvider implements StorageProvider {
  private baseUrl: string;
  private accessKeyId: string;
  private secretAccessKey: string;
  private bucket: string;
  private accountId: string;

  constructor() {
    this.accountId = process.env.R2_ACCOUNT_ID || "";
    this.bucket = process.env.R2_BUCKET_NAME || "eduportal-uploads";
    this.accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
    this.secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
    this.baseUrl = `https://${this.accountId}.r2.cloudflarestorage.com`;
  }

  private async signedFetch(method: string, key: string, body?: Buffer | Uint8Array, contentType?: string): Promise<Response> {
    // Use S3-compatible API with simple auth headers
    const url = `${this.baseUrl}/${this.bucket}/${key}`;
    const date = new Date().toUTCString();

    // Build AWS Signature V4 style auth (simplified for R2)
    const headers: Record<string, string> = {
      "x-amz-date": date,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    };

    if (contentType) {
      headers["Content-Type"] = contentType;
    }

    // Use the @aws-sdk/client-s3 compatible approach through fetch with basic auth
    // R2 supports S3 API — we use presigned-style approach
    const { AwsClient } = await import("aws4fetch");
    const client = new AwsClient({
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      service: "s3",
      region: "auto",
    });

    return client.fetch(url, {
      method,
      headers: contentType ? { "Content-Type": contentType } : undefined,
      body: body ? new Uint8Array(body) : undefined,
    });
  }

  async put(key: string, data: Buffer | Uint8Array, contentType: string): Promise<void> {
    const res = await this.signedFetch("PUT", key, data, contentType);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`R2 PUT failed (${res.status}): ${text}`);
    }
  }

  async get(key: string): Promise<StorageObject | null> {
    const res = await this.signedFetch("GET", key);
    if (res.status === 404) return null;
    if (!res.ok) return null;

    const arrayBuffer = await res.arrayBuffer();
    const data = Buffer.from(arrayBuffer);
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    return { data, contentType, size: data.length };
  }

  async delete(key: string): Promise<void> {
    const res = await this.signedFetch("DELETE", key);
    if (!res.ok && res.status !== 404) {
      const text = await res.text();
      throw new Error(`R2 DELETE failed (${res.status}): ${text}`);
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
  if (backend === "r2") {
    return new R2StorageProvider();
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
