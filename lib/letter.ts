/**
 * Client-safe: shared between the server-side xlsx writer and the browser UI,
 * so it must never import Node built-ins (fs, path, xlsx).
 */
export type LetterResult = {
  filename: string;
  /** Lowercase ISO 639-1 code of the language this entry's text is written in. */
  language: string;
  sender: string;
  recipient: string;
  date: string;
  subject: string;
  short_summary: string;
  full_description: string;
  action_needed: string;
};

export const FIELD_LABELS: Record<keyof Omit<LetterResult, "filename">, string> & { filename: string } = {
  language: "Language",
  sender: "Sender",
  recipient: "Recipient",
  date: "Date",
  subject: "Subject",
  short_summary: "Short Summary",
  full_description: "Full Description",
  action_needed: "Action Needed",
  filename: "Filename",
};
