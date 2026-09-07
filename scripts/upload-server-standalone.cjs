#!/usr/bin/env node
/**
 * Runs the LAN mobile-upload server outside of Electron, for `npm run dev`
 * and the source-checkout launchers (start.sh / start.bat). Resolves the data
 * directory exactly like lib/inbox.ts's fallback, so both processes agree on
 * where the Inbox lives when LETTER_READER_DATA_DIR isn't set by Electron.
 */
const os = require("os");
const path = require("path");
const { startUploadServer } = require("../electron/upload-server.cjs");

const dataDir = process.env.LETTER_READER_DATA_DIR || path.join(os.homedir(), "Documents", "Letter Reader");
const port = Number(process.env.LETTER_READER_UPLOAD_PORT || 8934);
const inboxDir = path.join(dataDir, "Inbox");

startUploadServer({ port, inboxDir, dataDir });
console.log(`[upload-server] listening on 0.0.0.0:${port}, inbox: ${inboxDir}`);
