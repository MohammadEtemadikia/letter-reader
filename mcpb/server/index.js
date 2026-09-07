import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import fs from "node:fs/promises";

import { listPendingLetters, readLetterImage, archiveLetter } from "./lib/inbox.js";
import { appendResults } from "./lib/excel.js";
import { startUploadServer, getUploadQrPng } from "./lib/upload-server.js";
import { getStrings, normalizeLang } from "./lib/i18n.js";

const INBOX = process.env.LETTERS_INBOX_DIR;
const ARCHIVE = process.env.LETTERS_ARCHIVE_DIR;
const OUTPUT = process.env.LETTERS_OUTPUT_XLSX;
const PORT = Number(process.env.UPLOAD_PORT || 8934);
const LANG = normalizeLang(process.env.LETTERS_LANGUAGE);

if (!INBOX || !ARCHIVE || !OUTPUT) {
  throw new Error("Inbox/archive folders or the Excel output path are not configured.");
}

await fs.mkdir(INBOX, { recursive: true });
await fs.mkdir(ARCHIVE, { recursive: true });

const t = getStrings(LANG);

const server = new McpServer({ name: "letter-reader", version: "1.0.0" });

server.registerTool(
  "list_new_letters",
  {
    title: t.tools.list.title,
    description: t.tools.list.description,
    inputSchema: z.object({}),
  },
  async () => {
    const files = await listPendingLetters(INBOX);
    return {
      content: [
        {
          type: "text",
          text: files.length
            ? `${t.tools.list.found(files.length)}\n` + files.map((f, i) => `${i + 1}. ${f}`).join("\n")
            : t.tools.list.empty,
        },
      ],
    };
  }
);

server.registerTool(
  "get_letter_image",
  {
    title: t.tools.image.title,
    description: t.tools.image.description,
    inputSchema: z.object({
      filename: z.string().describe(t.tools.image.filenameArg),
    }),
  },
  async ({ filename }) => {
    const { base64, mimeType } = await readLetterImage(INBOX, filename);
    return { content: [{ type: "image", data: base64, mimeType }] };
  }
);

server.registerTool(
  "save_letter_results",
  {
    title: t.tools.save.title,
    description: t.tools.save.description,
    inputSchema: z.object({
      letters: z.array(
        z.object({
          filename: z.string(),
          sender: z.string(),
          recipient: z.string(),
          date: z.string(),
          subject: z.string(),
          short_summary: z.string(),
          full_description: z.string(),
          action_needed: z.string(),
        })
      ),
    }),
  },
  async ({ letters }) => {
    await appendResults(OUTPUT, letters, LANG);
    for (const letter of letters) {
      await archiveLetter(INBOX, ARCHIVE, letter.filename);
    }
    return {
      content: [{ type: "text", text: t.tools.save.result(letters.length, OUTPUT) }],
    };
  }
);

server.registerTool(
  "get_upload_qr",
  {
    title: t.tools.qr.title,
    description: t.tools.qr.description,
    inputSchema: z.object({}),
  },
  async () => {
    const { pngBase64, url } = await getUploadQrPng();
    return {
      content: [
        { type: "text", text: t.tools.qr.result(url) },
        { type: "image", data: pngBase64, mimeType: "image/png" },
      ],
    };
  }
);

server.registerPrompt(
  "process_new_letters",
  {
    title: t.prompt.title,
    description: t.prompt.description,
    argsSchema: z.object({}),
  },
  () => ({
    messages: [{ role: "user", content: { type: "text", text: t.prompt.instructions } }],
  })
);

startUploadServer({ port: PORT, inboxDir: INBOX, lang: LANG });
void serveStdio(() => server);
