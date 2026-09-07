/**
 * Desktop shell.
 *
 * Starts the bundled Next.js server in-process using Electron's own Node
 * runtime, then shows it in a window. Nothing needs to be installed on the
 * machine for the app itself to run — no Node, no npm.
 *
 * Claude Code is still a separate prerequisite: it is the engine that reads the
 * letters, and it needs the user's own account. The app detects it and shows
 * instructions when it is missing.
 *
 * A second, separate HTTP server (upload-server.cjs) is started alongside the
 * main one, bound to the LAN instead of localhost, so a phone on the same
 * Wi-Fi can send letter photos straight into the Inbox folder.
 */
const { app, BrowserWindow, shell, dialog, Menu, ipcMain } = require("electron");
const { execFile, spawn } = require("child_process");
const { autoUpdater } = require("electron-updater");
const net = require("net");
const path = require("path");
const fs = require("fs");
const { startUploadServer } = require("./upload-server.cjs");

const IS_WINDOWS = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const UPLOAD_PORT = 8934;

let serverProcess = null;
let mainWindow = null;
let serverPort = 0;
let uploadServer = null;
let dataDirPath = null;

/* -------------------------------------------------------------------------- */
/*  PATH REPAIR                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A double-clicked app does not inherit the shell's PATH. On macOS it starts
 * with roughly `/usr/bin:/bin:/usr/sbin:/sbin`, which does not include
 * Homebrew, nvm, or ~/.local/bin — so `claude` would appear "not installed"
 * even though it works fine in a terminal.
 *
 * The login shell is asked for the real PATH, with a set of common install
 * locations merged in as a fallback.
 */
function loginShellPath() {
  if (IS_WINDOWS) return null;
  const shellBin = process.env.SHELL || "/bin/zsh";
  return new Promise((resolve) => {
    execFile(
      shellBin,
      ["-ilc", "command -p echo __PATH__:$PATH"],
      { timeout: 8000 },
      (error, stdout) => {
        if (error || !stdout) return resolve(null);
        const match = /__PATH__:(.*)/.exec(stdout);
        resolve(match ? match[1].trim() : null);
      },
    );
  });
}

async function repairPath() {
  const extras = IS_WINDOWS
    ? []
    : [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        path.join(app.getPath("home"), ".local", "bin"),
        path.join(app.getPath("home"), ".bun", "bin"),
        path.join(app.getPath("home"), ".volta", "bin"),
        "/usr/bin",
        "/bin",
      ];

  const fromShell = await loginShellPath();
  const current = process.env.PATH || "";
  const merged = [
    ...(fromShell ? fromShell.split(path.delimiter) : []),
    ...current.split(path.delimiter),
    ...extras,
  ];

  const seen = new Set();
  process.env.PATH = merged
    .map((entry) => entry.trim())
    .filter((entry) => entry && !seen.has(entry) && seen.add(entry))
    .join(path.delimiter);
}

/* -------------------------------------------------------------------------- */
/*  SERVER                                                                    */
/* -------------------------------------------------------------------------- */

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Where the built standalone server lives, packaged or not. */
function serverEntry() {
  const packaged = path.join(process.resourcesPath, "server", "server.js");
  if (app.isPackaged) return packaged;
  const local = path.join(__dirname, "..", ".next", "standalone", "server.js");
  return fs.existsSync(local) ? local : packaged;
}

/**
 * The binary used to run the headless Next.js server as a plain-Node child
 * process (see ELECTRON_RUN_AS_NODE below).
 *
 * `process.execPath` is the app's *main* executable, whose Info.plist has no
 * LSUIElement — macOS's Dock shows a tile for it no matter what the process
 * actually does at runtime, which is why a second "exec" icon appeared next
 * to the real app every time the server child process started. Electron's
 * own bundled Helper.app *is* marked LSUIElement (it exists for exactly this
 * kind of background child process), so packaged macOS builds re-exec that
 * one instead. Windows/Linux have no such Dock concept, and dev runs (via
 * `electron .`) don't have a product-named Helper to find, so both keep
 * using the plain execPath.
 */
function nodeExecPath() {
  if (!IS_MAC || !app.isPackaged) return process.execPath;
  const contentsDir = path.dirname(path.dirname(process.execPath)); // .../Contents
  // Derived from the actual installed binary's name, not app.getName() —
  // that returns package.json's "name" ("letter-reader"), not the
  // capitalized productFilename ("Letter Reader") the Helper.app is
  // actually named after on disk.
  const productFilename = path.basename(process.execPath);
  const helperName = `${productFilename} Helper`;
  return path.join(contentsDir, "Frameworks", `${helperName}.app`, "Contents", "MacOS", helperName);
}

async function startServer(dataDir) {
  const entry = serverEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(
      `The application server is missing (expected at ${entry}).\n\n` +
        "If you are running from source, build it first:\n  npm run build:app",
    );
  }

  serverPort = await freePort();

  // ELECTRON_RUN_AS_NODE turns Electron's binary into a plain Node runtime,
  // so the server runs without Node being installed on the machine.
  serverProcess = spawn(nodeExecPath(), [entry], {
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(serverPort),
      HOSTNAME: "127.0.0.1",
      LETTER_READER_DATA_DIR: dataDir,
      LETTER_READER_UPLOAD_PORT: String(UPLOAD_PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout?.on("data", (chunk) => process.stdout.write(`[server] ${chunk}`));
  serverProcess.stderr?.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));
  // Without this, a spawn failure (e.g. the executable path not existing)
  // is an unhandled 'error' event — Node throws it as an uncaught exception
  // outside any try/catch here, which silently kills the whole app with no
  // dialog at all.
  serverProcess.on("error", (error) => {
    dialog.showErrorBox(
      "Letter Reader could not start",
      `Failed to start the application server process: ${error.message}`,
    );
    app.quit();
  });

  await waitForServer(`http://127.0.0.1:${serverPort}`);
  return `http://127.0.0.1:${serverPort}`;
}

async function waitForServer(url, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(`The application server stopped unexpectedly (exit ${serverProcess.exitCode}).`);
    }
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The application server did not start in time.");
}

/* -------------------------------------------------------------------------- */
/*  WINDOW                                                                    */
/* -------------------------------------------------------------------------- */

const SPLASH = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{height:100%;margin:0;display:flex;align-items:center;justify-content:center;
    background:#fbfaf8;color:#2e4b6e;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  .box{text-align:center}
  .dot{width:34px;height:34px;margin:0 auto 18px;border-radius:50%;
    border:3px solid #ddd8d0;border-top-color:#2e4b6e;animation:s .9s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
  p{margin:0;font-size:13px;color:#5b625e}
  strong{display:block;margin-bottom:6px;font-size:15px;color:#2e4b6e}
</style></head><body><div class="box"><div class="dot"></div>
<strong>Letter Reader</strong><p>Starting…</p></div></body></html>`)}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 860,
    minHeight: 600,
    show: false,
    backgroundColor: "#fbfaf8",
    title: "Letter Reader",
    icon: IS_WINDOWS ? path.join(process.resourcesPath, "icon.ico") : undefined,
    webPreferences: {
      // The renderer only loads our own local server; it needs no Node access
      // beyond the one bridged capability in preload.cjs (opening the output file).
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  void mainWindow.loadURL(SPLASH);

  // Anything that is not the local app opens in the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}`)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  return mainWindow;
}

function buildMenu() {
  const template = [
    ...(IS_MAC ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* -------------------------------------------------------------------------- */
/*  AUTO UPDATE                                                               */
/*                                                                            */
/*  Update installers are published to GitHub Releases (see                  */
/*  electron-builder.yml). The Windows NSIS installer applies updates fully  */
/*  automatically. On macOS, Squirrel.Mac's silent replace only works        */
/*  reliably for a signed & notarized build — this app ships unsigned (see   */
/*  the `identity: null` note in electron-builder.yml), so on macOS the      */
/*  check below may still report an update but fail to install it silently;  */
/*  "Restart now" then just does what re-downloading the dmg used to do.     */
/* -------------------------------------------------------------------------- */

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function setupAutoUpdater() {
  if (!app.isPackaged) return; // dev runs have no update feed to check

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-downloaded", (info) => {
    dialog
      .showMessageBox(mainWindow, {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Update ready",
        message: `Letter Reader ${info.version} has been downloaded.`,
        detail: "Restart now to install it, or it will install automatically the next time you quit.",
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (error) => {
    console.error("[updater]", error instanceof Error ? error.message : error);
  });

  const check = () => autoUpdater.checkForUpdates().catch((error) => {
    console.error("[updater] check failed", error instanceof Error ? error.message : error);
  });

  check();
  setInterval(check, UPDATE_CHECK_INTERVAL_MS).unref();
}

/* -------------------------------------------------------------------------- */
/*  OUTPUT FILE                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Opens the one persistent letters.xlsx directly in the user's spreadsheet
 * app, instead of the renderer triggering a browser-style download — a
 * download link would save a fresh, separately-named copy every time it's
 * clicked, which is the opposite of "everything in one table."
 */
ipcMain.handle("open-output-file", async () => {
  if (!dataDirPath) return { ok: false, error: "not ready yet" };
  const filePath = path.join(dataDirPath, "letters.xlsx");
  if (!fs.existsSync(filePath)) return { ok: false, error: "no letters processed yet" };
  const result = await shell.openPath(filePath);
  return result ? { ok: false, error: result } : { ok: true };
});

ipcMain.handle("open-output-folder", async () => {
  if (!dataDirPath) return { ok: false, error: "not ready yet" };
  const filePath = path.join(dataDirPath, "letters.xlsx");
  if (fs.existsSync(filePath)) shell.showItemInFolder(filePath);
  else shell.openPath(dataDirPath);
  return { ok: true };
});

/* -------------------------------------------------------------------------- */
/*  LIFECYCLE                                                                 */
/* -------------------------------------------------------------------------- */

// One instance only: a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();
    createWindow();
    try {
      const dataDir = app.getPath("userData");
      dataDirPath = dataDir;
      const inboxDir = path.join(dataDir, "Inbox");
      await repairPath();
      uploadServer = startUploadServer({ port: UPLOAD_PORT, inboxDir });
      const url = await startServer(dataDir);
      await mainWindow?.loadURL(url);
      setupAutoUpdater();
    } catch (error) {
      dialog.showErrorBox(
        "Letter Reader could not start",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    }
  });

  app.on("window-all-closed", () => app.quit());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
      createWindow().loadURL(`http://127.0.0.1:${serverPort}`);
    }
  });

  app.on("before-quit", () => {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill(IS_WINDOWS ? undefined : "SIGTERM");
    }
    if (uploadServer) uploadServer.close();
  });
}
