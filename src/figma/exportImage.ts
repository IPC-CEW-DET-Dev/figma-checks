import { writeFile } from "node:fs/promises";
import type { FigmaClient } from "./client.js";

/** Downloads the rendered PNG for a Figma node to disk and returns the local path. */
export async function exportFigmaImage(
  client: FigmaClient,
  fileKey: string,
  nodeId: string,
  destPath: string
): Promise<string> {
  const imageUrl = await client.getImageUrl(fileKey, nodeId);
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to download Figma image export (${res.status} ${res.statusText})`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
  return destPath;
}
