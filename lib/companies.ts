import crypto from "crypto";
import path from "path";
import { dataDir } from "./inbox";
import { readJsonFile, withFileLock, writeJsonFile } from "./json-store";
import { COMPANY_COLORS, type Company } from "./company";

/**
 * Filesystem-backed store for the user's companies. The shape, the swatches
 * and the prompt rendering live in ./company so the browser can import them
 * without dragging fs in with them.
 */

export { COMPANY_COLORS, UNASSIGNED, renderCompanyDirectory } from "./company";
export type { Company } from "./company";

function companiesPath(): string {
  return path.join(dataDir(), "companies.json");
}

function sanitiseList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0)
    .slice(0, 24);
}

function normalise(raw: unknown, index: number): Company | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  const name = typeof c.name === "string" ? c.name.trim() : "";
  if (!name) return null;
  return {
    id: typeof c.id === "string" && c.id ? c.id : crypto.randomUUID(),
    name,
    aliases: sanitiseList(c.aliases),
    numbers: sanitiseList(c.numbers),
    addresses: sanitiseList(c.addresses),
    notes: typeof c.notes === "string" ? c.notes.trim().slice(0, 500) : "",
    color:
      typeof c.color === "string" && (COMPANY_COLORS as readonly string[]).includes(c.color)
        ? c.color
        : COMPANY_COLORS[index % COMPANY_COLORS.length],
    createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
  };
}

export async function listCompanies(): Promise<Company[]> {
  const raw = await readJsonFile<unknown[]>(companiesPath(), []);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalise).filter((c): c is Company => c !== null);
}

export type CompanyInput = {
  name: string;
  aliases?: string[];
  numbers?: string[];
  addresses?: string[];
  notes?: string;
  color?: string;
};

/** First swatch nobody is using yet, so two companies are never the same colour. */
function nextFreeColor(companies: Company[]): string {
  const taken = new Set(companies.map((c) => c.color));
  return COMPANY_COLORS.find((c) => !taken.has(c)) ?? COMPANY_COLORS[companies.length % COMPANY_COLORS.length];
}

export async function addCompany(input: CompanyInput): Promise<Company[]> {
  return withFileLock(companiesPath(), async () => {
    const companies = await listCompanies();
    const created = normalise(
      { ...input, color: input.color ?? nextFreeColor(companies), id: crypto.randomUUID(), createdAt: Date.now() },
      companies.length,
    );
    if (!created) throw new Error("a company needs a name");
    const next = [...companies, created];
    await writeJsonFile(companiesPath(), next);
    return next;
  });
}

export async function updateCompany(id: string, patch: Partial<CompanyInput>): Promise<Company[]> {
  return withFileLock(companiesPath(), async () => {
    const companies = await listCompanies();
    const next = companies.map((c, i) =>
      c.id === id ? (normalise({ ...c, ...patch, id: c.id, createdAt: c.createdAt }, i) ?? c) : c,
    );
    await writeJsonFile(companiesPath(), next);
    return next;
  });
}

export async function deleteCompany(id: string): Promise<Company[]> {
  return withFileLock(companiesPath(), async () => {
    const companies = await listCompanies();
    const next = companies.filter((c) => c.id !== id);
    await writeJsonFile(companiesPath(), next);
    return next;
  });
}
