import { readFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import type { ManifestConfig } from "../types.js";

export interface AppConfig {
  manifest: ManifestConfig;
  figmaToken: string;
}

export async function loadConfig(configPath = "components.config.json"): Promise<AppConfig> {
  const figmaToken = process.env.FIGMA_TOKEN;
  if (!figmaToken) {
    throw new Error("FIGMA_TOKEN is not set. Copy .env.example to .env and add your Figma personal access token.");
  }

  const raw = await readFile(path.resolve(configPath), "utf-8");
  const manifest = JSON.parse(raw) as ManifestConfig;

  if (!Array.isArray(manifest.components) || manifest.components.length === 0) {
    throw new Error(`No components found in ${configPath}. Add at least one entry to "components".`);
  }

  for (const component of manifest.components) {
    if (!component.name || !component.figma?.fileKey || !component.figma?.nodeId) {
      throw new Error(`Component entry is missing required "name" or "figma.fileKey"/"figma.nodeId": ${JSON.stringify(component)}`);
    }
    if (!component.production?.url || !component.production?.selector) {
      throw new Error(`Component "${component.name}" is missing required "production.url"/"production.selector".`);
    }
  }

  return { manifest, figmaToken };
}
