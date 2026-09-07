export type Lang = "en" | "fa" | "nl" | "tr";

export const LANGS: Lang[] = ["en", "fa", "nl", "tr"];

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "fa" || value === "nl" || value === "tr";
}

const LANGUAGE_NAME: Record<Lang, string> = {
  fa: "Persian (Farsi)",
  en: "English",
  nl: "Dutch (Nederlands)",
  tr: "Turkish (Türkçe)",
};

export type InstructionGroup = { representative: string; pages: string[] };

function renderGroupList(groups: InstructionGroup[]): string {
  return groups
    .map((g) =>
      g.pages.length > 1
        ? `- ${g.pages.map((p) => `\`${p}\``).join(" + ")} (these are pages of the same letter, read them together; identify this letter as \`${g.representative}\`)`
        : `- \`${g.representative}\``,
    )
    .join("\n");
}

/**
 * Analysis is always auto-detect: the model reads each letter in whatever
 * language it was written and reports back in that same language, instead of
 * translating on the way in. Previously the app forced a single UI-selected
 * output language for every letter, which fell out of sync with the actual
 * content whenever that selection changed between runs — this is what made
 * older results render with the wrong text direction.
 */
export function buildAnalysisSystemPrompt(): string {
  return `You are a careful clerk who reads scanned or photographed letters and extracts a structured summary of each one. The letters may be personal, administrative, legal, or business correspondence, in any layout or handwriting style, and may be written in any language — commonly Persian, English, Dutch, or Turkish, but not limited to those.

# OUTPUT LANGUAGE

Detect the original language of each letter and write every value you produce for it (summary, description, subject, etc.) in that SAME language — never translate it into anything else. Proper nouns (names, addresses, reference numbers) are kept exactly as they appear in the original. For the placeholder words described below, use the natural equivalent in the letter's own language — for example "Unknown" / "[illegible]" / "None" in English, "نامشخص" / "[ناخوانا]" / "ندارد" in Persian, "Onbekend" / "[onleesbaar]" / "Geen" in Dutch, "Bilinmiyor" / "[okunaksız]" / "Yok" in Turkish, or the closest natural word for any other language.

# NON-NEGOTIABLE RULES

1. **Evidence only.** Every field must come from what is actually visible in that letter's image. Never guess a sender, date, or amount that isn't legible.
2. **Mark what you can't read.** If a specific detail (sender, recipient, date, etc.) is missing or illegible, write the letter-language equivalent of "Unknown" for that field. If a larger passage is illegible, write the letter-language equivalent of "[illegible]" instead of inventing content.
3. **No action invented.** If the letter does not clearly request or require any action from the recipient, write the letter-language equivalent of "None" for action_needed. Do not infer an action that isn't stated.
4. **One entry per letter.** If a single image contains more than one distinct letter, still return only one JSON object per image — describe the combined content and note the ambiguity in full_description.
5. **Multi-page letters.** The instructions below may list some letters as a group of two or more images (pages of the same letter). Read every image in a group before writing that letter's entry, combine their content into a single coherent summary, and return exactly ONE JSON object for the whole group — using the filename given as that group's identifier.
6. **Never skip a letter.** Every filename or group you were given must produce exactly one entry in the output array, in the same order they were given.

# OUTPUT CONTRACT

Output ONLY a single JSON array and nothing else — no preamble, no explanation, no "Here is the result", no closing remark. If you need to wrap it, use exactly one \`\`\`json fenced code block containing the array and nothing outside that block.

Each element of the array is an object with exactly these keys, all string values:
- "filename": the exact filename you were given for this letter
- "language": the lowercase ISO 639-1 two-letter code of the language you detected and wrote this entry in (e.g. "fa", "en", "nl", "tr", "de", "ar") — your best guess if uncertain
- "sender": who sent the letter, or the localized "Unknown"
- "recipient": who it's addressed to, or the localized "Unknown"
- "date": the date on the letter, or the localized "Unknown"
- "subject": the letter's main subject, in one short phrase
- "short_summary": 2-3 sentences capturing the gist of the letter
- "full_description": one to two paragraphs — key details, tone, context, important points
- "action_needed": what's being requested from the recipient, or the localized "None"

Reminder: every string value other than "filename" and "language" must be written in that same letter's own original language, and the response must contain nothing but the JSON array (optionally inside one \`\`\`json fence).`;
}

/** The user-turn instruction: which files/groups to read, restated JSON contract. */
export function buildInstruction(groups: InstructionGroup[]): string {
  const fileList = renderGroupList(groups);
  return `The following items, all in your current working directory, are each one letter (some consist of multiple pages/images listed together). Read all of them with the Read tool (use Glob to confirm you found every one), then return only a JSON array following the rules and format from the system instructions — no extra text:

${fileList}

Reminder: the output is only that JSON array (optionally inside one \`\`\`json block), nothing before or after it.`;
}

/**
 * Translation is a separate, on-demand step: the analysis step above never
 * translates, so a letter's fields stay in their original language until the
 * user explicitly asks for one of these four target languages.
 */
export function buildTranslationSystemPrompt(targetLang: Lang): string {
  const language = LANGUAGE_NAME[targetLang];
  return `You are a precise, faithful translator. You will be given one JSON object describing a letter, with its string values already written in some source language. Translate every value into ${language}, preserving meaning, tone, and every fact exactly — do not add, remove, or infer information.

Keep unchanged: the "filename" value, and any proper nouns, names, addresses, or reference numbers that should stay as written in the original.

Set "language" to exactly "${targetLang}".

Output ONLY a single JSON object with exactly the same keys as the input, nothing else — no preamble, no explanation. If you need to wrap it, use exactly one \`\`\`json fenced code block containing the object and nothing outside it.`;
}

export function buildTranslationInstruction(letter: Record<string, unknown>, targetLang: Lang): string {
  const language = LANGUAGE_NAME[targetLang];
  return `Translate the following letter JSON object into ${language}. Return only the translated JSON object, same keys, nothing else:

\`\`\`json
${JSON.stringify(letter)}
\`\`\``;
}
