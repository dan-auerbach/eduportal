/**
 * Soniox Speech-to-Text async API helper.
 *
 * Submits an audio URL for transcription and polls until complete.
 * Supports Slovenian (sl) and English (en).
 */

const SONIOX_API = "https://api.soniox.com/v1";

function getApiKey(): string {
  const key = process.env.SONIOX_API_KEY;
  if (!key) throw new Error("SONIOX_API_KEY is not set");
  return key;
}

async function sonioxFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${SONIOX_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Soniox API error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Transcribe audio from a public URL.
 * Polls until transcription is complete and returns plain text.
 *
 * @param audioUrl - Public URL to M4A/MP4/MP3 audio file
 * @param language - Language hint: "sl" or "en"
 * @returns Plain text transcription
 */
export async function transcribeAudio(
  audioUrl: string,
  language: string,
): Promise<string> {
  // Step 1: Create transcription job
  const createRes = await sonioxFetch("/transcriptions", {
    method: "POST",
    body: JSON.stringify({
      model: "stt-async-v4",
      audio_url: audioUrl,
      language_hints: [language],
    }),
  });

  const transcriptionId: string = createRes.id;
  if (!transcriptionId) {
    throw new Error("Soniox: missing transcription ID in response");
  }

  console.log(`[soniox] Created transcription: ${transcriptionId}`);

  // Step 2: Poll until completed (max 10 minutes)
  const deadline = Date.now() + 10 * 60_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3_000));

    const status = await sonioxFetch(`/transcriptions/${transcriptionId}`);

    if (status.status === "completed") {
      break;
    }

    if (status.status === "error") {
      throw new Error(
        `Soniox transcription failed: ${status.error_message ?? "unknown error"}`,
      );
    }

    // Still processing — continue polling
    console.log(`[soniox] Status: ${status.status}`);
  }

  // Step 3: Get transcript — use top-level 'text' field (full transcript)
  const transcript = await sonioxFetch(
    `/transcriptions/${transcriptionId}/transcript`,
  );

  // Soniox returns { id, text, tokens[] } — use 'text' directly
  const text: string = transcript.text ?? "";

  if (!text.trim()) {
    throw new Error("Soniox returned empty transcript");
  }

  console.log(
    `[soniox] Transcription complete: ${text.length} chars`,
  );

  return text.trim();
}
