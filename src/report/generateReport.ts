import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { ComponentPartResult, RunResult, StyleDiffEntry } from "../types.js";
import { isComponentPassing } from "./summary.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function relative(outputDir: string, filePath: string): string {
  return path.relative(outputDir, filePath);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function renderPartMeta(part: ComponentPartResult): string {
  const figmaRef = part.figma.layerName
    ? `layer <code>${escapeHtml(part.figma.layerName)}</code>`
    : part.figma.nodeId
      ? `node <code>${escapeHtml(part.figma.nodeId)}</code>`
      : "—";
  const figmaExclude = part.figma.excludeLayerName
    ? ` <span class="meta-note">(excluding layer <code>${escapeHtml(part.figma.excludeLayerName)}</code>)</span>`
    : "";
  const selectorExclude = part.production.excludeSelector
    ? ` <span class="meta-note">(excluding <code>${escapeHtml(part.production.excludeSelector)}</code>)</span>`
    : "";

  return `
    <p class="part-meta">
      Figma: ${figmaRef}${figmaExclude} &middot; Selector: <code>${escapeHtml(part.production.selector)}</code>${selectorExclude}
    </p>`;
}

function renderStyleTable(styleDiffs: StyleDiffEntry[]): string {
  const rows = styleDiffs
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
    <table>
      <colgroup><col class="col-property"><col class="col-value"><col class="col-value"><col class="col-status"></colgroup>
      <thead><tr><th>Property</th><th>Figma (expected)</th><th>Production (actual)</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export async function generateReport(run: RunResult, thresholdPercent: number): Promise<string> {
  const reportPath = path.join(run.outputDir, "report.html");

  const componentSections = run.components
    .map((result) => {
      const passing = isComponentPassing(result, thresholdPercent);
      const statusLabel = passing ? "PASS" : "FAIL";
      const statusClass = passing ? "pass" : "fail";
      const anchorId = slugify(result.name);

      const nodeIdUrlSafe = result.figma.nodeId.replace(/:/g, "-");
      const figmaUrl = `https://www.figma.com/design/${result.figma.fileKey}?node-id=${nodeIdUrlSafe}`;
      const metadata = `
        <dl class="meta">
          <div class="meta-row"><dt>Figma</dt><dd><a href="${escapeHtml(figmaUrl)}" target="_blank" rel="noopener">${escapeHtml(result.figma.fileKey)} / ${escapeHtml(result.figma.nodeId)}</a>${result.figma.variantName ? ` <span class="meta-note">(variant: ${escapeHtml(result.figma.variantName)})</span>` : ""}${result.figma.excludeLayerName ? `<br><span class="meta-note">excluding layer <code>${escapeHtml(result.figma.excludeLayerName)}</code></span>` : ""}</dd></div>
          <div class="meta-row"><dt>Production</dt><dd><a href="${escapeHtml(result.production.url)}" target="_blank" rel="noopener">${escapeHtml(result.production.url)}</a></dd></div>
          <div class="meta-row"><dt>Selector</dt><dd><code>${escapeHtml(result.production.selector)}</code>${result.production.excludeSelector ? `<br><span class="meta-note">excluding <code>${escapeHtml(result.production.excludeSelector)}</code></span>` : ""}</dd></div>
        </dl>`;

      if (result.error) {
        return `
        <section class="component ${statusClass}" id="${anchorId}">
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
          <figure><figcaption>Diff (${result.images.mismatchPercent.toFixed(2)}% mismatch)</figcaption><img src="${relative(run.outputDir, result.images.diffImagePath)}" alt="Diff"></figure>
        </div>`
        : "";

      const partSections = result.parts
        .map(
          (part) => `
          <div class="part">
            <h3>${escapeHtml(part.name)}</h3>
            ${renderPartMeta(part)}
            ${part.error ? `<p class="error">Error: ${escapeHtml(part.error)}</p>` : renderStyleTable(part.styleDiffs)}
          </div>`
        )
        .join("");

      return `
      <section class="component ${statusClass}" id="${anchorId}">
        <header class="component-header">
          <h2>${escapeHtml(result.name)}</h2>
          <span class="status">${statusLabel}</span>
        </header>
        <div class="component-body">
          <div class="side">
            ${images}
            ${metadata}
          </div>
          <div class="details">
            ${result.hideGeneralTable ? "" : renderStyleTable(result.styleDiffs)}
            ${partSections}
          </div>
        </div>
      </section>`;
    })
    .join("\n");

  const passCount = run.components.filter((r) => isComponentPassing(r, thresholdPercent)).length;
  const totalCount = run.components.length;
  const allPassing = totalCount > 0 && passCount === totalCount;

  const navOptions = run.components
    .map((r) => {
      const passing = isComponentPassing(r, thresholdPercent);
      return `<option value="${slugify(r.name)}">${passing ? "✓" : "✗"} ${escapeHtml(r.name)}</option>`;
    })
    .join("");

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
    padding: 0 2rem 3rem;
  }
  .page { max-width: 1180px; margin: 0 auto; }
  .page-header {
    display: flex; align-items: center; justify-content: space-between; gap: 1rem;
    position: sticky; top: 0; z-index: 20;
    background: #f4f5f7; padding: 1.5rem 0; margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--border);
  }
  h1 { font-size: 1.3rem; margin: 0; letter-spacing: -0.01em; }
  .run-meta { color: var(--muted); font-size: 0.85rem; margin-top: 0.2rem; }
  .nav-controls { display: flex; align-items: center; gap: 0.75rem; }
  #component-nav {
    font-size: 0.85rem; padding: 0.45rem 0.7rem; border-radius: 6px;
    border: 1px solid var(--border); background: white; color: var(--text); max-width: 260px;
  }
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
    scroll-margin-top: 5.5rem;
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
  .meta { margin: 0; }
  .meta-row { display: flex; flex-direction: column; gap: 0.15rem; margin-bottom: 0.85rem; }
  .meta-row:last-child { margin-bottom: 0; }
  .meta dt { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); }
  .meta dd { margin: 0; font-size: 0.85rem; overflow-wrap: anywhere; }
  .meta a { color: #2757c9; text-decoration: none; }
  .meta a:hover { text-decoration: underline; }
  .meta-note { color: var(--muted); }
  .images { display: flex; flex-direction: column; gap: 0.85rem; margin-bottom: 1.25rem; }
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
  .part { margin-top: 1.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border); }
  .part h3 { font-size: 0.85rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 0 0 0.6rem; }
  .part-meta { font-size: 0.8rem; color: var(--muted); margin: -0.3rem 0 0.75rem; overflow-wrap: anywhere; }
</style>
</head>
<body>
  <div class="page">
    <div class="page-header">
      <div>
        <h1>Component Comparison Report</h1>
        <div class="run-meta">${escapeHtml(run.displayTimestamp)} · threshold: ${thresholdPercent}% visual mismatch</div>
      </div>
      <div class="nav-controls">
        <select id="component-nav" onchange="if(this.value){document.getElementById(this.value).scrollIntoView({behavior:'smooth',block:'start'});}">
          <option value="">Jump to component…</option>
          ${navOptions}
        </select>
        <span class="summary-pill">${passCount}/${totalCount} passing</span>
      </div>
    </div>
    ${componentSections}
  </div>
</body>
</html>`;

  await writeFile(reportPath, html, "utf-8");
  return reportPath;
}
