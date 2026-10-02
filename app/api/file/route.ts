import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { archiveDir, inboxDir } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves the original scan behind a filed document, so a card can show the
 * paper it was read from. Processed files live in Archive; a file still
 * waiting is served from Inbox.
 */

const CONTENT_TYPE: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
};

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("name");
  if (!requested) return new Response("missing name", { status: 400 });

  // basename() alone defeats traversal: the result can only ever be a leaf
  // name resolved inside one of the two known folders.
  const name = path.basename(requested);
  const ext = path.extname(name).toLowerCase();
  const contentType = CONTENT_TYPE[ext];
  if (!contentType) return new Response("unsupported file type", { status: 400 });

  for (const dir of [archiveDir(), inboxDir()]) {
    const filePath = path.join(dir, name);
    try {
      const bytes = await fs.readFile(filePath);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      /* try the next folder */
    }
  }

  return new Response("not found", { status: 404 });
}
