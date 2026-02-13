/**
 * AI Module Draft Generator using Claude API.
 *
 * Takes a transcript/text + language and generates a structured module
 * with sections, key takeaways, and quiz questions.
 * Output is validated via Zod before being returned.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// ── Output schema (matches DB model expectations) ────────────────────────────

export const AiModuleOutputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(1000),
  sections: z
    .array(
      z.object({
        title: z.string().min(1),
        content: z.string().min(1), // HTML
      }),
    )
    .min(3)
    .max(15),
  keyTakeaways: z.array(z.string()).min(3).max(10),
  quiz: z.object({
    questions: z
      .array(
        z.object({
          question: z.string().min(1),
          options: z
            .array(
              z.object({
                text: z.string().min(1),
                isCorrect: z.boolean(),
              }),
            )
            .min(2)
            .max(6),
          explanation: z.string().optional(),
        }),
      )
      .min(3)
      .max(10),
  }),
});

export type AiModuleOutput = z.infer<typeof AiModuleOutputSchema>;

// ── Generator ────────────────────────────────────────────────────────────────

export async function generateModuleDraft(params: {
  sourceText: string;
  language: "sl" | "en";
}): Promise<AiModuleOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const anthropic = new Anthropic({ apiKey });

  const langName = params.language === "sl" ? "slovenščini" : "English";
  const langInstruction =
    params.language === "sl"
      ? "Piši VSE v slovenščini. Ne uporabljaj angleščine."
      : "Write EVERYTHING in English.";

  // Truncate very long text to avoid token limits (max ~30k chars)
  const text =
    params.sourceText.length > 30_000
      ? params.sourceText.slice(0, 30_000) + "\n\n[...besedilo skrajšano...]"
      : params.sourceText;

  const systemPrompt = `Si strokovnjak za izobraževalne vsebine. Na podlagi podanega besedila (transkripcije ali zapiskov) ustvariš strukturiran izobraževalni modul v ${langName}.

Pravila:
- ${langInstruction}
- Vsebina naj bo praktična, jedrnata, s podnaslovi.
- Če česa ne moreš ugotoviti iz vira, napiši "Ni navedeno v viru".
- Odgovori IZKLJUČNO z veljavnim JSON objektom (brez markdown, brez komentarjev).

Zahtevana JSON struktura:
{
  "title": "Naslov modula (do 200 znakov)",
  "description": "Kratek opis modula (1-3 stavki, do 1000 znakov)",
  "sections": [
    {
      "title": "Naslov poglavja",
      "content": "<h3>Podnaslov</h3><p>Vsebina poglavja v HTML formatu. Uporabi <p>, <h3>, <ul>, <li>, <strong>, <em> značke.</p>"
    }
  ],
  "keyTakeaways": ["Ključna ugotovitev 1", "Ključna ugotovitev 2"],
  "quiz": {
    "questions": [
      {
        "question": "Vprašanje?",
        "options": [
          { "text": "Odgovor A", "isCorrect": false },
          { "text": "Odgovor B", "isCorrect": true },
          { "text": "Odgovor C", "isCorrect": false },
          { "text": "Odgovor D", "isCorrect": false }
        ],
        "explanation": "Kratka razlaga pravilnega odgovora"
      }
    ]
  }
}

Omejitve:
- sections: 5–12 poglavij
- keyTakeaways: 5–10 ključnih ugotovitev
- quiz.questions: 5–10 vprašanj
- Vsako vprašanje ima natanko 4 opcije, od katerih je 1 pravilna (isCorrect: true)
- content mora biti veljaven HTML (ne markdown)`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `Ustvari izobraževalni modul iz naslednjega besedila:\n\n${text}`,
      },
    ],
    system: systemPrompt,
  });

  const aiText =
    response.content[0].type === "text"
      ? response.content[0].text.trim()
      : "";

  if (!aiText) {
    throw new Error("Claude returned empty response");
  }

  // Parse JSON — handle potential markdown code blocks
  let jsonStr = aiText;
  const codeBlockMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error("[ai] Failed to parse Claude JSON:", aiText.slice(0, 500));
    throw new Error("Claude returned invalid JSON");
  }

  // Validate with Zod
  const result = AiModuleOutputSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[ai] Zod validation failed:", result.error.issues);
    throw new Error(
      `AI output validation failed: ${result.error.issues.map((i) => i.message).join(", ")}`,
    );
  }

  return result.data;
}
