import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmIfExists(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  ensureDir(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const src = path.join(srcDir, e.name);
    const dest = path.join(destDir, e.name);
    if (e.isDirectory()) copyDir(src, dest);
    else if (e.isFile()) copyFile(src, dest);
  }
}

async function zipFolder(zipPath, cwdDir) {
  ensureDir(path.dirname(zipPath));

  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });

  archive.pipe(output);
  archive.directory(cwdDir, false);
  await archive.finalize();
  await done;
}

const manifestPath = path.join(repoRoot, 'manifest.json');
const manifest = readJson(manifestPath);
const version = manifest.version || '0.0.0';

const distDir = path.join(repoRoot, 'dist');
const stageDir = path.join(distDir, 'extension');
rmIfExists(stageDir);
ensureDir(stageDir);

// Only copy runtime files needed by the Chrome extension package.
const rootFiles = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'options.html',
  'options.js',
  'options.css',
];

for (const f of rootFiles) {
  copyFile(path.join(repoRoot, f), path.join(stageDir, f));
}

copyDir(path.join(repoRoot, 'utils'), path.join(stageDir, 'utils'));
copyDir(path.join(repoRoot, 'content'), path.join(stageDir, 'content'));
copyDir(path.join(repoRoot, 'icons'), path.join(stageDir, 'icons'));
copyDir(path.join(repoRoot, 'themes'), path.join(stageDir, 'themes'));

// Produce a Web Store ready ZIP. (Docs are intentionally excluded.)
const zipName = `twitch-stream-swapper-${version}.zip`;
const zipPath = path.join(distDir, zipName);
rmIfExists(zipPath);
await zipFolder(zipPath, stageDir);

console.log(`\nPackaged: ${zipPath}\n`);


