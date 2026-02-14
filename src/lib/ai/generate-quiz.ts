/**
 * AI Quiz Generator using Claude API.
 *
 * Generates quiz questions based on module content.
 * Extracted from generate-module-draft.ts for standalone use in the editor.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// ── Output schema ───────────────────────────────────────────────────────────

export const AiQuizOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z
          .array(
            z.object({
              text: z.string().min(1),
              isCorrect: z.boolean(),
            })
          )
          .min(2)
          .max(6),
      })
    )
    .min(3)
    .max(10),
});

export type AiQuizOutput = z.infer<typeof AiQuizOutputSchema>;

// ── Generator ───────────────────────────────────────────────────────────────

export async function generateQuiz(params: {
  title: string;
  description: string;
  sectionContent: { title: string; content: string }[];
  language: "sl" | "en";
  questionCount?: number;
}): Promise<AiQuizOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const anthropic = new Anthropic({ apiKey });

  const langName = params.language === "sl" ? "slovenščini" : "English";
  const langInstruction =
    params.language === "sl"
      ? "Piši VSE v slovenščini. Ne uporabljaj angleščine."
      : "Write EVERYTHING in English.";

  const qCount = params.questionCount ?? 5;

  // Truncate section content if too long
  let sectionsText = params.sectionContent
    .map((s) => {
      // Strip HTML tags for cleaner input
      const plainText = s.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return `## ${s.title}\n${plainText}`;
    })
    .join("\n\n");

  if (sectionsText.length > 20_000) {
    sectionsText = sectionsText.slice(0, 20_000) + "\n\n[...vsebina skrajšana...]";
  }

  const systemPrompt = `Si strokovnjak za pripravo kvizov za izobraževalne module. Na podlagi podanega modula ustvari kviz v ${langName}.

Pravila:
- ${langInstruction}
- Generiraj natanko ${qCount} vprašanj.
- Vsako vprašanje ima natanko 4 opcije, od katerih je 1 pravilna (isCorrect: true).
- Vprašanja naj preverjajo razumevanje ključnih konceptov, ne trivialnih dejstev.
- Vprašanja naj bodo jasna, nedvoumna.
- Odgovori IZKLJUČNO z veljavnim JSON objektom (brez markdown, brez komentarjev).

Zahtevana JSON struktura:
{
  "questions": [
    {
      "question": "Vprašanje?",
      "options": [
        { "text": "Odgovor A", "isCorrect": false },
        { "text": "Odgovor B", "isCorrect": true },
        { "text": "Odgovor C", "isCorrect": false },
        { "text": "Odgovor D", "isCorrect": false }
      ]
    }
  ]
}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Modul: "${params.title}"\nOpis: "${params.description}"\n\nVsebina poglavij:\n\n${sectionsText}\n\nUstvari kviz s ${qCount} vprašanji.`,
      },
    ],
    system: systemPrompt,
  });

  const aiText =
    response.content[0].type === "text" ? response.content[0].text.trim() : "";
  if (!aiText) throw new Error("Claude returned empty response");

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
    console.error("[ai-quiz] Failed to parse Claude JSON:", aiText.slice(0, 500));
    throw new Error("Claude returned invalid JSON");
  }

  const result = AiQuizOutputSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[ai-quiz] Zod validation failed:", result.error.issues);
    throw new Error(
      `AI output validation failed: ${result.error.issues.map((i) => i.message).join(", ")}`
    );
  }

  return result.data;
}
