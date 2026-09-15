import type { ComponentResult } from "../types.js";

/**
 * A component passes when it has no error, visual mismatch is within threshold, and its style
 * diffs pass. `hideGeneralTable` opts a component out of counting its own top-level diff — set
 * when `parts` fully replace it (e.g. header+body making the combined top-level diff ambiguous).
 */
export function isComponentPassing(result: ComponentResult, thresholdPercent: number): boolean {
  if (result.error) return false;
  if (result.hideGeneralTable) {
    if (result.parts.some((p) => p.error || p.styleDiffs.some((d) => !d.pass))) return false;
  } else {
    if (result.styleDiffs.some((d) => !d.pass)) return false;
    if (result.parts.some((p) => p.error || p.styleDiffs.some((d) => !d.pass))) return false;
  }
  if (result.images && result.images.mismatchPercent > thresholdPercent) return false;
  return true;
}
