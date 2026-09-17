import { cp, copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const REPORTS_DIR = "reports";
const PUBLISH_DIR = path.join("docs", "reports");

/** The most-recently-modified run folder under reports/. */
async function newestRun(): Promise<string> {
  const entries = await readdir(REPORTS_DIR, { withFileTypes: true }).catch(() => {
    throw new Error(`No "${REPORTS_DIR}/" directory. Run "npm run compare" first.`);
  });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 0) throw new Error(`No runs found under "${REPORTS_DIR}/". Run "npm run compare" first.`);

  const withMtime = await Promise.all(
    dirs.map(async (d) => ({ name: d.name, mtimeMs: (await stat(path.join(REPORTS_DIR, d.name))).mtimeMs }))
  );
  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return path.join(REPORTS_DIR, withMtime[0].name);
}

async function main(): Promise<void> {
  const runDir = await newestRun();

  // Reset the published folder so components removed since the last publish don't linger.
  await rm(PUBLISH_DIR, { recursive: true, force: true });
  await mkdir(PUBLISH_DIR, { recursive: true });

  const entries = await readdir(runDir, { withFileTypes: true });
  for (const entry of entries) {
    await cp(path.join(runDir, entry.name), path.join(PUBLISH_DIR, entry.name), { recursive: true });
  }

  // GitHub Pages serves index.html at the folder URL, so mirror the report to it.
  await copyFile(path.join(runDir, "report.html"), path.join(PUBLISH_DIR, "index.html"));

  console.log(`Published ${runDir} -> ${PUBLISH_DIR}/ (report.html + index.html + assets)`);
}

main();
