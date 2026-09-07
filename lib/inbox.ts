import { promises as fs } from "fs";
import os from "os";
import path from "path";

/**
 * Where letter photos live between runs. Set by electron/main.cjs to Electron's
 * per-user app-data folder; falls back to a Documents subfolder so `next dev`
 * (no Electron parent) still works for local development.
 */
export function dataDir(): string {
  const fromEnv = process.env.LETTER_READER_DATA_DIR;
  if (fromEnv) return fromEnv;
  return path.join(os.homedir(), "Documents", "Letter Reader");
}

export function inboxDir(): string {
  return path.join(dataDir(), "Inbox");
}

export function archiveDir(): string {
  return path.join(dataDir(), "Archive");
}

export function outputXlsxPath(): string {
  return path.join(dataDir(), "letters.xlsx");
}

export async function ensureDirs(): Promise<void> {
  await fs.mkdir(inboxDir(), { recursive: true });
  await fs.mkdir(archiveDir(), { recursive: true });
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"]);
const JUNK_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini", ".localized"]);

function isJunk(name: string): boolean {
  const lower = name.toLowerCase();
  return JUNK_NAMES.has(lower) || lower.startsWith(".");
}

export type PendingPhoto = {
  filename: string;
  sizeBytes: number;
  modifiedAt: number;
};

/** Photos currently waiting in the Inbox, oldest first (the order they'll be numbered in). */
export async function listPending(): Promise<PendingPhoto[]> {
  await ensureDirs();
  const entries = await fs.readdir(inboxDir(), { withFileTypes: true });
  const photos: PendingPhoto[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (isJunk(entry.name)) continue;
    if (!IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const stat = await fs.stat(path.join(inboxDir(), entry.name));
    photos.push({ filename: entry.name, sizeBytes: stat.size, modifiedAt: stat.mtimeMs });
  }
  photos.sort((a, b) => a.modifiedAt - b.modifiedAt);
  return photos;
}

export async function createStagingDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "lr-studio-"));
}

export async function removeStagingDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
}

/** Sanitises one filename so a copy into the staging dir can't escape it. */
function safeName(name: string, fallback: string): string {
  const cleaned = path
    .basename(name)
    .replace(/^\.+/, "")
    .replace(/[^A-Za-z0-9._ ()\-&+]/g, "_")
    .trim();
  return cleaned || fallback;
}

/**
 * Copies the given Inbox filenames into a fresh, isolated staging directory
 * for one analysis run. The run only ever sees this directory, never the
 * persistent Inbox itself.
 */
export async function stageForRun(
  stagingDir: string,
  filenames: string[],
): Promise<{ original: string; stagedAs: string }[]> {
  const used = new Set<string>();
  const staged: { original: string; stagedAs: string }[] = [];
  for (const [index, filename] of filenames.entries()) {
    let target = safeName(filename, `letter_${index + 1}${path.extname(filename) || ".jpg"}`);
    let counter = 2;
    while (used.has(target.toLowerCase())) {
      const parsed = path.parse(target);
      target = `${parsed.name}_${counter}${parsed.ext}`;
      counter += 1;
    }
    used.add(target.toLowerCase());
    await fs.copyFile(path.join(inboxDir(), filename), path.join(stagingDir, target));
    staged.push({ original: filename, stagedAs: target });
  }
  return staged;
}

/** Moves the given Inbox filenames into Archive after a successful run. */
export async function archiveFiles(filenames: string[]): Promise<void> {
  await fs.mkdir(archiveDir(), { recursive: true });
  for (const filename of filenames) {
    try {
      await fs.rename(path.join(inboxDir(), filename), path.join(archiveDir(), filename));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  await pruneGroups(filenames);
}

export const MAX_FILES = 400;
export const MAX_TOTAL_BYTES = 1200 * 1024 * 1024;
/** Files per Claude Code call. Large batches are chunked so one run stays reliable. */
export const BATCH_SIZE = 15;

/* -------------------------------------------------------------------------- */
/*  MULTI-PAGE GROUPING                                                       */
/*                                                                            */
/*  A letter can span more than one photo (front/back, page 1/2/...). Groups  */
/*  are tracked in a small JSON manifest — only entries with 2+ files are     */
/*  stored; anything not mentioned is implicitly its own single-page letter.  */
/* -------------------------------------------------------------------------- */

export type PendingGroup = { id: string; files: PendingPhoto[] };

function groupsPath(): string {
  return path.join(dataDir(), "groups.json");
}

async function readGroupsRaw(): Promise<string[][]> {
  try {
    const raw = await fs.readFile(groupsPath(), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((g): g is string[] => Array.isArray(g)) : [];
  } catch {
    return [];
  }
}

async function writeGroupsRaw(groups: string[][]): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(groupsPath(), JSON.stringify(groups), "utf8");
}

/** Pending photos grouped into letters — a multi-page letter is one entry with several files. */
export async function listPendingGroups(): Promise<PendingGroup[]> {
  const pending = await listPending();
  const byName = new Map(pending.map((p) => [p.filename, p]));
  const rawGroups = (await readGroupsRaw())
    .map((g) => g.filter((f) => byName.has(f)))
    .filter((g) => g.length > 1);

  const emitted = new Set<string>();
  const result: PendingGroup[] = [];
  for (const p of pending) {
    if (emitted.has(p.filename)) continue;
    const group = rawGroups.find((g) => g.includes(p.filename));
    if (group) {
      group.forEach((f) => emitted.add(f));
      result.push({ id: group[0], files: group.map((f) => byName.get(f)!).filter(Boolean) });
    } else {
      emitted.add(p.filename);
      result.push({ id: p.filename, files: [p] });
    }
  }
  return result;
}

/** Combines the given pending filenames into one multi-page letter, in the given page order. */
export async function combineIntoGroup(filenames: string[]): Promise<void> {
  if (filenames.length < 2) return;
  const raw = await readGroupsRaw();
  const cleaned = raw.map((g) => g.filter((f) => !filenames.includes(f))).filter((g) => g.length > 1);
  cleaned.push(filenames);
  await writeGroupsRaw(cleaned);
}

/** Removes one file from whatever group it's in — it becomes its own single-page letter again. */
export async function ungroupFile(filename: string): Promise<void> {
  const raw = await readGroupsRaw();
  const updated = raw.map((g) => g.filter((f) => f !== filename)).filter((g) => g.length > 1);
  await writeGroupsRaw(updated);
}

/** Drops the given filenames from any stored group once they've left the Inbox. */
async function pruneGroups(filenames: string[]): Promise<void> {
  const raw = await readGroupsRaw();
  if (raw.length === 0) return;
  const updated = raw.map((g) => g.filter((f) => !filenames.includes(f))).filter((g) => g.length > 1);
  await writeGroupsRaw(updated);
}
