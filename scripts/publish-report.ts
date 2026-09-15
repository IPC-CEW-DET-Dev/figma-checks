import { readdir, stat, rm, cp, copyFile } from "node:fs/promises";
import path from "node:path";

const reportsDir = "reports";
const publishDir = path.join("docs", "reports");

const entries = await readdir(reportsDir, { withFileTypes: true });
const dirs = entries.filter((e) => e.isDirectory());

if (dirs.length === 0) {
  console.error(`No report runs found under ${reportsDir}/. Run "npm run compare" first.`);
  process.exit(1);
}

// Folder names are a human-friendly timestamp (e.g. "9-03am" vs "10-01am"), which doesn't sort
// correctly as a plain string — use actual modification time to find the most recent run instead.
let latestName = dirs[0].name;
let latestMtime = 0;
for (const dir of dirs) {
  const info = await stat(path.join(reportsDir, dir.name));
  if (info.mtimeMs > latestMtime) {
    latestMtime = info.mtimeMs;
    latestName = dir.name;
  }
}

const sourceDir = path.join(reportsDir, latestName);
await rm(publishDir, { recursive: true, force: true });
await cp(sourceDir, publishDir, { recursive: true });
await copyFile(path.join(publishDir, "report.html"), path.join(publishDir, "index.html"));

console.log(`Published "${sourceDir}" to "${publishDir}" — commit and push docs/ to update the GitHub Pages site.`);
