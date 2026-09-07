/**
 * Standalone LAN-reachable HTTP server for mobile photo upload.
 *
 * Deliberately separate from the main Next.js server (which stays bound to
 * 127.0.0.1 and hosts the routes that spawn Claude Code): this process only
 * ever does two things — serve a small upload page, and accept a photo POST
 * — so opening it to the local Wi-Fi doesn't also expose the app's other
 * routes to anyone else on the network.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"]);

const FONTS_DIR = path.join(__dirname, "fonts");
const FONT_FILES = {
  "vazirmatn-latin-400-normal.woff2": "font/woff2",
  "vazirmatn-latin-700-normal.woff2": "font/woff2",
};

/**
 * Two separate inputs rather than one: a plain `accept="image/*"` input lets
 * mobile browsers offer a whole menu (camera, files, cloud providers, ...),
 * which is an extra decision every time. Splitting "Take Photo" (with
 * `capture`, so it jumps straight to the camera) from "Choose from Gallery"
 * (which keeps multi-select) removes that ambiguity.
 */
function renderPage() {
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Letter Upload</title>
<style>
  :root { color-scheme: dark; }
  @font-face {
    font-family: "Vazirmatn";
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url("/fonts/vazirmatn-latin-400-normal.woff2") format("woff2");
  }
  @font-face {
    font-family: "Vazirmatn";
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url("/fonts/vazirmatn-latin-700-normal.woff2") format("woff2");
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Vazirmatn", system-ui, "Segoe UI", Tahoma, sans-serif;
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
  .buttons {
    margin-top: 2.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    width: 100%;
    max-width: 20rem;
  }
  label {
    background: #2e4b6e;
    color: #fff;
    padding: 1rem 1.5rem;
    border-radius: 999px;
    font-weight: 700;
    font-size: 1rem;
    cursor: pointer;
    border: none;
    text-align: center;
  }
  label.secondary {
    background: transparent;
    border: 1px solid #3a4249;
    color: #ede9e2;
  }
  input { display: none; }
  #status { margin-top: 1.6rem; font-size: 0.92rem; min-height: 1.4rem; text-align: center; }
  .ok { color: #7fd0a0; }
  .err { color: #dd9987; }
  .pending { color: #a8ada7; }
</style>
</head>
<body>
  <div class="icon">✉️</div>
  <h1>Upload letter photo</h1>
  <p>Take a photo of the letter, or pick one or more from your gallery. It goes straight to the processing queue on your computer.</p>
  <div class="buttons">
    <label for="camera">📷 Take photo</label>
    <input id="camera" type="file" accept="image/*" capture="environment" />
    <label class="secondary" for="gallery">🖼️ Choose from gallery</label>
    <input id="gallery" type="file" accept="image/*" multiple />
  </div>
  <div id="status"></div>
  <script>
    var status = document.getElementById("status");
    var SENDING = "Uploading...";
    var OK_TEMPLATE = "{n} photo(s) uploaded successfully ✓";
    var PARTIAL_TEMPLATE = "{ok} of {total} photo(s) uploaded.";

    function upload(input) {
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
    }

    document.getElementById("camera").addEventListener("change", function (e) {
      upload(e.target);
    });
    document.getElementById("gallery").addEventListener("change", function (e) {
      upload(e.target);
    });
  </script>
</body>
</html>`;
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
    let body = part.slice(headerEnd + 4);
    if (body.slice(-2).toString() === "\r\n") body = body.slice(0, -2);
    files.push({ filename: filenameMatch[1], data: body });
  }
  return files;
}

/**
 * @param {{ port: number, inboxDir: string }} opts
 */
function startUploadServer({ port, inboxDir }) {
  fs.mkdirSync(inboxDir, { recursive: true });

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/upload")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderPage());
      return;
    }

    if (req.method === "GET" && req.url.startsWith("/fonts/")) {
      const name = req.url.slice("/fonts/".length);
      const mime = FONT_FILES[name];
      if (!mime) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      try {
        const data = fs.readFileSync(path.join(FONTS_DIR, name));
        res.writeHead(200, { "Content-Type": mime, "Cache-Control": "public, max-age=31536000, immutable" });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
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
      req.on("end", () => {
        try {
          const buffer = Buffer.concat(chunks);
          const files = parseMultipart(buffer, boundaryMatch[1]);
          let saved = 0;
          for (const file of files) {
            const ext = path.extname(file.filename).toLowerCase() || ".jpg";
            if (!IMAGE_EXT.has(ext)) continue;
            const safeName = `letter-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${ext}`;
            fs.writeFileSync(path.join(inboxDir, safeName), file.data);
            saved += 1;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, saved }));
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

module.exports = { startUploadServer };
