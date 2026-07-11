const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageVersion = String(packageJson.version || "").trim();
const version = String(packageJson.appVersion || packageVersion).trim();

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageVersion)) {
  throw new Error(`Invalid npm package version "${packageVersion}". Use semantic versioning, for example 1.0.0.`);
}

if (!/^\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid app version "${version}". Use a release version such as 1.0 or 1.0.0.`);
}

const cacheName = `ad-smashers-manager-v${version}`;
const assetVersion = encodeURIComponent(version);

function readFile(fileName) {
  return fs.readFileSync(path.join(root, fileName), "utf8");
}

function writeFile(fileName, content) {
  fs.writeFileSync(path.join(root, fileName), `${content.trimEnd()}\n`);
}

function replaceRequired(content, pattern, replacement, fileName, label) {
  if (!pattern.test(content)) {
    throw new Error(`Could not find ${label} in ${fileName}.`);
  }
  return content.replace(pattern, replacement);
}

function syncIndexHtml() {
  const fileName = "index.html";
  const content = replaceRequired(readFile(fileName), /\?v=[^"']+/g, `?v=${assetVersion}`, fileName, "asset versions");
  writeFile(fileName, content);
}

function syncServiceWorker() {
  const fileName = "sw.js";
  let content = readFile(fileName);
  content = replaceRequired(content, /const CACHE_NAME = "ad-smashers-manager-[^"]+";/, `const CACHE_NAME = "${cacheName}";`, fileName, "cache name");
  content = replaceRequired(content, /\?v=[^"']+/g, `?v=${assetVersion}`, fileName, "asset versions");
  writeFile(fileName, content);
}

function syncConfig() {
  const fileName = "js/config.js";
  let content = readFile(fileName);
  if (/const APP_VERSION = "[^"]+";/.test(content)) {
    content = content.replace(/const APP_VERSION = "[^"]+";/, `const APP_VERSION = "${version}";`);
  } else {
    content = replaceRequired(
      content,
      /const APP_BUILD_VERSION = "[^"]+";/,
      `const APP_VERSION = "${version}";\nconst APP_BUILD_VERSION = APP_VERSION;`,
      fileName,
      "app version"
    );
  }
  if (!/const APP_BUILD_VERSION = APP_VERSION;/.test(content)) {
    content = content.replace(/const APP_VERSION = "[^"]+";/, `const APP_VERSION = "${version}";\nconst APP_BUILD_VERSION = APP_VERSION;`);
  }
  writeFile(fileName, content);
}

function syncManifest() {
  const fileName = "manifest.webmanifest";
  let content = readFile(fileName);
  if (/"version"\s*:/.test(content)) {
    content = content.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${version}"`);
  } else {
    content = replaceRequired(content, /("description"\s*:\s*"[^"]+",)/, `$1\n  "version": "${version}",`, fileName, "description");
  }
  writeFile(fileName, content);
}

syncIndexHtml();
syncServiceWorker();
syncConfig();
syncManifest();

console.log(`App release version synced: ${version}`);
