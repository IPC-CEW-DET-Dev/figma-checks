import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Browser } from "playwright";
import type { AppConfig } from "./config/loadConfig.js";
import type { ComponentPartResult, ComponentResult, ComponentSpec, RunResult } from "./types.js";
import { FigmaClient } from "./figma/client.js";
import type { FigmaNode } from "./figma/client.js";
import { extractStyleTokens } from "./figma/extractStyles.js";
import { exportFigmaImage } from "./figma/exportImage.js";
import { resolveComponentVariant, findNodeByName } from "./figma/resolveVariant.js";
import { launchBrowser, newContext } from "./production/browser.js";
import { captureElement } from "./production/captureElement.js";
import { diffStyleTokens } from "./diff/styleDiff.js";
import { diffImages } from "./diff/visualDiff.js";

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Node's `fetch` wraps network failures in a generic "fetch failed" error with the real cause nested underneath. */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.message];
  let cause = err.cause;
  while (cause instanceof Error) {
    parts.push(cause.message);
    cause = cause.cause;
  }
  return parts.join(" — caused by: ");
}

/** e.g. "2026-09-11_2-30-05pm" — sortable, filesystem-safe, and readable at a glance. */
function formatTimestamp(date: Date): string {
  const datePart = date.toLocaleDateString("en-CA"); // YYYY-MM-DD
  const timePart = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })
    .replace(/:/g, "-")
    .replace(/\s/g, "")
    .toLowerCase();
  return `${datePart}_${timePart}`;
}

/** e.g. "09-11-26, 2:41pm" — for display in the report itself. */
function formatDisplayTimestamp(date: Date): string {
  const datePart = date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }).replace(/\//g, "-");
  const timePart = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, "")
    .toLowerCase();
  return `${datePart}, ${timePart}`;
}

export interface RunOptions {
  only?: string;
}

export async function runComparison(config: AppConfig, options: RunOptions = {}): Promise<RunResult> {
  const now = new Date();
  const timestamp = formatTimestamp(now);
  const displayTimestamp = formatDisplayTimestamp(now);
  const outputDir = path.join("reports", timestamp);
  await mkdir(outputDir, { recursive: true });

  const components = options.only
    ? config.manifest.components.filter((c) => c.name === options.only)
    : config.manifest.components;

  if (components.length === 0) {
    throw new Error(options.only ? `No component named "${options.only}" found in manifest.` : "No components to run.");
  }

  const figmaClient = new FigmaClient({ token: config.figmaToken });
  const browser = await launchBrowser();
  const results: ComponentResult[] = [];

  try {
    for (const component of components) {
      const componentDir = path.join(outputDir, sanitizeName(component.name));
      await mkdir(componentDir, { recursive: true });

      try {
        const figmaNode = await figmaClient.getNode(component.figma.fileKey, component.figma.nodeId);
        const variantNode = resolveComponentVariant(figmaNode, component.figma.variantName);
        const expectedTokens = extractStyleTokens(variantNode);
        const figmaImagePath = await exportFigmaImage(
          figmaClient,
          component.figma.fileKey,
          variantNode.id,
          path.join(componentDir, "figma.png")
        );

        const context = await newContext(browser, component.viewport);
        let captureResult;
        try {
          captureResult = await captureElement(
            context,
            component.production.url,
            component.production.selector,
            path.join(componentDir, "production.png")
          );
        } finally {
          await context.close();
        }

        const styleDiffs = diffStyleTokens(expectedTokens, captureResult.tokens, config.manifest.fontAliasOverrides, component.compare);
        const { mismatchPercent, diffImagePath } = await diffImages(
          figmaImagePath,
          captureResult.screenshotPath,
          path.join(componentDir, "diff.png")
        );

        const parts = await runParts(component, variantNode, figmaClient, browser, componentDir, config.manifest.fontAliasOverrides);

        results.push({
          name: component.name,
          figma: component.figma,
          production: component.production,
          styleDiffs,
          parts,
          hideGeneralTable: component.hideGeneralTable,
          images: {
            figmaImagePath,
            productionImagePath: captureResult.screenshotPath,
            diffImagePath,
            mismatchPercent,
          },
        });
      } catch (err) {
        results.push({
          name: component.name,
          figma: component.figma,
          production: component.production,
          styleDiffs: [],
          parts: [],
          hideGeneralTable: component.hideGeneralTable,
          images: null,
          error: describeError(err),
        });
      }
    }
  } finally {
    await browser.close();
  }

  await pruneOldReports("reports", 3);

  return { timestamp, displayTimestamp, outputDir, components: results };
}

/** Keeps only the `keep` most-recently-modified run folders under `reportsDir`, deleting the rest. */
async function pruneOldReports(reportsDir: string, keep: number): Promise<void> {
  const entries = await readdir(reportsDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());

  const withMtime = await Promise.all(
    dirs.map(async (d) => ({ name: d.name, mtimeMs: (await stat(path.join(reportsDir, d.name))).mtimeMs }))
  );
  withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const dir of withMtime.slice(keep)) {
    await rm(path.join(reportsDir, dir.name), { recursive: true, force: true });
  }
}

/** Runs each declared sub-section independently, so composite components get unambiguous per-part style diffs. */
async function runParts(
  component: ComponentSpec,
  parentFigmaNode: FigmaNode,
  figmaClient: FigmaClient,
  browser: Browser,
  componentDir: string,
  fontAliasOverrides: Record<string, string> | undefined
): Promise<ComponentPartResult[]> {
  const results: ComponentPartResult[] = [];

  for (const part of component.parts ?? []) {
    try {
      let partNode: FigmaNode;
      if (part.figma.layerName) {
        const found = findNodeByName(parentFigmaNode, part.figma.layerName);
        if (!found) {
          throw new Error(`No layer named "${part.figma.layerName}" found within "${component.name}"'s Figma node.`);
        }
        partNode = found;
      } else if (part.figma.nodeId) {
        const figmaNode = await figmaClient.getNode(component.figma.fileKey, part.figma.nodeId);
        partNode = resolveComponentVariant(figmaNode, part.figma.variantName);
      } else {
        throw new Error(`Part "${part.name}" must specify figma.layerName or figma.nodeId.`);
      }
      const expectedTokens = extractStyleTokens(partNode);

      const context = await newContext(browser, component.viewport);
      let captureResult;
      try {
        captureResult = await captureElement(
          context,
          component.production.url,
          part.production.selector,
          path.join(componentDir, `part-${sanitizeName(part.name)}.png`)
        );
      } finally {
        await context.close();
      }

      const styleDiffs = diffStyleTokens(expectedTokens, captureResult.tokens, fontAliasOverrides, part.compare);
      results.push({ name: part.name, figma: part.figma, production: part.production, styleDiffs });
    } catch (err) {
      results.push({ name: part.name, figma: part.figma, production: part.production, styleDiffs: [], error: describeError(err) });
    }
  }

  return results;
}
