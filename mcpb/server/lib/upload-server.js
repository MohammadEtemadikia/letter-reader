import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { getStrings } from "./i18n.js";

let cachedInboxDir = null;
let cachedPort = 8934;
let cachedUrl = null;

function renderUploadPage(lang) {
  const t = getStrings(lang).upload;
  const dir = getStrings(lang).dir;
  const htmlLang = getStrings(lang).htmlLang;
  return `<!doctype html>
<html lang="${htmlLang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${t.pageTitle}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    font-family: Tahoma, "Segoe UI", sans-serif;
    background: #14171a;
    color: #ede9e2;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 3rem 1.5rem;
    min-height: 100vh;
    margin: 0;
  }
  .icon { font-size: 2.4rem; margin-bottom: 0.6rem; }
  h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
  p { color: #a8ada7; font-size: 0.92rem; margin: 0; text-align: center; max-width: 32ch; line-height: 1.6; }
  label {
    margin-top: 2.4rem;
    background: #2e4b6e;
    color: #fff;
    padding: 1rem 2.2rem;
    border-radius: 999px;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
    border: none;
  }
  label:active { filter: brightness(1.1); }
  input { display: none; }
  #status { margin-top: 1.6rem; font-size: 0.92rem; min-height: 1.4rem; text-align: center; }
  .ok { color: #7fd0a0; }
  .err { color: #dd9987; }
  .pending { color: #a8ada7; }
</style>
</head>
<body>
  <div class="icon">${t.icon}</div>
  <h1>${t.title}</h1>
  <p>${t.subtitle}</p>
  <label for="file">${t.button}</label>
  <input id="file" type="file" accept="image/*" capture="environment" multiple />
  <div id="status"></div>
  <script>
    var input = document.getElementById("file");
    var status = document.getElementById("status");
    var SENDING = ${JSON.stringify(t.sending)};
    var OK_TEMPLATE = ${JSON.stringify(t.okTemplate)};
    var PARTIAL_TEMPLATE = ${JSON.stringify(t.partialTemplate)};
    input.addEventListener("change", function () {
      var files = Array.prototype.slice.call(input.files || []);
      if (!files.length) return;
      status.textContent = SENDING;
      status.className = "pending";
      var okCount = 0;
      var sendNext = function (i) {
        if (i >= files.length) {
          if (okCount === files.length) {
            status.textContent = OK_TEMPLATE.replace("{n}", okCount);
            status.className = "ok";
          } else {
            status.textContent = PARTIAL_TEMPLATE.replace("{ok}", okCount).replace("{total}", files.length);
            status.className = okCount ? "ok" : "err";
          }
          input.value = "";
          return;
        }
        var form = new FormData();
        form.append("photo", files[i], files[i].name);
        fetch("/upload", { method: "POST", body: form })
          .then(function (res) {
            if (res.ok) okCount += 1;
            sendNext(i + 1);
          })
          .catch(function () {
            sendNext(i + 1);
          });
      };
      sendNext(0);
    });
  </script>
</body>
</html>`;
}

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    parts.push(buffer.slice(start + boundaryBuf.length, next));
    start = next;
  }
  const files = [];
  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString("utf8");
    const filenameMatch = header.match(/filename="([^"]*)"/);
    if (!filenameMatch || !filenameMatch[1]) continue;
    const typeMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString() === "\r\n") body = body.slice(0, -2);
    files.push({
      filename: filenameMatch[1],
      contentType: typeMatch ? typeMatch[1].trim() : "application/octet-stream",
      data: body,
    });
  }
  return files;
}

export function startUploadServer({ port, inboxDir, lang }) {
  cachedInboxDir = inboxDir;
  cachedPort = port;
  const ip = getLocalIp();
  cachedUrl = `http://${ip}:${port}/`;
  const html = renderUploadPage(lang);

  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/upload")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.method === "POST" && req.url === "/upload") {
      const contentType = req.headers["content-type"] || "";
      const boundaryMatch = contentType.match(/boundary=(.*)$/);
      if (!boundaryMatch) {
        res.writeHead(400);
        res.end("missing boundary");
        return;
      }
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const files = parseMultipart(buffer, boundaryMatch[1]);
          for (const file of files) {
            const ext = path.extname(file.filename) || ".jpg";
            const safeName = `letter-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`;
            await fs.writeFile(path.join(cachedInboxDir, safeName), file.data);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, saved: files.length }));
        } catch {
          res.writeHead(500);
          res.end("error");
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  server.listen(port, "0.0.0.0");
  return server;
}

export async function getUploadQrPng() {
  const url = cachedUrl || `http://127.0.0.1:${cachedPort}/`;
  const pngBuffer = await QRCode.toBuffer(url, { width: 320, margin: 1 });
  return { pngBase64: pngBuffer.toString("base64"), url };
}
