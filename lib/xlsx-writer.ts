import { promises as fs } from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { FIELD_LABELS, type LetterResult } from "./letter";

export type { LetterResult };

const SHEET_NAME = "Letters";
/** The title row for each letter block starts with this word, e.g. "Letter 3 — ...". */
const LETTER_PREFIX = "Letter";

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function countExistingLetters(rows: unknown[][], prefix: string): number {
  const re = new RegExp(`^${prefix}\\s+(\\d+)`);
  let max = 0;
  for (const row of rows) {
    const cell = row?.[0];
    if (typeof cell !== "string") continue;
    const m = re.exec(cell);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Appends the given letters to the single persistent workbook (creating it
 * the first time). Each letter is written as its own field/value block —
 * label in column A, value in column B — rather than one wide row per
 * letter: long summaries and descriptions overflow into the empty columns
 * to their right instead of being squeezed into narrow fixed cells.
 */
export async function appendLetters(outputPath: string, letters: LetterResult[]): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const sheetName = SHEET_NAME;
  const prefix = LETTER_PREFIX;
  const labels = FIELD_LABELS;

  let rows: unknown[][];
  let workbook: XLSX.WorkBook;

  if (await fileExists(outputPath)) {
    const existingBuffer = await fs.readFile(outputPath);
    workbook = XLSX.read(existingBuffer, { type: "buffer" });
    const existingName = workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
    const sheet = workbook.Sheets[existingName];
    rows = sheet ? (XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][]) : [];
  } else {
    workbook = XLSX.utils.book_new();
    rows = [];
  }

  let serial = countExistingLetters(rows, prefix);
  if (rows.length > 0) rows.push([]);

  for (const l of letters) {
    serial += 1;
    rows.push([`${prefix} ${serial} — ${l.subject || ""}`]);
    rows.push([labels.language, l.language]);
    rows.push([labels.sender, l.sender]);
    rows.push([labels.recipient, l.recipient]);
    rows.push([labels.date, l.date]);
    rows.push([labels.subject, l.subject]);
    rows.push([labels.short_summary, l.short_summary]);
    rows.push([labels.full_description, l.full_description]);
    rows.push([labels.action_needed, l.action_needed]);
    rows.push([labels.filename, l.filename]);
    rows.push([]);
  }

  const newSheet = XLSX.utils.aoa_to_sheet(rows);
  newSheet["!cols"] = [{ wch: 22 }, { wch: 70 }];

  if (workbook.SheetNames.includes(sheetName)) {
    workbook.Sheets[sheetName] = newSheet;
  } else {
    XLSX.utils.book_append_sheet(workbook, newSheet, sheetName);
  }

  // XLSX.writeFile's own Node file-saving path relies on environment
  // detection that doesn't hold up inside Next.js's bundled server code and
  // throws a generic "cannot save file" error — writing the buffer ourselves
  // sidesteps that entirely.
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  await fs.writeFile(outputPath, buffer);
}
