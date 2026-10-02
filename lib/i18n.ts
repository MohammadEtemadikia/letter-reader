import type { Lang } from "./prompt";

/** Labels for the four translation-target languages offered on each document card. */
export const LANG_LABEL: Record<Lang, string> = {
  fa: "فارسی",
  en: "English",
  nl: "Nederlands",
  tr: "Türkçe",
};

/** Direction to use when displaying content translated into one of the four target languages. */
export const LANG_DIR: Record<Lang, "rtl" | "ltr"> = {
  fa: "rtl",
  en: "ltr",
  nl: "ltr",
  tr: "ltr",
};

const RTL_LANGS = new Set(["fa", "ar", "he", "ur", "ps", "sd", "ug", "yi", "dv"]);

/**
 * A document's original language is auto-detected and can be anything, not
 * just the four translation targets — so direction is derived generically
 * from the ISO code the model reports, per card, instead of from a single
 * app-wide language setting.
 */
export function isRtlLang(code: string | undefined | null): boolean {
  if (!code) return false;
  return RTL_LANGS.has(code.trim().toLowerCase().slice(0, 2));
}

export const COPY = {
  appTitle: "Administration Assistant",
  tagline: "Scan your post once — it gets read, filed under the right company, and sorted by what still needs doing.",

  tabDashboard: "Dashboard",
  tabIntake: "Intake",
  tabCompanies: "Companies",

  healthChecking: "Checking Claude Code…",
  healthOk: (email: string | null, plan: string | null) =>
    `Connected${email ? ` — ${email}` : ""}${plan ? ` · ${plan}` : ""}`,
  healthNotInstalled:
    "Claude Code is not installed on this machine. Install it, run `claude` once in a terminal to sign in, then reload this page.",
  healthNotLoggedIn:
    "Claude Code is installed but not signed in. Run `claude auth login` in a terminal, then reload this page.",
  healthUnknown: (detail: string) => `Could not verify Claude Code: ${detail}`,

  dropZoneTitle: "Drag documents here, or click to choose",
  dropZoneHint: "jpg, png, webp, heic — letters, invoices, contracts, anything",
  pendingHeader: (n: number) => `${n} document(s) queued`,
  pendingEmpty: "Nothing queued.",
  qrButton: "Upload from phone (QR)",
  qrPanelTitle: "Scan with your phone",
  qrPanelHint: (url: string) => `Phone must be on the same Wi-Fi. Or open: ${url}`,
  effortLabel: "Analysis depth",
  effortOptions: [
    { value: "low", label: "Fast" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "Thorough (recommended)" },
    { value: "xhigh", label: "Very thorough" },
  ],
  runButton: "Read & file documents",
  runningButton: "Processing…",
  stopButton: "Stop",
  openFileButton: "Open workbook",
  openFolderButton: "Show in folder",
  statusStaging: (n: number) => `Staging ${n} document(s)…`,
  statusReading: (name: string) => `Reading ${name}`,
  statusDone: (n: number) => `${n} document(s) filed ✓`,
  statusStopped: "Processing stopped.",
  remainingNote: (n: number) => `${n} more document(s) still queued — click "Read & file documents" again.`,
  errorNoFiles: "Nothing is queued.",
  errorParse: "Claude Code's response could not be read as valid JSON.",
  errorGeneric: (detail: string) => `Error: ${detail}`,
  selectHint: "Tick several scans to combine them as pages of one document.",
  combineButton: "Combine as one document (multi-page)",
  ungroupButton: "Split apart",
  pagesLabel: (n: number) => `${n} pages`,

  translateLabel: "Translate:",
  originalLabel: "Original",
  translateError: "Translation failed.",

  allCompanies: "All companies",
  unassigned: "Unassigned",
  noCompaniesYetDashboard:
    "Everything is sitting under Unassigned because no companies are configured yet — add them under Companies and the next run files each scan under the right one.",
  noCompaniesYet:
    "No companies configured yet. Add each of your businesses here and every scan is filed under the right one automatically.",
  companyNameLabel: "Company name",
  companyAliasesLabel: "Other names it appears under",
  companyNumbersLabel: "VAT / registration numbers",
  companyAddressesLabel: "Addresses on its post",
  companyNotesLabel: "Note for the assistant (optional)",
  companyListHint: "One per line, or separated by commas.",
  companyAddressHint: "One address per line.",
  addCompanyButton: "Add company",
  saveButton: "Save",
  cancelButton: "Cancel",
  editButton: "Edit",
  deleteButton: "Delete",
  deleteCompanyConfirm: (name: string) =>
    `Delete "${name}"? Its documents stay — they move to Unassigned.`,
  deleteDocumentConfirm: "Remove this document from the dashboard? The original scan stays in your Archive folder.",

  filterSearch: "Search subject, sender, reference…",
  filterType: "All types",
  filterOverdue: "Overdue only",
  emptyBucket: "Nothing here.",
  emptyDashboard:
    "Nothing filed yet. Add your companies first, then drop your first scans into Intake and process them.",
  overdueBadge: (days: number) => `${days} day(s) overdue`,
  dueBadge: (days: number) => (days === 0 ? "Due today" : `Due in ${days} day(s)`),
  openScanButton: "View scan",
  hideScanButton: "Hide scan",
  noteePlaceholder: "Add a note…",
  lowConfidenceWarning: "Company match uncertain — check it.",
  totalsOpen: (n: number, amount: string) =>
    amount ? `${n} open · ${amount} outstanding` : `${n} open`,
} as const;
