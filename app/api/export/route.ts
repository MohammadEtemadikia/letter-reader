import { promises as fs } from "fs";
import { outputXlsxPath } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const filePath = outputXlsxPath();
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(filePath);
  } catch {
    return Response.json({ error: "no output file yet" }, { status: 404 });
  }

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="letters.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
