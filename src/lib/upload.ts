import { createHash } from "crypto";
import path from "path";
import fs from "fs/promises";
import { isAllowedMime, isAllowedExtension } from "./validators";

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "26214400", 10);

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export async function processUpload(file: File): Promise<{
  storagePath: string;
  mimeType: string;
  checksum: string;
  fileSize: number;
}> {
  // 1. Size check
  if (file.size > MAX_FILE_SIZE) {
    throw new UploadError("Datoteka presega 25 MB");
  }

  // 2. MIME whitelist
  if (!isAllowedMime(file.type)) {
    throw new UploadError(`Tip datoteke "${file.type}" ni dovoljen`);
  }

  // 3. Extension vs MIME match
  if (!isAllowedExtension(file.name, file.type)) {
    throw new UploadError("Končnica datoteke ne ustreza tipu");
  }

  // 4. Read and calculate checksum
  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");

  // 5. Save to private storage
  const storageDir = process.env.STORAGE_DIR || "./storage/uploads";
  await fs.mkdir(storageDir, { recursive: true });

  const filename = `${Date.now()}-${checksum.slice(0, 8)}-${sanitizeFilename(file.name)}`;
  const storagePath = path.join(storageDir, filename);
  await fs.writeFile(storagePath, buffer);

  return { storagePath, mimeType: file.type, checksum, fileSize: file.size };
}
