#!/usr/bin/env node
/**
 * Prerequisite check that runs without starting the app, so a user can
 * diagnose their own machine from a terminal. Spends no tokens.
 *
 *   npm run doctor
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";

const run = promisify(execFile);
const IS_WINDOWS = process.platform === "win32";

// Colour only when writing to a terminal, so piped output stays clean.
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (COLOR ? `\x1b[${code}m` : "");
const GREEN = c(32);
const RED = c(31);
const YELLOW = c(33);
const DIM = c(2);
const RESET = c(0);

let failures = 0;
let warnings = 0;

function ok(label, detail = "") {
  console.log(`${GREEN}✓${RESET} ${label}${detail ? ` ${DIM}${detail}${RESET}` : ""}`);
}
function bad(label, fix) {
  failures += 1;
  console.log(`${RED}✗${RESET} ${label}`);
  if (fix) console.log(`  ${DIM}→ ${fix}${RESET}`);
}
function warn(label, fix) {
  warnings += 1;
  console.log(`${YELLOW}!${RESET} ${label}`);
  if (fix) console.log(`  ${DIM}→ ${fix}${RESET}`);
}

console.log("\nLetter Reader — setup check\n");

// --- Node --------------------------------------------------------------------
const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) ok("Node.js", `v${process.versions.node}`);
else
  bad(
    `Node.js v${process.versions.node} is too old (need 20+)`,
    "Install Node 20 or newer from https://nodejs.org",
  );

console.log(`${GREEN}✓${RESET} Platform ${DIM}${process.platform} ${process.arch}${RESET}`);

// --- Claude Code -------------------------------------------------------------
let installed = false;
try {
  const { stdout } = await run("claude", ["--version"], {
    timeout: 20_000,
    shell: IS_WINDOWS,
  });
  installed = true;
  ok("Claude Code installed", stdout.trim().split("\n")[0]);
} catch (error) {
  if (error?.code === "ENOENT") {
    bad(
      "Claude Code is not installed (or not on PATH)",
      "npm install -g @anthropic-ai/claude-code",
    );
  } else {
    bad(`Claude Code could not be run: ${error?.message ?? "unknown error"}`);
  }
}

if (installed) {
  try {
    const { stdout } = await run("claude", ["auth", "status"], {
      timeout: 30_000,
      shell: IS_WINDOWS,
    });
    const auth = JSON.parse(stdout);
    if (auth.loggedIn) {
      ok(
        "Signed in",
        `${auth.email ?? "account"}${auth.subscriptionType ? ` · ${auth.subscriptionType}` : ""}`,
      );
    } else {
      bad("Claude Code is not signed in", "claude auth login");
    }
  } catch (error) {
    if (/JSON|Unexpected token/i.test(error?.message ?? "")) {
      warn(
        "`claude auth status` returned unexpected output",
        "Update Claude Code: claude update",
      );
    } else {
      bad("Claude Code is not signed in", "claude auth login");
    }
  }
}

// --- Project -----------------------------------------------------------------
if (existsSync("node_modules")) ok("Dependencies installed");
else warn("Dependencies not installed yet", "npm install");

if (existsSync(".next")) ok("Production build present");
else warn("No production build yet", "npm run build  (or just use npm run dev)");

// --- Verdict -----------------------------------------------------------------
console.log("");
if (failures > 0) {
  console.log(`${RED}Not ready${RESET} — ${failures} blocking issue${failures === 1 ? "" : "s"} above.\n`);
  process.exit(1);
}
if (warnings > 0) {
  console.log(`${YELLOW}Almost ready${RESET} — ${warnings} thing${warnings === 1 ? "" : "s"} to finish, then: npm run dev\n`);
  process.exit(0);
}
console.log(`${GREEN}Ready.${RESET} Start it with: npm run dev  →  http://localhost:3400\n`);
