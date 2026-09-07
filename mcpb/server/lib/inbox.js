import fs from "node:fs/promises";
import path from "node:path";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);

const MIME_BY_EXT = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export async function listPendingLetters(inboxDir) {
  const entries = await fs.readdir(inboxDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();
}

export async function readLetterImage(inboxDir, filename) {
  const safeName = path.basename(filename);
  const filePath = path.join(inboxDir, safeName);
  const buf = await fs.readFile(filePath);
  const mimeType = MIME_BY_EXT[path.extname(safeName).toLowerCase()] || "image/jpeg";
  return { base64: buf.toString("base64"), mimeType };
}

export async function archiveLetter(inboxDir, archiveDir, filename) {
  const safeName = path.basename(filename);
  const from = path.join(inboxDir, safeName);
  const to = path.join(archiveDir, safeName);
  try {
    await fs.rename(from, to);
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
}
