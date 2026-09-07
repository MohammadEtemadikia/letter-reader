/**
 * Copies the built Next.js server into the packaged app.
 *
 * This is deliberately done here rather than through electron-builder's
 * `extraResources`: that mechanism filters out any directory named
 * `node_modules`, even with an explicit glob filter. The result was an app
 * that launched and then died with "Cannot find module 'next'" — a failure that
 * only appears in the packaged build, never in development.
 */
const fs = require("fs");
const path = require("path");

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const source = path.join(packager.projectDir, ".next", "standalone");

  if (!fs.existsSync(source)) {
    throw new Error(
      'Missing .next/standalone. Run "npm run build:app" before packaging.',
    );
  }

  const resources =
    electronPlatformName === "darwin"
      ? path.join(
          appOutDir,
          `${packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources",
        )
      : path.join(appOutDir, "resources");

  const destination = path.join(resources, "server");
  await fs.promises.rm(destination, { recursive: true, force: true });
  await fs.promises.cp(source, destination, {
    recursive: true,
    dereference: true,
  });

  // Fail loudly here rather than shipping a bundle that cannot boot.
  const entry = path.join(destination, "server.js");
  const runtime = path.join(destination, "node_modules", "next");
  for (const required of [entry, runtime]) {
    if (!fs.existsSync(required)) {
      throw new Error(`Packaged server is incomplete: ${required} is missing.`);
    }
  }

  const count = fs.readdirSync(path.join(destination, "node_modules")).length;
  console.log(
    `  • bundled Next.js server  ${path.relative(appOutDir, destination)} (${count} modules)`,
  );
};
