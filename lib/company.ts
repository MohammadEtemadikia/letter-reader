/**
 * Client-safe half of the company roster: the shape itself, the swatches the
 * UI offers, and the rendering used to describe the roster to the model. The
 * filesystem-backed store lives in companies.ts, which must never reach the
 * browser bundle.
 */

/**
 * The user runs several businesses, so every document has to end up under the
 * right one. A company is matched by any of the names, trade names, VAT/KvK
 * numbers or addresses the user lists here — those strings are what the model
 * is shown when it has to decide which company a letter is addressed to.
 */
export type Company = {
  id: string;
  name: string;
  /** Other names the same company appears under on paper (trade names, legal suffixes). */
  aliases: string[];
  /** Registration / VAT / KvK numbers printed on letters addressed to this company. */
  numbers: string[];
  /** Address lines that identify this company's post. */
  addresses: string[];
  /** Short free-text hint for the model, e.g. "the holding — only tax and bank post". */
  notes: string;
  /** One of the swatch keys in the UI. */
  color: string;
  createdAt: number;
};

/** The id used for documents that match none of the configured companies. */
export const UNASSIGNED = "";

export const COMPANY_COLORS = [
  "indigo",
  "teal",
  "amber",
  "rose",
  "violet",
  "lime",
  "cyan",
  "orange",
] as const;

/**
 * The company roster as the analysis prompt sees it. Every identifying string
 * the user gave is listed, because a letter rarely spells out the full legal
 * name — it carries a trade name, a VAT number or just the postal address.
 */
export function renderCompanyDirectory(companies: Company[]): string {
  if (companies.length === 0) {
    return `The user has not configured any companies yet. Set "company_id" to "" for every document and set "company_name" to the organisation the document is addressed TO, exactly as printed.`;
  }
  const entries = companies
    .map((c) => {
      const lines = [`- id: "${c.id}" — ${c.name}`];
      if (c.aliases.length) lines.push(`  also appears as: ${c.aliases.join("; ")}`);
      if (c.numbers.length) lines.push(`  registration/VAT numbers: ${c.numbers.join("; ")}`);
      if (c.addresses.length) lines.push(`  addresses: ${c.addresses.join(" | ")}`);
      if (c.notes) lines.push(`  note: ${c.notes}`);
      return lines.join("\n");
    })
    .join("\n");
  return `These are the user's companies. Decide which one each document is addressed to — match on the recipient name, trade name, registration/VAT number or postal address printed on the document:\n\n${entries}`;
}
