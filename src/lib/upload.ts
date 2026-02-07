import { createHash } from "crypto";
import { isAllowedMime, isAllowedExtension } from "./validators";
import { storage, generateStorageKey } from "./storage";

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || "26214400", 10);

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

  // 5. Save to storage (local filesystem or R2)
  const key = generateStorageKey("attachments", file.name, buffer);
  await storage.put(key, buffer, file.type);

  return { storagePath: key, mimeType: file.type, checksum, fileSize: file.size };
}
