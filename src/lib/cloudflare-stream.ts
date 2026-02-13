const CF_API_BASE = "https://api.cloudflare.com/client/v4/accounts";

function getAccountId(): string {
  const id = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!id) throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");
  return id;
}

function getApiToken(): string {
  const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_STREAM_API_TOKEN is not set");
  return token;
}

/**
 * Create a direct-upload URL for Cloudflare Stream using TUS protocol.
 * Returns the TUS upload URL and the Stream video UID.
 */
export async function createDirectUpload(
  fileName: string,
  maxDurationSeconds = 3600
): Promise<{ uploadUrl: string; uid: string }> {
  const accountId = getAccountId();
  const token = getApiToken();

  // Base64-encode metadata values per TUS spec
  const nameB64 = Buffer.from(fileName).toString("base64");
  const maxDurB64 = Buffer.from(String(maxDurationSeconds)).toString("base64");

  const res = await fetch(
    `${CF_API_BASE}/${accountId}/stream?uploadType=tus`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(600 * 1024 * 1024), // 600 MB max
        "Upload-Metadata": `name ${nameB64}, maxDurationSeconds ${maxDurB64}`,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloudflare Stream upload creation failed: ${res.status} ${text}`);
  }

  const uploadUrl = res.headers.get("location");
  const uid = res.headers.get("stream-media-id");

  if (!uploadUrl || !uid) {
    throw new Error("Missing location or stream-media-id headers from Cloudflare");
  }

  return { uploadUrl, uid };
}

/**
 * Check if a Cloudflare Stream video is ready to stream.
 */
export async function getStreamVideoStatus(
  uid: string
): Promise<{ ready: boolean; error: boolean }> {
  const accountId = getAccountId();
  const token = getApiToken();

  const res = await fetch(`${CF_API_BASE}/${accountId}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 404) {
      return { ready: false, error: true };
    }
    throw new Error(`Cloudflare Stream status check failed: ${res.status}`);
  }

  const data = await res.json();
  const video = data.result;

  if (video.status?.state === "error") {
    return { ready: false, error: true };
  }

  return { ready: video.readyToStream === true, error: false };
}

/**
 * Get a public audio-only (M4A) download URL for a Cloudflare Stream video.
 * Triggers generation if not already available, then polls until ready.
 */
export async function getAudioDownloadUrl(uid: string): Promise<string> {
  const accountId = getAccountId();
  const token = getApiToken();
  const headers = { Authorization: `Bearer ${token}` };

  // Trigger audio download generation (409 if already exists — fine)
  await fetch(`${CF_API_BASE}/${accountId}/stream/${uid}/downloads/audio`, {
    method: "POST",
    headers,
  });

  // Poll for ready URL (max 2 minutes)
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const res = await fetch(
      `${CF_API_BASE}/${accountId}/stream/${uid}/downloads`,
      { headers },
    );

    if (res.ok) {
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const downloads: any[] = data.result ?? [];
      for (const dl of downloads) {
        if (dl.format === "m4a" && dl.status === "ready" && dl.url) {
          return dl.url as string;
        }
      }
    }

    await new Promise((r) => setTimeout(r, 3_000));
  }

  throw new Error("Audio download URL not ready within timeout");
}

/**
 * Delete a video from Cloudflare Stream.
 */
export async function deleteCloudflareStreamVideo(uid: string): Promise<void> {
  const accountId = getAccountId();
  const token = getApiToken();

  const res = await fetch(`${CF_API_BASE}/${accountId}/stream/${uid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error(`Cloudflare Stream delete failed: ${res.status}`);
  }
}
