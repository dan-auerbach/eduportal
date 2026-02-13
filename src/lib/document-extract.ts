/**
 * Document text extraction for PDF and Word files.
 *
 * Supports:
 *   - PDF → unpdf (serverless-compatible, no DOM required)
 *   - DOCX / DOC → mammoth
 *
 * Returns plain text. Throws on empty or unreadable documents.
 */

const MIME_PDF = "application/pdf";
const MIME_DOCX =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIME_DOC = "application/msword";

// ── Public API ────────────────────────────────────────────────────────────────

export async function extractTextFromDocument(
  blobUrl: string,
  mimeType: string,
): Promise<string> {
  // Download the file
  const res = await fetch(blobUrl);
  if (!res.ok) {
    throw new Error(`Failed to download document: ${res.status} ${res.statusText}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  let text: string;

  if (mimeType === MIME_PDF) {
    text = await extractFromPdf(buffer);
  } else if (mimeType === MIME_DOCX || mimeType === MIME_DOC) {
    text = await extractFromWord(buffer);
  } else {
    throw new Error(`Unsupported document type: ${mimeType}`);
  }

  // Clean up: collapse whitespace, trim
  text = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();

  // Strip control characters (keep newlines and tabs)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  if (!text) {
    throw new Error(
      "Dokument ne vsebuje berljivega besedila. Skenirani dokumenti (slike) niso podprti.",
    );
  }

  return text;
}

// ── PDF extraction ──────────────────────────────────────────────────────────

async function extractFromPdf(buffer: Buffer): Promise<string> {
  try {
    const { getDocumentProxy, extractText } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text ?? "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("password")) {
      throw new Error(
        "Zaščiten PDF — odstranite geslo in poskusite znova.",
      );
    }
    throw new Error(`Napaka pri branju PDF: ${message}`);
  }
}

// ── Word extraction ─────────────────────────────────────────────────────────

async function extractFromWord(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Napaka pri branju Word dokumenta: ${message}`);
  }
}
