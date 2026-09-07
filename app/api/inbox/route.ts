import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { inboxDir, listPendingGroups, ensureDirs, ungroupFile } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"]);

export async function GET() {
  const pending = await listPendingGroups();
  return Response.json({ pending }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  await ensureDirs();
  const form = await request.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  let saved = 0;
  for (const file of files) {
    const ext = path.extname(file.name).toLowerCase() || ".jpg";
    if (!IMAGE_EXT.has(ext)) continue;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.byteLength === 0) continue;
    const safeName = `letter-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`;
    await fs.writeFile(path.join(inboxDir(), safeName), bytes);
    saved += 1;
  }

  const pending = await listPendingGroups();
  return Response.json({ saved, pending });
}

export async function DELETE(request: NextRequest) {
  const filename = request.nextUrl.searchParams.get("filename");
  if (!filename) {
    return Response.json({ error: "missing filename" }, { status: 400 });
  }
  const safe = path.basename(filename);
  await fs.rm(path.join(inboxDir(), safe), { force: true });
  await ungroupFile(safe);
  const pending = await listPendingGroups();
  return Response.json({ pending });
}
