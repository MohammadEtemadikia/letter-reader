import { NextRequest } from "next/server";
import { addCompany, deleteCompany, listCompanies, updateCompany, type CompanyInput } from "@/lib/companies";
import { detachCompany, listDocuments } from "@/lib/documents";
import { outputXlsxPath } from "@/lib/inbox";
import { writeWorkbook } from "@/lib/xlsx-writer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The workbook has one tab per company, so any roster change has to rebuild it. */
async function rebuildWorkbook() {
  const [companies, docs] = await Promise.all([listCompanies(), listDocuments()]);
  await writeWorkbook(outputXlsxPath(), companies, docs).catch(() => {});
}

/** Splits a textarea's value on the given separators; an array is taken as-is. */
function split(value: unknown, separators: RegExp): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value !== "string") return [];
  return value
    .split(separators)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toInput(body: Record<string, unknown>): CompanyInput {
  return {
    name: typeof body.name === "string" ? body.name : "",
    aliases: split(body.aliases, /[\n,;]/),
    numbers: split(body.numbers, /[\n,;]/),
    // Addresses keep their commas — "Keizersgracht 1, Amsterdam" is one address,
    // not two — so only a line break starts a new one.
    addresses: split(body.addresses, /\n/),
    notes: typeof body.notes === "string" ? body.notes : "",
    color: typeof body.color === "string" ? body.color : undefined,
  };
}

export async function GET() {
  return Response.json({ companies: await listCompanies() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const input = toInput(body ?? {});
  if (!input.name.trim()) {
    return Response.json({ error: "A company needs a name." }, { status: 400 });
  }
  try {
    const companies = await addCompany(input);
    await rebuildWorkbook();
    return Response.json({ companies });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "could not save" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  const companies = await updateCompany(id, toInput(body));
  await rebuildWorkbook();
  return Response.json({ companies });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  // Documents filed under it stay — they fall back to Unassigned so nothing
  // ever disappears from the dashboard because a company was removed.
  await detachCompany(id);
  const companies = await deleteCompany(id);
  await rebuildWorkbook();
  return Response.json({ companies, documents: await listDocuments() });
}
