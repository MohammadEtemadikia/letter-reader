import { promises as fs } from "fs";
import path from "path";
import * as XLSX from "xlsx";
import type { Company } from "./company";
import { compareForTriage, isOverdue, type DocumentRecord } from "./document";
import { DOC_TYPE_META, PRIORITY_META, STATUS_META, STATUS_ORDER, type Status } from "./taxonomy";

/**
 * The workbook is a rendering of the document store, not a log appended to.
 * It is rewritten in full after every change, so re-filing a document in the
 * app is reflected in the spreadsheet instead of leaving a stale duplicate
 * row behind — and each company gets its own tab, which is what makes the
 * file usable when several businesses share one inbox.
 */

const HEADERS = [
  "Status",
  "Priority",
  "Type",
  "Due date",
  "Overdue",
  "Amount",
  "Currency",
  "Subject",
  "Sender",
  "Reference",
  "Action needed",
  "Summary",
  "Document date",
  "Company (as printed)",
  "Match",
  "Language",
  "Note",
  "Source file(s)",
  "Added",
];

const COL_WIDTHS = [
  16, 9, 22, 12, 9, 12, 9, 40, 28, 18, 46, 60, 14, 28, 8, 9, 28, 30, 12,
].map((wch) => ({ wch }));

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function row(doc: DocumentRecord, now: number): unknown[] {
  return [
    STATUS_META[doc.status].label,
    PRIORITY_META[doc.priority].label,
    DOC_TYPE_META[doc.docType].label,
    doc.dueDate,
    isOverdue(doc, now) ? "YES" : "",
    doc.amount ? Number(doc.amount) : "",
    doc.currency,
    doc.subject,
    doc.sender,
    doc.reference,
    doc.action_needed,
    doc.short_summary,
    doc.issuedDate || doc.date,
    doc.companyGuess,
    doc.reviewedByUser ? "manual" : doc.companyConfidence,
    doc.language,
    doc.note,
    doc.files.join(", "),
    isoDay(doc.createdAt),
  ];
}

/** Excel forbids : \ / ? * [ ] in sheet names and caps them at 31 characters. */
function safeSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[:\\/?*[\]]/g, "-").trim() || "Sheet").slice(0, 28);
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 26)} ${n}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function documentSheet(docs: DocumentRecord[], now: number): XLSX.WorkSheet {
  const sorted = [...docs].sort((a, b) => compareForTriage(a, b, now));
  const rows: unknown[][] = [HEADERS, ...sorted.map((d) => row(d, now))];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = COL_WIDTHS;
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: HEADERS.length - 1 } }) };
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  return sheet;
}

/** Companies down the side, workflow buckets across the top, plus money owed. */
function overviewSheet(
  companies: Company[],
  docs: DocumentRecord[],
  now: number,
): XLSX.WorkSheet {
  const buckets: Status[] = STATUS_ORDER;
  const rows: unknown[][] = [];
  rows.push([`Administration overview — generated ${new Date(now).toLocaleString()}`]);
  rows.push([]);
  rows.push(["Company", ...buckets.map((s) => STATUS_META[s].label), "Overdue", "Open amount", "Total"]);

  const groups: { label: string; items: DocumentRecord[] }[] = [
    ...companies.map((c) => ({ label: c.name, items: docs.filter((d) => d.companyId === c.id) })),
    { label: "Unassigned", items: docs.filter((d) => !companies.some((c) => c.id === d.companyId)) },
  ];

  for (const group of groups) {
    const openAmount = group.items
      .filter((d) => d.status === "needs_action" || d.status === "scheduled")
      .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    rows.push([
      group.label,
      ...buckets.map((s) => group.items.filter((d) => d.status === s).length),
      group.items.filter((d) => isOverdue(d, now)).length,
      openAmount ? Number(openAmount.toFixed(2)) : "",
      group.items.length,
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 28 }, ...buckets.map(() => ({ wch: 15 })), { wch: 10 }, { wch: 14 }, { wch: 8 }];
  return sheet;
}

/**
 * Rewrites the whole workbook: an overview tab, an "Action required" tab that
 * collects everything still open across all companies, then one tab per
 * company and one for anything unassigned.
 */
export async function writeWorkbook(
  outputPath: string,
  companies: Company[],
  docs: DocumentRecord[],
): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const now = Date.now();

  const workbook = XLSX.utils.book_new();
  const used = new Set<string>();

  XLSX.utils.book_append_sheet(workbook, overviewSheet(companies, docs, now), safeSheetName("Overview", used));

  const open = docs.filter((d) => d.status === "needs_action" || d.status === "review" || isOverdue(d, now));
  XLSX.utils.book_append_sheet(workbook, documentSheet(open, now), safeSheetName("Action required", used));

  for (const company of companies) {
    const items = docs.filter((d) => d.companyId === company.id);
    XLSX.utils.book_append_sheet(workbook, documentSheet(items, now), safeSheetName(company.name, used));
  }

  const unassigned = docs.filter((d) => !companies.some((c) => c.id === d.companyId));
  if (unassigned.length > 0 || companies.length === 0) {
    XLSX.utils.book_append_sheet(workbook, documentSheet(unassigned, now), safeSheetName("Unassigned", used));
  }

  // XLSX.writeFile's own Node file-saving path relies on environment
  // detection that doesn't hold up inside Next.js's bundled server code and
  // throws a generic "cannot save file" error — writing the buffer ourselves
  // sidesteps that entirely.
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  await fs.writeFile(outputPath, buffer);
}
