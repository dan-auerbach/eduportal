/**
 * AI Cover Image Generator using OpenAI DALL-E 3.
 *
 * Generates a simple, flat-design illustration for educational modules.
 * Returns raw image buffer for further processing with sharp.
 */

import OpenAI from "openai";

export async function generateCoverImage(params: {
  title: string;
  description: string;
}): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("AI_IMAGE_NOT_CONFIGURED");
  }

  const openai = new OpenAI({ apiKey });

  // Build a safe, descriptive prompt
  const prompt = `Create a simple, flat-design, non-photorealistic illustration for an educational module.
Topic: "${params.title}"
Context: "${params.description.slice(0, 200)}"
Style: Minimal vector-like illustration, clean lines, soft pastel colors, abstract representation of the topic.
Important: No text, no words, no letters in the image. Only visual elements.`;

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1792x1024",
    response_format: "b64_json",
    quality: "standard",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("DALL-E returned empty response");
  }

  return Buffer.from(b64, "base64");
}
