const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "firebase-public");
const relativeOutDir = path.relative(root, outDir);

if (!relativeOutDir || relativeOutDir.startsWith("..") || path.isAbsolute(relativeOutDir)) {
  throw new Error("Refusing to prepare Firebase output outside the app folder.");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(source, destination) {
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
}

function copyDirectory(source, destination, shouldSkip = () => false) {
  ensureDir(destination);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (shouldSkip(sourcePath, entry)) continue;
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath, shouldSkip);
    } else if (entry.isFile()) {
      copyFile(sourcePath, destinationPath);
    }
  }
}

function stripPrivateBackupReferences(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const sanitized = content
    .split(/\r?\n/)
    .filter((line) => !line.includes("bundled-backup.js"))
    .join("\n");
  fs.writeFileSync(filePath, `${sanitized.trimEnd()}\n`);
}

fs.rmSync(outDir, { recursive: true, force: true });
ensureDir(outDir);

["index.html", "manifest.webmanifest", "styles.css", "app.js", "sw.js"].forEach((fileName) => {
  copyFile(path.join(root, fileName), path.join(outDir, fileName));
});

copyDirectory(path.join(root, "assets"), path.join(outDir, "assets"));
copyDirectory(path.join(root, "js"), path.join(outDir, "js"), (_sourcePath, entry) => {
  return entry.isFile() && entry.name === "bundled-backup.js";
});

stripPrivateBackupReferences(path.join(outDir, "index.html"));
stripPrivateBackupReferences(path.join(outDir, "sw.js"));

console.log("Firebase hosting files prepared in firebase-public.");
