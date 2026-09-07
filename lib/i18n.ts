import type { Lang } from "./prompt";

/** Labels for the four translation-target languages offered on each letter card. */
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
 * A letter's original language is auto-detected and can be anything, not
 * just the four translation targets — so direction is derived generically
 * from the ISO code the model reports, per letter card, instead of from a
 * single app-wide language setting.
 */
export function isRtlLang(code: string | undefined | null): boolean {
  if (!code) return false;
  return RTL_LANGS.has(code.trim().toLowerCase().slice(0, 2));
}

type Copy = {
  appTitle: string;
  tagline: string;
  healthChecking: string;
  healthOk: (email: string | null, plan: string | null) => string;
  healthNotInstalled: string;
  healthNotLoggedIn: string;
  healthUnknown: (detail: string) => string;
  dropZoneTitle: string;
  dropZoneHint: string;
  pendingHeader: (n: number) => string;
  pendingEmpty: string;
  qrButton: string;
  qrPanelTitle: string;
  qrPanelHint: (url: string) => string;
  effortLabel: string;
  effortOptions: { value: string; label: string }[];
  runButton: string;
  runningButton: string;
  stopButton: string;
  resultsTitle: string;
  openFileButton: string;
  openFolderButton: string;
  clearArchiveNote: (n: number) => string;
  statusStaging: (n: number) => string;
  statusReading: (name: string) => string;
  statusDone: (n: number) => string;
  statusStopped: string;
  remainingNote: (n: number) => string;
  errorNoFiles: string;
  errorParse: string;
  errorGeneric: (detail: string) => string;
  selectHint: string;
  combineButton: string;
  ungroupButton: string;
  pagesLabel: (n: number) => string;
  translateLabel: string;
  originalLabel: string;
  translateError: string;
};

export const COPY: Copy = {
  appTitle: "Letter Reader",
  tagline: "Drop letter photos here or send them from your phone, then process.",
  healthChecking: "Checking Claude Code…",
  healthOk: (email, plan) => `Connected${email ? ` — ${email}` : ""}${plan ? ` · ${plan}` : ""}`,
  healthNotInstalled:
    "Claude Code is not installed on this machine. Install it, run `claude` once in a terminal to sign in, then reload this page.",
  healthNotLoggedIn:
    "Claude Code is installed but not signed in. Run `claude auth login` in a terminal, then reload this page.",
  healthUnknown: (detail) => `Could not verify Claude Code: ${detail}`,
  dropZoneTitle: "Drag letter photos here, or click to choose",
  dropZoneHint: "jpg, png, webp, heic — you can select several at once",
  pendingHeader: (n) => `${n} letter(s) queued`,
  pendingEmpty: "No letters queued yet.",
  qrButton: "Upload from phone (QR)",
  qrPanelTitle: "Scan with your phone",
  qrPanelHint: (url) => `Phone must be on the same Wi-Fi. Or open: ${url}`,
  effortLabel: "Analysis depth",
  effortOptions: [
    { value: "low", label: "Fast" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "Thorough (recommended)" },
    { value: "xhigh", label: "Very thorough" },
  ],
  runButton: "Process letters",
  runningButton: "Processing…",
  stopButton: "Stop",
  resultsTitle: "Results",
  openFileButton: "Open Excel file",
  openFolderButton: "Show in folder",
  clearArchiveNote: (n) => `${n} letter(s) processed and archived so far.`,
  statusStaging: (n) => `Staging ${n} letter(s)…`,
  statusReading: (name) => `Reading ${name}`,
  statusDone: (n) => `${n} letter(s) processed successfully ✓`,
  statusStopped: "Processing stopped.",
  remainingNote: (n) => `${n} more letter(s) still queued — click "Process letters" again.`,
  errorNoFiles: "No letters are queued.",
  errorParse: "Claude Code's response could not be read as valid JSON.",
  errorGeneric: (detail) => `Error: ${detail}`,
  selectHint: "Select photos to combine them as pages of one letter.",
  combineButton: "Combine as one letter (multi-page)",
  ungroupButton: "Split apart",
  pagesLabel: (n) => `${n} pages`,
  translateLabel: "Translate:",
  originalLabel: "Original",
  translateError: "Translation failed.",
};
