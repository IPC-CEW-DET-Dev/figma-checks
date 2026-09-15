import { readFile } from "node:fs/promises";
import path from "node:path";
import "dotenv/config";
import type { ManifestConfig, Viewport } from "../types.js";

export interface AppConfig {
  manifest: ManifestConfig;
  figmaToken: string;
}

// Raw JSON allows a component's "viewport" to be either an inline object or a string reference
// into the top-level "viewports" map; resolveViewport() normalizes it before anything else runs.
type RawManifestConfig = Omit<ManifestConfig, "components"> & {
  components: (Omit<ManifestConfig["components"][number], "viewport"> & { viewport?: Viewport | string })[];
};

function resolveViewport(
  viewport: Viewport | string | undefined,
  viewports: Record<string, Viewport> | undefined,
  context: string
): Viewport | undefined {
  if (viewport == null || typeof viewport !== "string") return viewport;
  const resolved = viewports?.[viewport];
  if (!resolved) {
    throw new Error(`${context} references unknown viewport "${viewport}". Define it under top-level "viewports".`);
  }
  return resolved;
}

export async function loadConfig(configPath = "components.config.json"): Promise<AppConfig> {
  const figmaToken = process.env.FIGMA_TOKEN;
  if (!figmaToken) {
    throw new Error("FIGMA_TOKEN is not set. Copy .env.example to .env and add your Figma personal access token.");
  }

  const raw = await readFile(path.resolve(configPath), "utf-8");
  const rawManifest = JSON.parse(raw) as RawManifestConfig;

  if (!Array.isArray(rawManifest.components) || rawManifest.components.length === 0) {
    throw new Error(`No components found in ${configPath}. Add at least one entry to "components".`);
  }

  const manifest: ManifestConfig = {
    ...rawManifest,
    components: rawManifest.components.map((component) => ({
      ...component,
      viewport: resolveViewport(component.viewport, rawManifest.viewports, `Component "${component.name}"`),
    })),
  };

  for (const component of manifest.components) {
    if (!component.name || !component.figma?.fileKey || !component.figma?.nodeId) {
      throw new Error(`Component entry is missing required "name" or "figma.fileKey"/"figma.nodeId": ${JSON.stringify(component)}`);
    }
    if (!component.production?.url || !component.production?.selector) {
      throw new Error(`Component "${component.name}" is missing required "production.url"/"production.selector".`);
    }
    for (const part of component.parts ?? []) {
      if (!part.name || !(part.figma?.layerName || part.figma?.nodeId)) {
        throw new Error(`Part in "${component.name}" is missing required "name" or "figma.layerName"/"figma.nodeId": ${JSON.stringify(part)}`);
      }
      if (!part.production?.selector) {
        throw new Error(`Part "${part.name}" in "${component.name}" is missing required "production.selector".`);
      }
    }
  }

  return { manifest, figmaToken };
}
