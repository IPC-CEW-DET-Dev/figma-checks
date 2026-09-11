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

export async function generateReport(run: RunResult): Promise<string> {
  const reportPath = path.join(run.outputDir, "report.html");

  const componentSections = run.components
    .map((result) => {
      const passing = isComponentPassing(result);
      const statusLabel = passing ? "PASS" : "FAIL";
      const statusClass = passing ? "pass" : "fail";

      const nodeIdUrlSafe = result.figma.nodeId.replace(/:/g, "-");
      const figmaUrl = `https://www.figma.com/design/${result.figma.fileKey}?node-id=${nodeIdUrlSafe}`;
      const metadata = `
        <dl class="meta">
          <div class="meta-row"><dt>Figma</dt><dd><a href="${escapeHtml(figmaUrl)}" target="_blank" rel="noopener">${escapeHtml(result.figma.fileKey)} / ${escapeHtml(result.figma.nodeId)}</a>${result.figma.variantName ? ` <span class="meta-note">(variant: ${escapeHtml(result.figma.variantName)})</span>` : ""}</dd></div>
          <div class="meta-row"><dt>Production</dt><dd><a href="${escapeHtml(result.production.url)}" target="_blank" rel="noopener">${escapeHtml(result.production.url)}</a></dd></div>
          <div class="meta-row"><dt>Selector</dt><dd><code>${escapeHtml(result.production.selector)}</code>${result.production.excludeSelector ? `<br><span class="meta-note">excluding <code>${escapeHtml(result.production.excludeSelector)}</code></span>` : ""}</dd></div>
        </dl>`;

      if (result.error) {
        return `
        <section class="component ${statusClass}">
          <header class="component-header">
            <h2>${escapeHtml(result.name)}</h2>
            <span class="status">${statusLabel}</span>
          </header>
          <div class="component-body">
            <div class="side">${metadata}</div>
            <div class="details"><p class="error">Error: ${escapeHtml(result.error)}</p></div>
          </div>
        </section>`;
      }

      const images = result.images
        ? `
        <div class="images">
          <figure><figcaption>Figma</figcaption><img src="${relative(run.outputDir, result.images.figmaImagePath)}" alt="Figma"></figure>
          <figure><figcaption>Production</figcaption><img src="${relative(run.outputDir, result.images.productionImagePath)}" alt="Production"></figure>
        </div>`
        : "";

      const rows = result.styleDiffs
        .map(
          (d) => `
          <tr class="${d.pass ? "pass" : "fail"}">
            <td>${escapeHtml(d.property)}</td>
            <td><code>${escapeHtml(d.expected ?? "—")}</code></td>
            <td><code>${escapeHtml(d.actual ?? "—")}</code></td>
            <td class="status-cell">${d.pass ? "✓" : "✗"}</td>
          </tr>`
        )
        .join("");

      return `
      <section class="component ${statusClass}">
        <header class="component-header">
          <h2>${escapeHtml(result.name)}</h2>
          <span class="status">${statusLabel}</span>
        </header>
        <div class="component-body">
          <div class="side">
            ${metadata}
            ${images}
          </div>
          <div class="details">
            <table>
              <colgroup><col class="col-property"><col class="col-value"><col class="col-value"><col class="col-status"></colgroup>
              <thead><tr><th>Property</th><th>Figma (expected)</th><th>Production (actual)</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      </section>`;
    })
    .join("\n");

  const passCount = run.components.filter((r) => isComponentPassing(r)).length;
  const totalCount = run.components.length;
  const allPassing = totalCount > 0 && passCount === totalCount;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Component Comparison Report — ${escapeHtml(run.displayTimestamp)}</title>
<style>
  :root {
    --pass: #1e8e5a;
    --pass-bg: #e8f7ef;
    --fail: #c62a2a;
    --fail-bg: #fdeceb;
    --border: #e3e6ea;
    --text: #1a1d21;
    --muted: #6b7280;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--text);
    background: #f4f5f7;
    margin: 0;
    padding: 3rem 2rem;
  }
  .page { max-width: 1180px; margin: 0 auto; }
  .page-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 2rem; }
  h1 { font-size: 1.5rem; margin: 0; letter-spacing: -0.01em; }
  .run-meta { color: var(--muted); font-size: 0.9rem; margin-top: 0.3rem; }
  .summary-pill {
    font-size: 0.9rem; font-weight: 600; padding: 0.4rem 0.9rem; border-radius: 999px;
    background: ${allPassing ? "var(--pass-bg)" : "var(--fail-bg)"};
    color: ${allPassing ? "var(--pass)" : "var(--fail)"};
    white-space: nowrap;
  }
  .component {
    background: white;
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
    margin-bottom: 1.5rem;
    overflow: hidden;
  }
  .component-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem 1.5rem; border-bottom: 1px solid var(--border);
  }
  .component-header h2 { font-size: 1.05rem; margin: 0; }
  .status {
    font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em;
    padding: 0.25rem 0.6rem; border-radius: 6px;
  }
  .pass .status { background: var(--pass-bg); color: var(--pass); }
  .fail .status { background: var(--fail-bg); color: var(--fail); }
  .component-body { display: grid; grid-template-columns: 300px 1fr; gap: 0; }
  .side { padding: 1.25rem 1.5rem; border-right: 1px solid var(--border); background: #fafbfc; }
  .details { padding: 1.25rem 1.5rem; overflow-x: auto; }
  .meta { margin: 0 0 1.25rem; }
  .meta-row { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.85rem; }
  .meta-row:last-child { margin-bottom: 0; }
  .meta dt { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  .meta dd { margin: 0; font-size: 0.85rem; overflow-wrap: anywhere; }
  .meta a { color: #2757c9; text-decoration: none; }
  .meta a:hover { text-decoration: underline; }
  .meta-note { color: var(--muted); }
  .images { display: flex; flex-direction: column; gap: 0.85rem; }
  .images figure { margin: 0; }
  .images figcaption { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin-bottom: 0.35rem; }
  .images img { display: block; width: 100%; border: 1px solid var(--border); border-radius: 6px; background: white; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  .col-property { width: 30%; }
  .col-status { width: 2.5rem; }
  th { text-align: left; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); padding: 0.5rem 0.75rem; border-bottom: 2px solid var(--border); }
  td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  td code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; }
  tr.fail td:first-child { border-left: 3px solid var(--fail); }
  tr.pass td:first-child { border-left: 3px solid var(--pass); }
  tr.fail { background: var(--fail-bg); }
  tr.pass td { color: var(--muted); }
  .status-cell { text-align: center; font-weight: 700; }
  tr.pass .status-cell { color: var(--pass); }
  tr.fail .status-cell { color: var(--fail); }
  .error { color: var(--fail); font-size: 0.9rem; }
</style>
</head>
<body>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Component Comparison Report</h1>
        <div class="run-meta">${escapeHtml(run.displayTimestamp)}</div>
      </div>
      <span class="summary-pill">${passCount}/${totalCount} passing</span>
    </div>
    ${componentSections}
  </div>
</body>
</html>`;

  await writeFile(reportPath, html, "utf-8");
  return reportPath;
}
