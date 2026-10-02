# Administration Assistant

A local desktop app for the paperwork of running several businesses at once.
Photograph your post — letters, invoices, reminders, tax and government mail,
contracts, receipts — and each piece is read, **filed under the company it is
addressed to**, sorted into a workflow bucket (action required, waiting,
scheduled, handled, archive, needs review) and tagged with its deadline,
amount and reference. Any language in, a triage dashboard and a per-company
Excel workbook out. Runs entirely on your own machine.

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
reads the documents, and it needs your own account.

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

### 1. Add your companies (once)

Open the **Companies** tab and add every business whose post you handle. For
each one, list anything that identifies it on paper:

| Field | Why it matters |
|---|---|
| Name | the legal name as it appears in the address block |
| Other names | trade names, abbreviations, the name without `B.V.` |
| VAT / registration numbers | the strongest signal — a KvK or VAT number beats a fuzzy name match |
| Addresses | post addressed to a location rather than a name |
| Note | free-text hint, e.g. "the holding — only tax and bank post" |

Everything you enter here is handed to the model as the evidence it matches a
document's recipient against. Documents matching none of them land under
**Unassigned**, where you can re-file them with one dropdown.

### 2. Scan the post

On the **Intake** tab: drag photos in, click to browse, or scan the QR code
from "Upload from phone" to send them straight from your phone (same Wi-Fi).
If one document spans several photos, tick them all and click "Combine as one
document" — they are read together and produce a single entry.

### 3. Read & file

Click **Read & file documents**. Progress streams in live, in batches if the
queue is large. For each document the assistant extracts the usual reading —
sender, recipient, date, subject, summary, details, action needed, in the
document's own language — and then files it:

| Decision | Values |
|---|---|
| Company | one of yours, or Unassigned |
| Status | action required · waiting on reply · scheduled · handled · archive · needs review |
| Priority | urgent · high · normal · low |
| Type | invoice, reminder, tax, government, bank, insurance, contract, legal, utility, HR, medical, property, marketing, personal, other |
| Facts | due date, document date, amount + currency, reference number |

Anything too unclear to file confidently goes to **Needs review** rather than
being guessed at, and a shaky company match is flagged on the card.

### 4. Work the dashboard

The **Dashboard** is the triage view: pick a company (or all of them), then
read down the buckets — most urgent first, overdue items on top, with what is
outstanding totalled per currency. Every card can be re-filed in place:
status, company, priority, type and due date are dropdowns, and expanding a
card shows the full text, a note field, the original scan, and translation
into Persian, English, Dutch or Turkish.

Re-filing a card is remembered — a document you corrected is marked as
reviewed by you.

### 5. The workbook

`administration.xlsx` is rewritten from the live data after every change, so
it never drifts from the app. It has an **Overview** tab (companies × buckets,
overdue counts, open amounts), an **Action required** tab collecting
everything still open across all companies, and **one tab per company** plus
Unassigned — each a filterable table sorted so open items come first.

Open it with the button in the dashboard toolbar; it opens the one persistent
file directly rather than saving a fresh download copy each time.

Processed photos move from `Inbox` to `Archive` automatically — nothing is
deleted, and each card can show the scan it came from.

### Where things live

| macOS | `~/Library/Application Support/Letter Reader/` |
|---|---|
| Windows | `%APPDATA%\Letter Reader\` |
| Running from source (`npm run dev`) | `~/Documents/Letter Reader/` |

Inside: `Inbox/` (pending photos), `Archive/` (processed photos),
`administration.xlsx` (regenerated from the data below), `documents.json`
(every filed document — the source of truth), `companies.json` (your company
roster), `groups.json` (multi-page groupings).

---

## Sandboxing

Each run copies only the documents being processed into a temporary directory,
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
  page.tsx                shell: tabs, the document + company state everything reads
  components/
    Dashboard.tsx         company rail, filters, totals, the workflow buckets
    DocumentCard.tsx      one filed document: triage line, re-filing controls, translation
    Intake.tsx            drop zone, queue, multi-page grouping, the run
    Companies.tsx         the company roster editor
  api/analyze/route.ts    stages scans, drives Claude Code, streams progress, files results
  api/documents/route.ts  list / re-file / delete filed documents
  api/companies/route.ts  company CRUD (and detaching documents from a deleted one)
  api/file/route.ts       serves one archived scan back to a card
  api/translate/route.ts  on-demand translation of a document's prose
  api/inbox/route.ts      list / add / remove pending scans
  api/export/route.ts     download the current administration.xlsx
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
  taxonomy.ts             the buckets, types and priorities — and the rules the model files by
  document.ts             the DocumentRecord shape + derived views (overdue, triage order)
  documents.ts            the document store (documents.json)
  company.ts              the Company shape + how the roster is described to the model
  companies.ts            the company store (companies.json)
  json-store.ts           atomic writes + per-file locking for both stores
  prompt.ts               the read-and-file contract, and the translation prompts
  inbox.ts                persistent Inbox/Archive + per-run staging
  claude-cli.ts           auth check + the run's security hardening
  i18n.ts                 all interface copy
  ui.ts                   tone / colour helpers shared by the components
  xlsx-writer.ts          regenerates the workbook from the stores
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
