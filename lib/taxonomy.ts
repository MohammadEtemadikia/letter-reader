/**
 * The vocabulary the whole app classifies against — shared by the prompt (so
 * the model can only answer with these values), the document store (so stored
 * values can be validated on the way in), the UI (labels, colours, ordering)
 * and the spreadsheet export.
 *
 * Client-safe: no Node built-ins, it is imported by the browser bundle too.
 */

/* -------------------------------------------------------------------------- */
/*  WORKFLOW STATUS — the buckets a document moves between                    */
/* -------------------------------------------------------------------------- */

export const STATUSES = [
  "needs_action",
  "waiting",
  "scheduled",
  "done",
  "archive",
  "review",
] as const;

export type Status = (typeof STATUSES)[number];

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

export const STATUS_META: Record<Status, { label: string; hint: string; tone: string }> = {
  needs_action: {
    label: "Action required",
    hint: "Something must be done by you — not started yet.",
    tone: "red",
  },
  waiting: {
    label: "Waiting on reply",
    hint: "You acted; now waiting for the other side.",
    tone: "amber",
  },
  scheduled: {
    label: "Scheduled",
    hint: "Handled for now, with a dated deadline still ahead.",
    tone: "blue",
  },
  done: {
    label: "Handled",
    hint: "Fully dealt with — paid, answered, signed.",
    tone: "green",
  },
  archive: {
    label: "Archive",
    hint: "Reference only, no action was ever needed.",
    tone: "grey",
  },
  review: {
    label: "Needs review",
    hint: "Unclear or unreadable — decide manually.",
    tone: "violet",
  },
};

/** Order the dashboard columns are shown in: most urgent first. */
export const STATUS_ORDER: Status[] = [
  "needs_action",
  "waiting",
  "scheduled",
  "review",
  "done",
  "archive",
];

/* -------------------------------------------------------------------------- */
/*  DOCUMENT TYPE — what kind of paper this is                                */
/* -------------------------------------------------------------------------- */

export const DOC_TYPES = [
  "invoice",
  "receipt",
  "reminder",
  "tax",
  "government",
  "bank",
  "insurance",
  "contract",
  "legal",
  "utility",
  "hr",
  "medical",
  "property",
  "marketing",
  "personal",
  "other",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export function isDocType(value: unknown): value is DocType {
  return typeof value === "string" && (DOC_TYPES as readonly string[]).includes(value);
}

export const DOC_TYPE_META: Record<DocType, { label: string; icon: string }> = {
  invoice: { label: "Invoice", icon: "🧾" },
  receipt: { label: "Receipt / proof of payment", icon: "💳" },
  reminder: { label: "Payment reminder / dunning", icon: "⏰" },
  tax: { label: "Tax", icon: "🏦" },
  government: { label: "Government / municipality", icon: "🏛️" },
  bank: { label: "Bank / finance", icon: "🏧" },
  insurance: { label: "Insurance", icon: "🛡️" },
  contract: { label: "Contract / agreement", icon: "📑" },
  legal: { label: "Legal / court", icon: "⚖️" },
  utility: { label: "Utilities / telecom", icon: "💡" },
  hr: { label: "HR / payroll", icon: "👤" },
  medical: { label: "Medical", icon: "🩺" },
  property: { label: "Property / rental", icon: "🏠" },
  marketing: { label: "Marketing / junk", icon: "📣" },
  personal: { label: "Personal", icon: "✉️" },
  other: { label: "Other", icon: "📄" },
};

/* -------------------------------------------------------------------------- */
/*  PRIORITY                                                                  */
/* -------------------------------------------------------------------------- */

export const PRIORITIES = ["urgent", "high", "normal", "low"] as const;

export type Priority = (typeof PRIORITIES)[number];

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}

export const PRIORITY_META: Record<Priority, { label: string; tone: string; rank: number }> = {
  urgent: { label: "Urgent", tone: "red", rank: 0 },
  high: { label: "High", tone: "amber", rank: 1 },
  normal: { label: "Normal", tone: "grey", rank: 2 },
  low: { label: "Low", tone: "faint", rank: 3 },
};

/* -------------------------------------------------------------------------- */
/*  THE CLASSIFICATION RULES, AS PROSE                                        */
/*                                                                            */
/*  Written once here and injected verbatim into the analysis prompt, so the  */
/*  model's definition of each bucket can never drift from the UI's.          */
/* -------------------------------------------------------------------------- */

export const STATUS_RULES = `- "needs_action": the document asks the recipient to do something that is clearly not done yet — pay, reply, sign, submit, appeal, book an appointment, send a missing paper. An unpaid invoice is always this.
- "waiting": the document itself is a confirmation that a request is in progress with the other party (received/under review/we will contact you), so the only thing left to do is wait.
- "scheduled": no action today, but there is a dated event in the future to honour — a direct debit that will be collected, a contract that auto-renews, an appointment, a deadline further out.
- "done": the document records a finished transaction — a paid receipt, a payment confirmation, a signed/countersigned copy, a closing letter.
- "archive": purely informational and never required an action — policy conditions, annual statements, newsletters, marketing, general notices.
- "review": you cannot tell with reasonable confidence (badly readable, ambiguous, mixed content). Use this instead of guessing.`;

export const PRIORITY_RULES = `- "urgent": a stated deadline inside about 7 days, a final notice, a dunning/collection threat, a legal summons, or a shut-off/penalty warning.
- "high": a real obligation with a deadline roughly within a month, or money owed with no date given.
- "normal": an ordinary action item with no pressing deadline.
- "low": informational, marketing, or nothing to do.`;

export const DOC_TYPE_RULES = DOC_TYPES.map((t) => `- "${t}": ${DOC_TYPE_META[t].label}`).join("\n");
