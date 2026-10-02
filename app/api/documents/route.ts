import { NextRequest } from "next/server";
import { listCompanies } from "@/lib/companies";
import {
  deleteDocument,
  listDocuments,
  updateDocument,
  type DocumentPatch,
} from "@/lib/documents";
import { outputXlsxPath } from "@/lib/inbox";
import { writeWorkbook } from "@/lib/xlsx-writer";
import { isDocType, isPriority, isStatus } from "@/lib/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function rebuildWorkbook() {
  const [companies, docs] = await Promise.all([listCompanies(), listDocuments()]);
  await writeWorkbook(outputXlsxPath(), companies, docs).catch(() => {});
}

/** Only the fields the dashboard can edit survive — everything else is ignored. */
function toPatch(body: Record<string, unknown>): DocumentPatch {
  const patch: DocumentPatch = {};
  if (typeof body.companyId === "string") patch.companyId = body.companyId;
  if (isStatus(body.status)) patch.status = body.status;
  if (isDocType(body.docType)) patch.docType = body.docType;
  if (isPriority(body.priority)) patch.priority = body.priority;
  if (typeof body.dueDate === "string") patch.dueDate = body.dueDate;
  if (typeof body.amount === "string") patch.amount = body.amount;
  if (typeof body.currency === "string") patch.currency = body.currency;
  if (typeof body.reference === "string") patch.reference = body.reference;
  if (typeof body.note === "string") patch.note = body.note.slice(0, 4000);
  if (typeof body.subject === "string") patch.subject = body.subject.slice(0, 500);
  return patch;
}

export async function GET() {
  const [documents, companies] = await Promise.all([listDocuments(), listCompanies()]);
  return Response.json({ documents, companies }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });

  const patch = toPatch(body ?? {});
  if (patch.companyId) {
    const companies = await listCompanies();
    if (!companies.some((c) => c.id === patch.companyId)) patch.companyId = "";
  }

  const updated = await updateDocument(id, patch);
  if (!updated) return Response.json({ error: "no such document" }, { status: 404 });

  await rebuildWorkbook();
  return Response.json({ document: updated });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  await deleteDocument(id);
  await rebuildWorkbook();
  return Response.json({ ok: true });
}
