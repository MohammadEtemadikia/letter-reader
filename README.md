# Letter Reader

A local desktop app that reads photos of letters and writes a structured
summary of each one — sender, recipient, date, subject, a short summary, a
fuller description, and any action needed — into an Excel file.
Persian, English, and Dutch. Runs entirely on your own machine.

**There is no API key and no server of its own.** Every analysis runs through
the Claude Code session already installed and signed in on the machine, on
that person's own Claude subscription. Nothing is uploaded anywhere except to
your own account's normal Claude usage.

---

## Requirements

| | |
|---|---|
| Node.js | 20 or newer |
| Claude Code | installed and signed in |
| Claude plan | any plan that includes Claude Code |

## Setup

### Step 1 — install Claude Code and sign in (once)

This is the one step the app cannot do for you. Claude Code is the engine that
reads the letters, and it needs your own account.

```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

### Step 2 — open the app

**Desktop app (nothing else to install).** Node.js is bundled inside:

| System | File | How |
|---|---|---|
| Windows | `Letter Reader.exe` | double-click it |
| macOS | `Letter Reader-1.0.0-arm64.dmg` (Apple Silicon) or `…-1.0.0.dmg` (Intel) | open, drag to Applications, then open |
| Linux | `.AppImage` | make it executable, then run it |

On macOS the first open shows *"cannot be opened because the developer cannot
be verified"* — the build is unsigned. Right-click the app → **Open** → Open.
Windows SmartScreen shows a similar notice: **More info** → **Run anyway**.

**Or run from source** if you have Node.js 20+:

```bash
npm run doctor   # checks Node, Claude Code, sign-in — spends no tokens
npm run setup    # install dependencies and build
npm run dev      # http://localhost:3400
```

There are also launchers for source checkouts — `start.bat` on Windows,
`start.sh` on macOS/Linux — which install, build, start the mobile-upload
server, and open the browser for you.

## Building the desktop app

```bash
npm run package:mac       # .dmg for Apple Silicon and Intel
npm run package:win       # Windows installer + portable .exe   (run on Windows)
npm run package:win:exe   # Windows .exe folder, no installer   (works on macOS)
npm run package:linux     # .AppImage
```

Output lands in `dist/`. The placeholder app icon is `build/icon.png` — swap
it for your own artwork and re-package; electron-builder derives the `.ico`
and `.icns` automatically.

---

## Using it

1. **Add letters.** Drag photos into the app window, click to browse (camera
   roll or gallery — not camera-only), or scan the QR code shown by the
   "Upload from phone" button to send photos straight from your phone (it
   must be on the same Wi-Fi).
2. **Multi-page letters.** If a letter spans more than one photo, select all
   of its pages in the queue (checkboxes) and click "Combine as one letter" —
   they're read together and produce a single entry.
3. **Pick a language.** Defaults to English. Letters can be in any language —
   Claude reads the original — but the summaries, the app's own interface
   (set in Vazirmatn for Persian), and the Excel headers follow whichever of
   English / Persian / Dutch you select.
4. **Click "Process letters."** Progress streams in live, in batches if the
   queue is large. Each letter is appended as its own block — not a new file,
   and not a cramped spreadsheet row — to the single running `letters.xlsx`.
5. **Open the Excel file** any time with the button next to the results
   cards — it opens the one persistent file directly (or reveals it in
   Finder/Explorer), rather than saving a fresh download copy each time.

Processed photos move from `Inbox` to `Archive` automatically — nothing is
deleted.

### Where things live

| macOS | `~/Library/Application Support/Letter Reader/` |
|---|---|
| Windows | `%APPDATA%\Letter Reader\` |
| Running from source (`npm run dev`) | `~/Documents/Letter Reader/` |

Inside: `Inbox/` (pending photos), `Archive/` (processed photos),
`letters.xlsx` (the one running output, appended to — never recreated),
`groups.json` (multi-page letter groupings), `prefs.json` (last language picked).

---

## Sandboxing

Each run copies only the letters being processed into a temporary directory,
deleted when the run ends. Inside that run, Claude Code has **read-only
access and nothing else**: no shell, no writing, no network, no third-party
MCP servers, and none of your own hooks or plugins. It is also pinned to
`--permission-mode default`, so a global `bypassPermissions` setting cannot
loosen it.

The mobile-upload server is a second, separate process bound to the local
Wi-Fi. It can only receive a photo and save it to the Inbox folder — it has no
access to the rest of the app, and cannot trigger an analysis run itself.

---

## Layout

```
app/
  page.tsx                interface: drag-drop, language, run, results, export
  api/analyze/route.ts    stages letters, drives Claude Code, streams progress
  api/inbox/route.ts      list / add / remove pending letters
  api/export/route.ts     download the current letters.xlsx
  api/upload-info/route.ts  LAN URL + QR code for the mobile upload page
  api/health/route.ts     is Claude Code installed and signed in?
electron/
  main.cjs                desktop shell: starts the bundled server + upload server
  upload-server.cjs       LAN-bound photo upload endpoint + mobile page
scripts/
  doctor.mjs              terminal prerequisite check
  prepare-server.mjs      completes the standalone build for packaging
  after-pack.cjs          copies the server into the packaged app
  upload-server-standalone.cjs  runs the upload server outside Electron (dev/source)
lib/
  prompt.ts               operator rules + JSON output contract, FA/EN/NL
  inbox.ts                persistent Inbox/Archive + per-run staging
  claude-cli.ts           auth check + the run's security hardening
  i18n.ts                 all interface copy, FA/EN/NL
  xlsx-writer.ts          appends results to the output workbook
```

## Troubleshooting

Run `npm run doctor` first — it identifies most problems directly.

| Symptom | Cause |
|---|---|
| "Claude Code is not installed" | not on `PATH` — reinstall, then reload the page |
| "not signed in" | run `claude auth login`, then reload |
| Run fails instantly | run `claude` once in a terminal to clear any first-run prompt |
| QR page doesn't load on phone | phone and computer must be on the same Wi-Fi network |
| macOS "developer cannot be verified" | unsigned build — right-click the app → Open → Open |
| Windows SmartScreen warning | unsigned build — More info → Run anyway |
| Port 3400/8934 in use | set `PORT` / `LETTER_READER_UPLOAD_PORT` env vars before starting |
