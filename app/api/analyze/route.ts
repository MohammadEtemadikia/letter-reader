import { NextRequest } from "next/server";
import {
  archiveFiles,
  BATCH_SIZE,
  createStagingDir,
  listPendingGroups,
  MAX_FILES,
  outputXlsxPath,
  removeStagingDir,
  stageForRun,
  type PendingGroup,
} from "@/lib/inbox";
import { BLOCKED_TOOLS, checkHealth, spawnClaude, writeRunFiles } from "@/lib/claude-cli";
import { buildAnalysisSystemPrompt, buildInstruction, type InstructionGroup } from "@/lib/prompt";
import { listCompanies } from "@/lib/companies";
import { appendDocuments, buildRecord, listDocuments } from "@/lib/documents";
import type { DocumentRecord } from "@/lib/document";
import { writeWorkbook } from "@/lib/xlsx-writer";
import { COPY } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 3600;

type StreamEvent =
  | { t: "total"; count: number }
  | { t: "status"; message: string }
  | { t: "activity"; detail: string }
  | { t: "batch_result"; documents: DocumentRecord[] }
  | { t: "batch_error"; message: string }
  | { t: "done"; count: number; remaining: number }
  | { t: "error"; message: string };

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = /```json\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  const slice = start !== -1 && end !== -1 ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(slice);
}

/** Takes groups in order until the next one would push the total file count past MAX_FILES. */
function selectWithinLimit(groups: PendingGroup[]): { selected: PendingGroup[]; remaining: number } {
  const selected: PendingGroup[] = [];
  let total = 0;
  for (const g of groups) {
    if (total + g.files.length > MAX_FILES) break;
    selected.push(g);
    total += g.files.length;
  }
  return { selected, remaining: groups.length - selected.length };
}

function chunkByFileCount(groups: PendingGroup[], maxFilesPerBatch: number): PendingGroup[][] {
  const batches: PendingGroup[][] = [];
  let current: PendingGroup[] = [];
  let currentFiles = 0;
  for (const g of groups) {
    if (current.length > 0 && currentFiles + g.files.length > maxFilesPerBatch) {
      batches.push(current);
      current = [];
      currentFiles = 0;
    }
    current.push(g);
    currentFiles += g.files.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  let effort = "high";

  try {
    const body = await request.json().catch(() => ({}));
    const req = String(body?.effort ?? "high");
    effort = ["low", "medium", "high", "xhigh"].includes(req) ? req : "high";
  } catch {
    /* defaults above */
  }

  const t = COPY;

  const allGroups = await listPendingGroups();
  if (allGroups.length === 0) {
    return Response.json({ error: t.errorNoFiles }, { status: 400 });
  }

  const { selected, remaining } = selectWithinLimit(allGroups);

  const health = await checkHealth();
  if (health.state !== "ok") {
    const message =
      health.state === "not-installed"
        ? t.healthNotInstalled
        : health.state === "not-logged-in"
          ? t.healthNotLoggedIn
          : t.healthUnknown(health.detail);
    return Response.json({ error: message }, { status: 503 });
  }

  const companies = await listCompanies();
  const validCompanyIds = new Set(companies.map((c) => c.id));
  const today = new Date().toISOString().slice(0, 10);
  const systemPrompt = buildAnalysisSystemPrompt(companies, today);

  const batches = chunkByFileCount(selected, BATCH_SIZE);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };

      let totalDone = 0;

      send({ t: "total", count: selected.length });

      for (const [batchIndex, batchGroups] of batches.entries()) {
        if (request.signal.aborted) break;

        const docCount = batchGroups.length;
        send({
          t: "status",
          message:
            batches.length > 1
              ? `${t.statusStaging(docCount)} (${batchIndex + 1}/${batches.length})`
              : t.statusStaging(docCount),
        });

        const stagingDir = await createStagingDir();
        const flatFiles = batchGroups.flatMap((g) => g.files.map((f) => f.filename));
        const staged = await stageForRun(stagingDir, flatFiles);
        const stagedByOriginal = new Map(staged.map((s) => [s.original, s.stagedAs]));

        const instructionGroups: InstructionGroup[] = batchGroups.map((g) => {
          const pages = g.files.map((f) => stagedByOriginal.get(f.filename)!);
          return { representative: pages[0], pages };
        });
        // Maps the representative staged filename back to every original file in that group.
        const groupByRepresentative = new Map(
          batchGroups.map((g, i) => [instructionGroups[i].representative, g.files.map((f) => f.filename)]),
        );

        const runFileArgs = await writeRunFiles(stagingDir, systemPrompt, effort);
        const instruction = buildInstruction(instructionGroups);

        const child = spawnClaude(
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
        );

        const abort = () => child.kill("SIGTERM");
        request.signal.addEventListener("abort", abort);

        child.stdin.on("error", () => {});
        child.stdin.end(instruction);

        let stderrTail = "";
        let finalResultText = "";
        let gotResult = false;

        child.stderr.on("data", (chunk: Buffer) => {
          stderrTail = (stderrTail + chunk.toString()).slice(-2000);
        });

        child.on("error", (error: NodeJS.ErrnoException) => {
          send({ t: "batch_error", message: t.errorGeneric(error.message) });
        });

        let buffer = "";
        const handleLine = (line: string) => {
          if (!line.trim()) return;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line);
          } catch {
            return;
          }
          const type = event.type;

          if (type === "assistant") {
            const message = event.message as { content?: Array<Record<string, unknown>> } | undefined;
            for (const block of message?.content ?? []) {
              if (block.type !== "tool_use") continue;
              const input = (block.input ?? {}) as Record<string, unknown>;
              const filePath = input.file_path;
              if (block.name === "Read" && typeof filePath === "string") {
                send({ t: "activity", detail: t.statusReading(filePath.split(/[/\\]/).pop() ?? filePath) });
              }
            }
            return;
          }

          if (type === "result") {
            gotResult = true;
            const isError = event.is_error === true;
            finalResultText = typeof event.result === "string" ? event.result : "";
            if (isError) {
              send({ t: "batch_error", message: t.errorGeneric(finalResultText || stderrTail || "unknown") });
            }
          }
        };

        child.stdout.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) handleLine(line);
        });

        await new Promise<void>((resolve) => {
          child.on("close", async (code, signal) => {
            if (buffer.trim()) handleLine(buffer);

            if (signal === "SIGTERM") {
              send({ t: "status", message: t.statusStopped });
              resolve();
              return;
            }

            if (!gotResult || !finalResultText) {
              if (code !== 0) {
                send({ t: "batch_error", message: t.errorGeneric(stderrTail.trim() || `exit ${code}`) });
              }
              resolve();
              return;
            }

            let parsed: unknown;
            try {
              parsed = extractJson(finalResultText);
            } catch {
              send({ t: "batch_error", message: t.errorParse });
              resolve();
              return;
            }
            if (!Array.isArray(parsed)) {
              send({ t: "batch_error", message: t.errorParse });
              resolve();
              return;
            }

            const documents: DocumentRecord[] = [];
            const resolvedOriginals: string[] = [];

            for (const raw of parsed) {
              if (typeof raw !== "object" || raw === null) continue;
              const item = raw as Record<string, unknown>;
              const stagedRepresentative = text(item.filename);
              const originals = groupByRepresentative.get(stagedRepresentative);

              // An id the model invented is worse than no id at all: it would
              // file the document under a company that doesn't exist and hide
              // it from every company tab.
              const claimedId = text(item.company_id).trim();
              const companyId = validCompanyIds.has(claimedId) ? claimedId : "";

              documents.push(
                buildRecord(
                  originals ?? (stagedRepresentative ? [stagedRepresentative] : []),
                  {
                    language: text(item.language).trim().toLowerCase(),
                    sender: text(item.sender),
                    recipient: text(item.recipient),
                    date: text(item.date),
                    subject: text(item.subject),
                    short_summary: text(item.short_summary),
                    full_description: text(item.full_description),
                    action_needed: text(item.action_needed),
                  },
                  {
                    companyId,
                    companyGuess: text(item.company_name) || text(item.recipient),
                    companyConfidence:
                      item.company_confidence === "high" || item.company_confidence === "medium"
                        ? item.company_confidence
                        : "low",
                    status: item.status as DocumentRecord["status"],
                    docType: item.doc_type as DocumentRecord["docType"],
                    priority: item.priority as DocumentRecord["priority"],
                    dueDate: text(item.due_date),
                    issuedDate: text(item.issued_date),
                    amount: text(item.amount),
                    currency: text(item.currency),
                    reference: text(item.reference),
                  },
                ),
              );
              if (originals) resolvedOriginals.push(...originals);
            }

            if (documents.length > 0) {
              await appendDocuments(documents);
              await writeWorkbook(outputXlsxPath(), companies, await listDocuments());
              totalDone += documents.length;
            }
            if (resolvedOriginals.length > 0) {
              await archiveFiles(resolvedOriginals);
            }

            send({ t: "batch_result", documents });
            resolve();
          });
        });

        request.signal.removeEventListener("abort", abort);
        await removeStagingDir(stagingDir);
      }

      send({ t: "done", count: totalDone, remaining });
      closed = true;
      try {
        controller.close();
      } catch {
        /* already closed by an aborted client */
      }
    },

    async cancel() {
      /* individual batch staging dirs clean themselves up as each iteration finishes */
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
