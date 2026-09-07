import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { getStrings } from "./i18n.js";

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function appendResults(outputPath, letters, lang) {
  const { sheetName, headers, rightToLeft } = getStrings(lang).excel;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const workbook = new ExcelJS.Workbook();
  const exists = await fileExists(outputPath);
  let sheet;

  if (exists) {
    await workbook.xlsx.readFile(outputPath);
    sheet = workbook.getWorksheet(sheetName) || workbook.addWorksheet(sheetName);
    if (sheet.rowCount === 0) {
      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true };
    }
  } else {
    sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
  }

  sheet.views = [{ rightToLeft }];

  let serial = Math.max(sheet.rowCount - 1, 0);
  for (const l of letters) {
    serial += 1;
    sheet.addRow([
      serial,
      l.sender,
      l.recipient,
      l.date,
      l.subject,
      l.short_summary,
      l.full_description,
      l.action_needed,
      l.filename,
    ]);
  }

  sheet.columns.forEach((col) => {
    col.width = 28;
    col.alignment = { wrapText: true, vertical: "top" };
  });

  await workbook.xlsx.writeFile(outputPath);
}
