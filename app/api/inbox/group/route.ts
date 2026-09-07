import { NextRequest } from "next/server";
import { combineIntoGroup, listPendingGroups, ungroupFile } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Combines the given pending filenames into one multi-page letter. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const filenames = Array.isArray(body?.filenames)
    ? body.filenames.filter((f: unknown) => typeof f === "string")
    : [];
  if (filenames.length < 2) {
    return Response.json({ error: "need at least two filenames" }, { status: 400 });
  }
  await combineIntoGroup(filenames);
  const pending = await listPendingGroups();
  return Response.json({ pending });
}

/** Splits one filename back out of its group. */
export async function DELETE(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("filename");
  if (!filename) {
    return Response.json({ error: "missing filename" }, { status: 400 });
  }
  await ungroupFile(filename);
  const pending = await listPendingGroups();
  return Response.json({ pending });
}
