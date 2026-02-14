/**
 * AI Module Metadata Generator using Claude API.
 *
 * Generates improved title + description, and tags for existing modules.
 * Uses the same Claude model and validation patterns as generate-module-draft.ts.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// ── Output schemas ──────────────────────────────────────────────────────────

const MetadataOutputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
});

const TagsOutputSchema = z.array(z.string().min(1).max(30)).min(3).max(5);

export type MetadataOutput = z.infer<typeof MetadataOutputSchema>;

// ── Helpers ─────────────────────────────────────────────────────────────────

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

function parseJson(raw: string): unknown {
  let jsonStr = raw.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  return JSON.parse(jsonStr);
}

// ── generateModuleMetadata ──────────────────────────────────────────────────

export async function generateModuleMetadata(params: {
  currentTitle: string;
  currentDescription: string;
  sectionTitles: string[];
  language: "sl" | "en";
}): Promise<MetadataOutput> {
  const anthropic = getClient();

  const langName = params.language === "sl" ? "slovenščini" : "English";
  const langInstruction =
    params.language === "sl"
      ? "Piši VSE v slovenščini. Ne uporabljaj angleščine."
      : "Write EVERYTHING in English.";

  const systemPrompt = `Si strokovnjak za izobraževalne vsebine. Na podlagi obstoječega modula predlagaj boljši naslov in opis v ${langName}.

Pravila:
- ${langInstruction}
- Naslov: jasen, konkreten, do 200 znakov. Ni predolg.
- Opis: 1-3 stavki, jedrnato, do 1000 znakov. Pove, kaj se uporabnik nauči.
- Če obstoječ naslov/opis že dobro opisuje vsebino, ga le malenkost izboljšaj.
- Odgovori IZKLJUČNO z veljavnim JSON objektom (brez markdown, brez komentarjev).

Zahtevana JSON struktura:
{
  "title": "Naslov modula",
  "description": "Kratek opis modula"
}`;

  const sectionsInfo =
    params.sectionTitles.length > 0
      ? `\n\nPoglavja modula:\n${params.sectionTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
      : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Obstoječ naslov: "${params.currentTitle}"\nObstoječ opis: "${params.currentDescription}"${sectionsInfo}\n\nPredlagaj izboljšan naslov in opis.`,
      },
    ],
    system: systemPrompt,
  });

  const aiText =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";
  if (!aiText) throw new Error("Claude returned empty response");

  const parsed = parseJson(aiText);
  const result = MetadataOutputSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[ai-metadata] Zod validation failed:", result.error.issues);
    throw new Error(
      `AI output validation failed: ${result.error.issues.map((i) => i.message).join(", ")}`
    );
  }

  return result.data;
}

// ── generateModuleTags ──────────────────────────────────────────────────────

export async function generateModuleTags(params: {
  title: string;
  description: string;
  sectionTitles: string[];
  existingTags: string[];
  language: "sl" | "en";
}): Promise<string[]> {
  const anthropic = getClient();

  const langInstruction =
    params.language === "sl"
      ? "Piši oznake v slovenščini."
      : "Write tags in English.";

  const systemPrompt = `Si strokovnjak za kategorizacijo izobraževalnih vsebin. Generiraj natanko 5 kratkih oznak (tagov) za izobraževalni modul.

Pravila:
- ${langInstruction}
- Vsaka oznaka: 1-2 besedi, brez posebnih znakov.
- Ne ponavljaj obstoječih oznak.
- Oznake morajo biti specifične za temo modula, ne generične.
- Odgovori IZKLJUČNO z veljavnim JSON poljem (brez markdown, brez komentarjev).

Primer izhodnega formata:
["oznaka1", "oznaka2", "oznaka3", "oznaka4", "oznaka5"]`;

  const existingInfo =
    params.existingTags.length > 0
      ? `\nObstoječe oznake (ne ponavljaj): ${params.existingTags.join(", ")}`
      : "";

  const sectionsInfo =
    params.sectionTitles.length > 0
      ? `\nPoglavja: ${params.sectionTitles.join(", ")}`
      : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Naslov: "${params.title}"\nOpis: "${params.description}"${sectionsInfo}${existingInfo}\n\nGeneriraj 5 oznak.`,
      },
    ],
    system: systemPrompt,
  });

  const aiText =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";
  if (!aiText) throw new Error("Claude returned empty response");

  const parsed = parseJson(aiText);
  const result = TagsOutputSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[ai-tags] Zod validation failed:", result.error.issues);
    throw new Error(
      `AI output validation failed: ${result.error.issues.map((i) => i.message).join(", ")}`
    );
  }

  return result.data;
}
