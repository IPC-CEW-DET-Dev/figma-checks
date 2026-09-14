import type { ComponentResult } from "../types.js";

/** A component passes when it has no error, no failing style tokens, and visual mismatch is within threshold. */
export function isComponentPassing(result: ComponentResult, thresholdPercent: number): boolean {
  if (result.error) return false;
  if (result.styleDiffs.some((d) => !d.pass)) return false;
  if (result.images && result.images.mismatchPercent > thresholdPercent) return false;
  return true;
}
