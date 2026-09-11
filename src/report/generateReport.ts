import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { RunResult } from "../types.js";
import { isComponentPassing } from "./summary.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function relative(outputDir: string, filePath: string): string {
  return path.relative(outputDir, filePath);
}

export async function generateReport(run: RunResult, thresholdPercent: number): Promise<string> {
  const reportPath = path.join(run.outputDir, "report.html");

  const componentSections = run.components
    .map((result) => {
      const passing = isComponentPassing(result, thresholdPercent);
      const statusLabel = passing ? "PASS" : "FAIL";
      const statusClass = passing ? "pass" : "fail";

      if (result.error) {
        return `
        <section class="component ${statusClass}">
          <h2>${escapeHtml(result.name)} <span class="status">${statusLabel}</span></h2>
          <p class="error">Error: ${escapeHtml(result.error)}</p>
        </section>`;
      }

      const images = result.visualDiff
        ? `
        <div class="images">
          <figure><img src="${relative(run.outputDir, result.visualDiff.figmaImagePath)}" alt="Figma"><figcaption>Figma</figcaption></figure>
          <figure><img src="${relative(run.outputDir, result.visualDiff.productionImagePath)}" alt="Production"><figcaption>Production</figcaption></figure>
          <figure><img src="${relative(run.outputDir, result.visualDiff.diffImagePath)}" alt="Diff"><figcaption>Diff (${result.visualDiff.mismatchPercent.toFixed(2)}% mismatch)</figcaption></figure>
        </div>`
        : "";

      const rows = result.styleDiffs
        .map(
          (d) => `
          <tr class="${d.pass ? "pass" : "fail"}">
            <td>${escapeHtml(d.property)}</td>
            <td>${escapeHtml(d.expected ?? "—")}</td>
            <td>${escapeHtml(d.actual ?? "—")}</td>
            <td>${d.pass ? "✓" : "✗"}</td>
          </tr>`
        )
        .join("");

      return `
      <section class="component ${statusClass}">
        <h2>${escapeHtml(result.name)} <span class="status">${statusLabel}</span></h2>
        ${images}
        <table>
          <thead><tr><th>Property</th><th>Figma (expected)</th><th>Production (actual)</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join("\n");

  const passCount = run.components.filter((r) => isComponentPassing(r, thresholdPercent)).length;
  const totalCount = run.components.length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Component Comparison Report — ${escapeHtml(run.timestamp)}</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 2rem; color: #1a1a1a; }
  h1 { margin-bottom: 0.25rem; }
  .summary { color: #555; margin-bottom: 2rem; }
  .component { border: 1px solid #ddd; border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; }
  .component.fail { border-color: #e0554f; }
  .component.pass { border-color: #3aa76d; }
  .status { font-size: 0.85rem; padding: 0.15rem 0.5rem; border-radius: 4px; color: white; }
  .pass .status { background: #3aa76d; }
  .fail .status { background: #e0554f; }
  .images { display: flex; gap: 1rem; margin: 1rem 0; }
  .images figure { margin: 0; text-align: center; }
  .images img { max-width: 260px; border: 1px solid #eee; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
  th, td { border: 1px solid #eee; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.9rem; }
  tr.fail { background: #fdecea; }
  tr.pass { background: #eaf7ef; }
  .error { color: #e0554f; }
</style>
</head>
<body>
  <h1>Component Comparison Report</h1>
  <p class="summary">${escapeHtml(run.timestamp)} — ${passCount}/${totalCount} components passing (threshold: ${thresholdPercent}% visual mismatch)</p>
  ${componentSections}
</body>
</html>`;

  await writeFile(reportPath, html, "utf-8");
  return reportPath;
}
