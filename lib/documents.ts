import crypto from "crypto";
import path from "path";
import { dataDir } from "./inbox";
import { readJsonFile, withFileLock, writeJsonFile } from "./json-store";
import type { DocumentRecord, ExtractedFields } from "./document";
import { isDocType, isPriority, isStatus } from "./taxonomy";

/**
 * The filing cabinet. Unlike the old spreadsheet-only flow, a processed
 * document stays here as a live record the user can re-file, annotate and
 * mark handled — the spreadsheet is regenerated from this, not the other way
 * round.
 */

function documentsPath(): string {
  return path.join(dataDir(), "documents.json");
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** ISO yyyy-mm-dd or "" — anything else the model produced is dropped. */
export function isoDateOrEmpty(value: unknown): string {
  const text = str(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  return Number.isNaN(Date.parse(`${text}T00:00:00`)) ? "" : text;
}

/** A plain decimal string, with thousands separators and currency symbols stripped. */
export function amountOrEmpty(value: unknown): string {
  const text = str(value).trim();
  if (!text) return "";
  const cleaned = text.replace(/[^\d.,-]/g, "");
  if (!cleaned) return "";
  // "1.234,56" (European) vs "1,234.56" (Anglo): the last separator is the decimal one.
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalised: string;
  if (lastComma > lastDot) {
    normalised = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    normalised = cleaned.replace(/,/g, "");
  }
  const n = Number(normalised);
  return Number.isFinite(n) ? String(n) : "";
}

function normalise(raw: unknown): DocumentRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const now = Date.now();
  return {
    id: str(d.id) || crypto.randomUUID(),
    files: Array.isArray(d.files) ? d.files.filter((f): f is string => typeof f === "string") : [],
    language: str(d.language),
    sender: str(d.sender),
    recipient: str(d.recipient),
    date: str(d.date),
    subject: str(d.subject),
    short_summary: str(d.short_summary),
    full_description: str(d.full_description),
    action_needed: str(d.action_needed),
    companyId: str(d.companyId),
    companyGuess: str(d.companyGuess),
    companyConfidence:
      d.companyConfidence === "high" || d.companyConfidence === "medium" ? d.companyConfidence : "low",
    status: isStatus(d.status) ? d.status : "review",
    docType: isDocType(d.docType) ? d.docType : "other",
    priority: isPriority(d.priority) ? d.priority : "normal",
    dueDate: isoDateOrEmpty(d.dueDate),
    issuedDate: isoDateOrEmpty(d.issuedDate),
    amount: amountOrEmpty(d.amount),
    currency: str(d.currency).trim().toUpperCase().slice(0, 3),
    reference: str(d.reference),
    note: str(d.note),
    reviewedByUser: d.reviewedByUser === true,
    createdAt: typeof d.createdAt === "number" ? d.createdAt : now,
    updatedAt: typeof d.updatedAt === "number" ? d.updatedAt : now,
  };
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const raw = await readJsonFile<unknown[]>(documentsPath(), []);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalise).filter((d): d is DocumentRecord => d !== null);
}

/** Builds one record from a freshly analysed document. */
export function buildRecord(
  files: string[],
  fields: ExtractedFields,
  classification: Partial<DocumentRecord>,
): DocumentRecord {
  const now = Date.now();
  return normalise({
    ...fields,
    ...classification,
    id: crypto.randomUUID(),
    files,
    note: "",
    reviewedByUser: false,
    createdAt: now,
    updatedAt: now,
  })!;
}

export async function appendDocuments(docs: DocumentRecord[]): Promise<DocumentRecord[]> {
  if (docs.length === 0) return listDocuments();
  return withFileLock(documentsPath(), async () => {
    const existing = await listDocuments();
    const next = [...existing, ...docs];
    await writeJsonFile(documentsPath(), next);
    return next;
  });
}

/** Fields the UI is allowed to change on an existing record. */
export type DocumentPatch = Partial<
  Pick<
    DocumentRecord,
    | "companyId"
    | "status"
    | "docType"
    | "priority"
    | "dueDate"
    | "amount"
    | "currency"
    | "reference"
    | "note"
    | "subject"
  >
>;

export async function updateDocument(id: string, patch: DocumentPatch): Promise<DocumentRecord | null> {
  return withFileLock(documentsPath(), async () => {
    const existing = await listDocuments();
    let updated: DocumentRecord | null = null;
    const next = existing.map((d) => {
      if (d.id !== id) return d;
      updated = normalise({ ...d, ...patch, reviewedByUser: true, updatedAt: Date.now() });
      return updated ?? d;
    });
    if (!updated) return null;
    await writeJsonFile(documentsPath(), next);
    return updated;
  });
}

export async function deleteDocument(id: string): Promise<void> {
  await withFileLock(documentsPath(), async () => {
    const existing = await listDocuments();
    await writeJsonFile(
      documentsPath(),
      existing.filter((d) => d.id !== id),
    );
  });
}

/** Re-files everything that pointed at a removed company back to Unassigned. */
export async function detachCompany(companyId: string): Promise<void> {
  await withFileLock(documentsPath(), async () => {
    const existing = await listDocuments();
    if (!existing.some((d) => d.companyId === companyId)) return;
    const next = existing.map((d) =>
      d.companyId === companyId ? { ...d, companyId: "", updatedAt: Date.now() } : d,
    );
    await writeJsonFile(documentsPath(), next);
  });
}
