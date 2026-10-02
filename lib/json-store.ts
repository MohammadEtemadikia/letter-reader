import { promises as fs } from "fs";
import path from "path";

/**
 * Tiny persistence helper shared by the company and document stores.
 *
 * Two things matter here. Writes go through a temp file and a rename, so a
 * crash mid-write can never leave a half-written documents.json behind. And
 * every mutation of one path is queued behind the previous one, because the
 * UI fires several PATCHes at once (re-filing a few cards in a row) and a
 * plain read-modify-write would silently drop all but the last.
 */

const queues = new Map<string, Promise<unknown>>();

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

/** Runs read-modify-write mutations of one file strictly one at a time. */
export function withFileLock<T>(filePath: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(filePath) ?? Promise.resolve();
  const next = previous.then(work, work);
  queues.set(
    filePath,
    next.catch(() => {}),
  );
  return next;
}
