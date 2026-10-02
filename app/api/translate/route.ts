import { NextRequest } from "next/server";
import { createStagingDir, removeStagingDir } from "@/lib/inbox";
import { BLOCKED_TOOLS, checkHealth, runClaudeOnce, writeRunFiles } from "@/lib/claude-cli";
import { buildTranslationInstruction, buildTranslationSystemPrompt, isLang } from "@/lib/prompt";
import { TRANSLATABLE_KEYS, type ExtractedFields } from "@/lib/document";

export const runtime = "nodejs";
export const maxDuration = 120;

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = /```json\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const slice = start !== -1 && end !== -1 ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(slice);
}

function isFieldsLike(value: unknown): value is ExtractedFields {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return TRANSLATABLE_KEYS.every((key) => typeof v[key] === "string");
}

/**
 * Translates only the prose half of a document. The filing fields (status,
 * type, company, dates, amounts) are codes, not language, so they never make
 * the round trip — which also keeps this call small and fast.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const fields = body?.fields;
  const targetLang = body?.targetLang;

  if (!isFieldsLike(fields) || !isLang(targetLang)) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  const health = await checkHealth();
  if (health.state !== "ok") {
    return Response.json({ error: "Claude Code is not ready" }, { status: 503 });
  }

  const payload: Record<string, string> = { language: fields.language };
  for (const key of TRANSLATABLE_KEYS) payload[key] = fields[key];

  const stagingDir = await createStagingDir();
  try {
    const runFileArgs = await writeRunFiles(stagingDir, buildTranslationSystemPrompt(targetLang), "medium");
    const instruction = buildTranslationInstruction(payload, targetLang);

    const result = await runClaudeOnce(
      [
        "--print",
        "--output-format",
        "stream-json",
        "--verbose",
        "--model",
        "claude-opus-5",
        "--permission-mode",
        "default",
        "--strict-mcp-config",
        ...runFileArgs,
        "--disallowed-tools",
        ...BLOCKED_TOOLS,
      ],
      stagingDir,
      instruction,
    );

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = extractJsonObject(result.text);
    } catch {
      return Response.json({ error: "Claude Code's response could not be read as valid JSON." }, { status: 502 });
    }
    if (typeof parsed !== "object" || parsed === null) {
      return Response.json({ error: "Claude Code's response could not be read as valid JSON." }, { status: 502 });
    }

    const item = parsed as Record<string, unknown>;
    const translated: ExtractedFields = {
      language: targetLang,
      sender: "",
      recipient: "",
      date: "",
      subject: "",
      short_summary: "",
      full_description: "",
      action_needed: "",
    };
    for (const key of TRANSLATABLE_KEYS) {
      translated[key] = typeof item[key] === "string" ? (item[key] as string) : fields[key];
    }

    return Response.json({ fields: translated });
  } finally {
    await removeStagingDir(stagingDir);
  }
}
