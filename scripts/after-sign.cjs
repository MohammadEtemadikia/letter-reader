/**
 * Ad-hoc code-signs the packaged macOS app.
 *
 * This app ships without a paid Apple Developer ID (see `identity: null` in
 * electron-builder.yml), but a completely *unsigned* .app fails Gatekeeper's
 * signature check hard enough that macOS reports it as "is damaged and can't
 * be opened" instead of the milder, bypassable "unidentified developer"
 * warning. Ad-hoc signing (identity "-") gives it a valid, if anonymous,
 * signature — downgrading the failure to the normal warning, which users can
 * get past via System Settings → Privacy & Security → "Open Anyway".
 */
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--deep", "--force", "--sign", "-", appPath], { stdio: "inherit" });
  console.log(`  • ad-hoc signed  ${path.basename(appPath)}`);
};
