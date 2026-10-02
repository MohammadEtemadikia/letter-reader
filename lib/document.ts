/**
 * Client-safe: shared between the server-side stores, the xlsx writer and the
 * browser UI, so it must never import Node built-ins (fs, path, xlsx).
 */
import {
  DOC_TYPE_META,
  PRIORITY_META,
  STATUS_META,
  type DocType,
  type Priority,
  type Status,
} from "./taxonomy";

/**
 * The part of a document that is written in the document's own language, and
 * is therefore the part a translation replaces. Everything outside this shape
 * (status, type, company, dates, amounts) is language-independent.
 */
export type ExtractedFields = {
  /** Lowercase ISO 639-1 code of the language these texts are written in. */
  language: string;
  sender: string;
  recipient: string;
  date: string;
  subject: string;
  short_summary: string;
  full_description: string;
  action_needed: string;
};

export const TRANSLATABLE_KEYS: (keyof Omit<ExtractedFields, "language">)[] = [
  "sender",
  "recipient",
  "date",
  "subject",
  "short_summary",
  "full_description",
  "action_needed",
];

/**
 * One filed document. Persisted in documents.json and never thrown away by a
 * later run — processing appends, the user re-files.
 */
export type DocumentRecord = ExtractedFields & {
  /** Stable id, also the key used by every update endpoint. */
  id: string;
  /** Original Inbox filenames (more than one for a multi-page document). */
  files: string[];

  /* --- filing ----------------------------------------------------------- */
  /** Id of a company in companies.json, or "" when it belongs to none of them. */
  companyId: string;
  /** The organisation name the model actually read on the paper, for auditing a bad match. */
  companyGuess: string;
  /** How sure the model was about the company match. */
  companyConfidence: "high" | "medium" | "low";
  status: Status;
  docType: DocType;
  priority: Priority;

  /* --- structured facts ------------------------------------------------- */
  /** Deadline / due date as ISO yyyy-mm-dd when one is stated, else "". */
  dueDate: string;
  /** The document's own date as ISO yyyy-mm-dd when parseable, else "". */
  issuedDate: string;
  /** Plain decimal string, e.g. "1234.56". "" when the document carries no amount. */
  amount: string;
  /** ISO 4217 code, e.g. "EUR". */
  currency: string;
  /** Invoice / reference / case number as printed. */
  reference: string;

  /* --- bookkeeping ------------------------------------------------------ */
  /** Free-text note the user adds in the UI. */
  note: string;
  /** True once a human has corrected the filing — a re-run must not overwrite it. */
  reviewedByUser: boolean;
  createdAt: number;
  updatedAt: number;
};

/** The classification half, i.e. everything the model decides that is not prose. */
export type Classification = Pick<
  DocumentRecord,
  | "companyId"
  | "companyGuess"
  | "companyConfidence"
  | "status"
  | "docType"
  | "priority"
  | "dueDate"
  | "issuedDate"
  | "amount"
  | "currency"
  | "reference"
>;

export const FIELD_LABELS = {
  language: "Language",
  sender: "Sender",
  recipient: "Recipient",
  date: "Date",
  subject: "Subject",
  short_summary: "Summary",
  full_description: "Details",
  action_needed: "Action needed",
  company: "Company",
  status: "Status",
  docType: "Type",
  priority: "Priority",
  dueDate: "Due date",
  issuedDate: "Document date",
  amount: "Amount",
  reference: "Reference",
  note: "Note",
  files: "Source file(s)",
} as const;

/* -------------------------------------------------------------------------- */
/*  DERIVED VIEWS                                                             */
/* -------------------------------------------------------------------------- */

/** Days until the due date — negative when overdue, null when there is no date. */
export function daysUntilDue(doc: DocumentRecord, now: number = Date.now()): number | null {
  if (!doc.dueDate) return null;
  const due = Date.parse(`${doc.dueDate}T00:00:00`);
  if (Number.isNaN(due)) return null;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  return Math.round((due - startOfToday.getTime()) / 86_400_000);
}

/** Overdue only counts while the document is still open — a handled one never nags. */
export function isOverdue(doc: DocumentRecord, now: number = Date.now()): boolean {
  if (doc.status === "done" || doc.status === "archive") return false;
  const days = daysUntilDue(doc, now);
  return days !== null && days < 0;
}

/** Handled and archived documents are settled; they sink below anything still open. */
function isClosed(doc: DocumentRecord): boolean {
  return doc.status === "done" || doc.status === "archive";
}

/**
 * Sort key: still-open first, then overdue, then by deadline, then by
 * priority, then newest. Inside a dashboard bucket every document shares a
 * status, so this mostly decides the deadline order there — it is the mixed
 * per-company spreadsheet tabs that need the open-before-settled rule.
 */
export function compareForTriage(a: DocumentRecord, b: DocumentRecord, now: number = Date.now()): number {
  const aClosed = isClosed(a) ? 1 : 0;
  const bClosed = isClosed(b) ? 1 : 0;
  if (aClosed !== bClosed) return aClosed - bClosed;

  const aOver = isOverdue(a, now) ? 0 : 1;
  const bOver = isOverdue(b, now) ? 0 : 1;
  if (aOver !== bOver) return aOver - bOver;

  const aDays = daysUntilDue(a, now);
  const bDays = daysUntilDue(b, now);
  if (aDays !== null && bDays !== null && aDays !== bDays) return aDays - bDays;
  if (aDays !== null && bDays === null) return -1;
  if (aDays === null && bDays !== null) return 1;

  const byPriority = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
  if (byPriority !== 0) return byPriority;

  return b.createdAt - a.createdAt;
}

export function formatAmount(doc: DocumentRecord): string {
  if (!doc.amount) return "";
  const n = Number(doc.amount);
  const text = Number.isFinite(n)
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : doc.amount;
  return doc.currency ? `${doc.currency} ${text}` : text;
}

export function statusLabel(status: Status): string {
  return STATUS_META[status].label;
}

export function docTypeLabel(docType: DocType): string {
  return DOC_TYPE_META[docType].label;
}
