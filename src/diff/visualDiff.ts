import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export interface VisualDiffResult {
  mismatchPercent: number;
  diffImagePath: string;
}

/** Resizes the production screenshot to the Figma export's dimensions and diffs pixel-by-pixel. */
export async function diffImages(
  figmaImagePath: string,
  productionImagePath: string,
  diffImagePath: string
): Promise<VisualDiffResult> {
  const figmaBuffer = await readFile(figmaImagePath);
  const figmaPng = PNG.sync.read(figmaBuffer);

  const resizedProductionBuffer = await sharp(productionImagePath)
    .resize(figmaPng.width, figmaPng.height, { fit: "fill" })
    .png()
    .toBuffer();
  const productionPng = PNG.sync.read(resizedProductionBuffer);

  const { width, height } = figmaPng;
  const diffPng = new PNG({ width, height });

  const mismatchedPixels = pixelmatch(
    figmaPng.data,
    productionPng.data,
    diffPng.data,
    width,
    height,
    { threshold: 0.1 }
  );

  await writeFile(diffImagePath, PNG.sync.write(diffPng));

  return {
    mismatchPercent: (mismatchedPixels / (width * height)) * 100,
    diffImagePath,
  };
}
