import type { ComponentResult } from "../types.js";

/**
 * A component passes when it has no error, visual mismatch is within threshold, and its style
 * diffs pass. When `parts` are declared, the top-level style diff is ambiguous/noisy (see
 * generateReport) and is ignored in favor of each part's own diff.
 */
export function isComponentPassing(result: ComponentResult, thresholdPercent: number): boolean {
  if (result.error) return false;
  if (result.parts.length > 0) {
    if (result.parts.some((p) => p.error || p.styleDiffs.some((d) => !d.pass))) return false;
  } else if (result.styleDiffs.some((d) => !d.pass)) {
    return false;
  }
  if (result.images && result.images.mismatchPercent > thresholdPercent) return false;
  return true;
}
