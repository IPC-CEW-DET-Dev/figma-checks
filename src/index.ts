import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "./config/loadConfig.js";
import type { ComponentResult, RunResult } from "./types.js";
import { FigmaClient } from "./figma/client.js";
import { extractStyleTokens } from "./figma/extractStyles.js";
import { exportFigmaImage } from "./figma/exportImage.js";
import { launchBrowser, newContext } from "./production/browser.js";
import { captureElement } from "./production/captureElement.js";
import { diffStyleTokens } from "./diff/styleDiff.js";
import { diffImages } from "./diff/visualDiff.js";

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export interface RunOptions {
  only?: string;
}

export async function runComparison(config: AppConfig, options: RunOptions = {}): Promise<RunResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
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
        const expectedTokens = extractStyleTokens(figmaNode);
        const figmaImagePath = await exportFigmaImage(
          figmaClient,
          component.figma.fileKey,
          component.figma.nodeId,
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

        const styleDiffs = diffStyleTokens(expectedTokens, captureResult.tokens, config.manifest.fontAliasOverrides);
        const visualDiff = await diffImages(
          figmaImagePath,
          captureResult.screenshotPath,
          path.join(componentDir, "diff.png")
        );

        results.push({ name: component.name, styleDiffs, visualDiff });
      } catch (err) {
        results.push({
          name: component.name,
          styleDiffs: [],
          visualDiff: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    await browser.close();
  }

  return { timestamp, outputDir, components: results };
}
