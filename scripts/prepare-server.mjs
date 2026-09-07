#!/usr/bin/env node
/**
 * Completes Next.js's standalone output.
 *
 * `next build` with `output: "standalone"` emits a self-contained server plus a
 * minimal node_modules, but deliberately leaves out the static assets — they
 * are normally served by a CDN. For a desktop app they have to be copied in,
 * or every page loads without CSS or client JavaScript.
 */
import { cp, mkdir, rm, stat } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error(
    'Missing .next/standalone — run "next build" with output: "standalone" first.',
  );
  process.exit(1);
}

const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standalone, ".next", "static");
await rm(staticDest, { recursive: true, force: true });
await mkdir(path.dirname(staticDest), { recursive: true });
await cp(staticSrc, staticDest, { recursive: true });
console.log("copied .next/static");

const publicSrc = path.join(root, "public");
if (existsSync(publicSrc)) {
  const publicDest = path.join(standalone, "public");
  await rm(publicDest, { recursive: true, force: true });
  await cp(publicSrc, publicDest, { recursive: true });
  console.log("copied public/");
}

const server = path.join(standalone, "server.js");
const info = await stat(server);
console.log(`standalone server ready (${info.size} bytes)`);
