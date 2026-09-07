import { execFile, spawn, type ChildProcessByStdio } from "child_process";
import type { Readable, Writable } from "stream";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";

const run = promisify(execFile);

const IS_WINDOWS = process.platform === "win32";

/**
 * The analysis runs through whatever Claude Code the user already has
 * installed and logged in. Nothing about it is specific to this machine, so
 * the app must be able to report precisely which prerequisite is missing.
 */
export type Health =
  | { state: "ok"; version: string; email: string | null; plan: string | null }
  | { state: "not-installed" }
  | { state: "not-logged-in"; version: string }
  | { state: "unknown"; detail: string };

/**
 * Hardening applied to every analysis run. Layered deliberately, because this
 * app runs on other people's machines where hooks, MCP servers, plugins and a
 * global bypass-permissions default may all be configured:
 *
 * - `permissions.deny` removes the tools from the session's toolset outright
 *   (verified: the model cannot even discover them via ToolSearch).
 * - `disallowedTools` repeats the same list on the command line.
 * - `--permission-mode default` overrides a user's `bypassPermissions`
 *   default, so nothing can run unattended without approval.
 * - `--strict-mcp-config` stops third-party MCP servers loading.
 * - `disableAllHooks` stops the user's hooks firing mid-run.
 *
 * Read, Glob and Grep survive: enough to read the staged letter images, and
 * nothing else. No shell, no writes, no network.
 */
export const BLOCKED_TOOLS = [
  "Task",
  "Bash",
  "Edit",
  "Write",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Skill",
  "Workflow",
  "ToolSearch",
  "Monitor",
  "SendMessage",
  "RemoteTrigger",
  "PushNotification",
  "ScheduleWakeup",
  "DesignSync",
  "ShareOnboardingGuide",
  "ReportFindings",
  "EnterWorktree",
  "ExitWorktree",
  "CronCreate",
  "CronDelete",
  "CronList",
  "TaskCreate",
  "TaskGet",
  "TaskList",
  "TaskOutput",
  "TaskStop",
  "TaskUpdate",
];

export function buildSettings(effort: string): string {
  return JSON.stringify({
    disableAllHooks: true,
    disableBundledSkills: true,
    effortLevel: effort,
    permissions: { deny: BLOCKED_TOOLS, defaultMode: "default" },
  });
}

/**
 * Writes the two quote-heavy arguments to files and returns the flags that
 * reference them.
 *
 * Passing a JSON blob and a multi-line system prompt as literal argv values
 * works on macOS and Linux, but on Windows a `.cmd` shim has to be launched
 * through `cmd.exe`, which mangles embedded quotes. Keeping every argument a
 * simple token — flags, paths, tool names — is what makes the same code path
 * safe on all three platforms.
 */
export async function writeRunFiles(
  dir: string,
  systemPrompt: string,
  effort: string,
): Promise<string[]> {
  const settingsPath = path.join(dir, ".lr-settings.json");
  const promptPath = path.join(dir, ".lr-system-prompt.txt");
  await fs.writeFile(settingsPath, buildSettings(effort), "utf8");
  await fs.writeFile(promptPath, systemPrompt, "utf8");
  return [
    "--settings",
    settingsPath,
    "--append-system-prompt-file",
    promptPath,
  ];
}

/** Names of the helper files, so the staged-file listing can skip them. */
export const RUN_FILE_NAMES = [".lr-settings.json", ".lr-system-prompt.txt"];

/**
 * Launches Claude Code portably.
 *
 * On Windows npm installs CLIs as `.cmd` shims, which Node cannot execute
 * without a shell — a bare `spawn("claude")` fails with ENOENT. There, the
 * command goes through the shell with any space-containing argument quoted.
 * Everywhere else it is spawned directly, with no shell involved at all.
 */
export type ClaudeProcess = ChildProcessByStdio<Writable, Readable, Readable>;

export function spawnClaude(args: string[], cwd: string): ClaudeProcess {
  if (!IS_WINDOWS) {
    return spawn("claude", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ClaudeProcess;
  }
  const quoted = args.map((arg) =>
    /[\s&|<>^()]/.test(arg) ? `"${arg}"` : arg,
  );
  return spawn("claude", quoted, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
    windowsHide: true,
  }) as ClaudeProcess;
}

/**
 * Runs one non-streaming Claude Code turn and returns its final text result.
 * Used for small, fast text-only tasks (translating an already-extracted
 * letter) where the caller just needs the answer, not progress events.
 */
export async function runClaudeOnce(
  args: string[],
  cwd: string,
  stdin: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const child = spawnClaude(args, cwd);
  child.stdin.on("error", () => {});
  child.stdin.end(stdin);

  let stderrTail = "";
  let finalResultText = "";
  let gotResult = false;
  let isError = false;

  child.stderr.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-2000);
  });

  let buffer = "";
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    if (event.type === "result") {
      gotResult = true;
      isError = event.is_error === true;
      finalResultText = typeof event.result === "string" ? event.result : "";
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  });

  return new Promise((resolve) => {
    child.on("error", (error: NodeJS.ErrnoException) => {
      resolve({ ok: false, error: error.message });
    });
    child.on("close", (code) => {
      if (buffer.trim()) handleLine(buffer);
      if (!gotResult || isError || !finalResultText) {
        resolve({ ok: false, error: stderrTail.trim() || finalResultText || `exit ${code}` });
        return;
      }
      resolve({ ok: true, text: finalResultText });
    });
  });
}

/**
 * Checks the two prerequisites without spending any tokens: that the CLI
 * exists, and that it reports an authenticated account.
 */
export async function checkHealth(): Promise<Health> {
  let version: string;
  try {
    const { stdout } = await run("claude", ["--version"], {
      timeout: 20_000,
      shell: IS_WINDOWS,
    });
    version = stdout.trim().split("\n")[0] || "unknown";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { state: "not-installed" };
    return {
      state: "unknown",
      detail: error instanceof Error ? error.message : "unknown error",
    };
  }

  try {
    const { stdout } = await run("claude", ["auth", "status"], {
      timeout: 30_000,
      shell: IS_WINDOWS,
    });
    const parsed = JSON.parse(stdout) as {
      loggedIn?: boolean;
      email?: string;
      subscriptionType?: string;
      authMethod?: string;
    };
    if (!parsed.loggedIn) return { state: "not-logged-in", version };
    return {
      state: "ok",
      version,
      email: parsed.email ?? null,
      plan: parsed.subscriptionType ?? parsed.authMethod ?? null,
    };
  } catch (error) {
    // A non-zero exit here is the normal signal for "not authenticated";
    // unparseable output means an unexpected CLI version.
    const message = error instanceof Error ? error.message : "";
    if (/JSON|Unexpected token/i.test(message)) {
      return {
        state: "unknown",
        detail:
          "`claude auth status` did not return the expected JSON. Update Claude Code and try again.",
      };
    }
    return { state: "not-logged-in", version };
  }
}
